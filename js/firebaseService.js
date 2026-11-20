import { auth, googleProvider, db } from "../firebase-config.js";
import {
  signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  ref, set, get, update, push, query, limitToLast,
  onValue, onChildAdded, remove, onDisconnect, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { MAP_SIZE, BOSS_SPAWNS, BOSS_RESPAWN_MS, EVENT_DURATION_MS, EVENT_INTERVAL_MS } from "./config.js";
import { getEventList } from "./registries.js";

export function initAuthObserver(onUserReady, onUserLoggedOut) {
  getRedirectResult(auth).catch(() => {});
  return onAuthStateChanged(auth, (user) => {
    if (user) onUserReady(user);
    else onUserLoggedOut();
  });
}

export async function loginGoogle() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    if (err.code === "auth/popup-blocked") {
      await signInWithRedirect(auth, googleProvider);
    } else {
      throw err;
    }
  }
}

export const logoutGoogle = () => signOut(auth);

export async function loadUserProfile(uid, defaultFactory) {
  const snap = await get(ref(db, `users/${uid}`));
  if (!snap.exists()) {
    const fresh = defaultFactory();
    await set(ref(db, `users/${uid}`), fresh);
    return fresh;
  }
  return snap.val();
}

export const saveUserProfile = (uid, data) => set(ref(db, `users/${uid}`), data);
export const saveUserNickname = (uid, nickname) => update(ref(db, `users/${uid}`), { nickname });

export async function fetchTopLeaderboard(limit = 5) {
  const snap = await get(ref(db, "users"));
  if (!snap.exists()) return [];
  return Object.values(snap.val())
    .sort((a, b) => (b.bestScore || 0) - (a.bestScore || 0))
    .slice(0, limit);
}

// ==================== CHAT SERVICE ====================
export function subscribeChatMessages(limitCount, callback) {
  const chatQuery = query(ref(db, "chat/messages"), limitToLast(limitCount));
  return onValue(chatQuery, (snap) => {
    const data = snap.val();
    const list = data ? Object.values(data).sort((a, b) => a.createdAt - b.createdAt) : [];
    callback(list);
  });
}

export function sendChatMessage(uid, name, text) {
  return push(ref(db, "chat/messages"), {
    uid, name, text: text.slice(0, 120), createdAt: Date.now()
  });
}

// ==================== ROOM & WORLD SYNC ====================
let roomUnsubs = [];

export async function resetWorldMap() {
  const bossTier = 2;
  const maxHp = 600 + bossTier * 450;
  const bossesInit = {};
  BOSS_SPAWNS.forEach((sp, idx) => {
    bossesInit[sp.id] = {
      id: sp.id, name: sp.name, alive: true, tier: bossTier, level: 10,
      x: sp.x, y: sp.y, homeX: sp.x, homeY: sp.y, angle: idx * 2,
      hp: maxHp, maxHp, dmg: 28 + bossTier * 12, respawnAt: 0, lastHitBy: ""
    };
  });
  const now = Date.now();
  await set(ref(db, "rooms/main/bosses"), bossesInit);
  await set(ref(db, "rooms/main/event"), {
    active: false, type: "", startedAt: 0, endsAt: 0, nextEventAt: now + 60000
  });
  await remove(ref(db, "rooms/main/hits"));
}

export async function joinGameRoom(uid, callbacks) {
  const playersSnap = await get(ref(db, "rooms/main/players"));
  const existing = playersSnap.val() || {};
  const now = Date.now();
  let activeOthers = 0;

  for (const [otherUid, p] of Object.entries(existing)) {
    if (otherUid !== uid) {
      if (p.updatedAt && now - p.updatedAt < 15000) activeOthers++;
      else remove(ref(db, `rooms/main/players/${otherUid}`));
    }
  }
  if (activeOthers === 0) {
    await resetWorldMap();
  }

  const myRef = ref(db, `rooms/main/players/${uid}`);
  onDisconnect(myRef).remove();

  const hitsRef = ref(db, `rooms/main/hits/${uid}`);
  onDisconnect(hitsRef).remove();

  roomUnsubs.push(onValue(ref(db, "rooms/main/players"), (snap) => {
    const data = snap.val() || {};
    delete data[uid];
    callbacks.onPlayersChange(data);
  }));

  roomUnsubs.push(onChildAdded(hitsRef, (snap) => {
    const hit = snap.val();
    remove(snap.ref);
    if (hit) callbacks.onIncomingHit(hit);
  }));

  roomUnsubs.push(onValue(ref(db, "rooms/main/bosses"), (snap) => {
    const val = snap.val() || {};
    callbacks.onBossesChange(val);
    if (Object.keys(val).length === 0 && callbacks.isHost()) {
      resetWorldMap();
    }
  }));

  roomUnsubs.push(onValue(ref(db, "rooms/main/event"), (snap) => {
    callbacks.onEventChange(snap.val());
  }));
}

export const pushPlayerState = (uid, payload) => set(ref(db, `rooms/main/players/${uid}`), payload);

export function pushPvpHit(targetUid, payload) {
  const hitId = payload.fromUid + "_" + Date.now() + "_" + Math.floor(Math.random() * 999);
  return set(ref(db, `rooms/main/hits/${targetUid}/${hitId}`), payload);
}

export function runBossDamageTransaction(bossId, uid, dmg, onKilled) {
  const bossRef = ref(db, `rooms/main/bosses/${bossId}`);
  let killedByThisTx = false;

  return runTransaction(bossRef, (curr) => {
    killedByThisTx = false;
    if (!curr) return curr;
    if (!curr.alive || curr.hp <= 0) return;
    curr.hp -= Math.round(dmg);
    curr.lastHitBy = uid;
    if (curr.hp <= 0) {
      curr.hp = 0;
      curr.alive = false;
      curr.respawnAt = Date.now() + BOSS_RESPAWN_MS;
      killedByThisTx = true;
    }
    return curr;
  }).then((res) => {
    if (res.committed && killedByThisTx) {
      onKilled(res.snapshot.val());
    }
  }).catch(() => {});
}

export function hostUpdateWorld(bossesState, eventState, allPlayers, highestTier) {
  const now = Date.now();
  BOSS_SPAWNS.forEach((sp) => {
    const b = bossesState[sp.id];
    if (!b) return;
    const desiredTier = Math.min(6, highestTier + 1);

    if (!b.alive) {
      if (b.respawnAt && now >= b.respawnAt) {
        const maxHp = 600 + desiredTier * 450;
        set(ref(db, `rooms/main/bosses/${sp.id}`), {
          id: sp.id, name: sp.name, alive: true, tier: desiredTier, level: desiredTier * 10,
          x: sp.x, y: sp.y, homeX: sp.x, homeY: sp.y, angle: Math.random() * Math.PI * 2,
          hp: maxHp, maxHp, dmg: 28 + desiredTier * 12, respawnAt: 0, lastHitBy: ""
        });
      }
      return;
    }

    let target = null, minDist = 600;
    allPlayers.forEach(p => {
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < minDist) { minDist = d; target = p; }
    });

    let angle = b.angle || 0;
    if (target) angle = Math.atan2(target.y - b.y, target.x - b.x);
    else if (Math.hypot(b.x - sp.x, b.y - sp.y) > 550) angle = Math.atan2(sp.y - b.y, sp.x - b.x);
    else if (Math.random() < 0.08) angle += (Math.random() - 0.5) * 1.2;

    const speed = 13;
    update(ref(db, `rooms/main/bosses/${sp.id}`), {
      x: Math.round(Math.max(150, Math.min(MAP_SIZE - 150, b.x + Math.cos(angle) * speed))),
      y: Math.round(Math.max(150, Math.min(MAP_SIZE - 150, b.y + Math.sin(angle) * speed))),
      angle: Number(angle.toFixed(2)),
      tier: Math.max(b.tier, desiredTier)
    });
  });

  if (eventState) {
    if (eventState.active && now >= eventState.endsAt) {
      set(ref(db, "rooms/main/event"), {
        active: false, type: "", startedAt: 0, endsAt: 0,
        nextEventAt: eventState.startedAt + EVENT_INTERVAL_MS
      });
    } else if (!eventState.active && eventState.nextEventAt && now >= eventState.nextEventAt) {
      const pool = getEventList();
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      set(ref(db, "rooms/main/event"), {
        active: true, type: chosen.id, startedAt: now,
        endsAt: now + EVENT_DURATION_MS, nextEventAt: now + EVENT_INTERVAL_MS
      });
    }
  }
}

export async function leaveGameRoom(uid) {
  roomUnsubs.forEach(u => u());
  roomUnsubs = [];
  if (!uid) return;
  await remove(ref(db, `rooms/main/players/${uid}`));
  const snap = await get(ref(db, "rooms/main/players"));
  const rem = snap.val() || {};
  const now = Date.now();
  const anyOnline = Object.values(rem).some(p => p.updatedAt && now - p.updatedAt < 15000);
  if (!anyOnline) {
    await remove(ref(db, "rooms/main"));
  }
}