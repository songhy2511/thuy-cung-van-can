import { auth, googleProvider, db } from "../firebase-config.js";
import {
  signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  ref, set, get, update, push, query, limitToLast,
  onValue, onChildAdded, remove, onDisconnect, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  MAP_SIZE, BOSS_SPAWNS, BOSS_RESPAWN_MS, EVENT_DURATION_MS, EVENT_INTERVAL_MS,
  BOSS_VISION_RADIUS, BOSS_RANGED_RANGE, EVO_TIERS
} from "./config.js";
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

function createInitialBossData(sp, idx, bossLevel, minutesElapsed = 0) {
  const bossTier = Math.min(5, Math.max(2, 1 + Math.floor(bossLevel / 10)));
  const hpTimeMult = 1 + minutesElapsed * 0.18;
  const dmgTimeMult = 1 + minutesElapsed * 0.12;
  const maxHp = Math.round((900 + bossLevel * 125) * hpTimeMult);
  const dmg = Math.round((65 + bossLevel * 12) * dmgTimeMult);

  return {
    id: sp.id, name: sp.name, alive: true, tier: bossTier, level: bossLevel,
    x: sp.x, y: sp.y, homeX: sp.x, homeY: sp.y, angle: idx * 2,
    hp: maxHp, maxHp, dmg, respawnAt: 0, lastHitBy: "",
    chaseStartedAt: 0, lastDealtDmgAt: 0, combatStartedAt: 0, lastSeenPlayerAt: 0,
    hungryUntil: 0, vortexStartedAt: 0, vortexUntil: 0, vortexCdUntil: 0,
    absUntil: 0, absCdUntil: 0, lungeUntil: 0, lungeCdUntil: 0,
    rangedCdUntil: 0, rangedStrike: null
  };
}

export async function resetWorldMap() {
  const now = Date.now();
  const bossesInit = {};
  BOSS_SPAWNS.forEach((sp, idx) => {
    bossesInit[sp.id] = createInitialBossData(sp, idx, 10, 0);
  });
  await set(ref(db, "rooms/main/meta"), { startedAt: now });
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

  roomUnsubs.push(onValue(ref(db, "rooms/main/meta"), (snap) => {
    if (callbacks.onMetaChange) callbacks.onMetaChange(snap.val() || { startedAt: Date.now() });
  }));
}

export const pushPlayerState = (uid, payload) => set(ref(db, `rooms/main/players/${uid}`), payload);

export function pushPvpHit(targetUid, payload) {
  const hitId = payload.fromUid + "_" + Date.now() + "_" + Math.floor(Math.random() * 999);
  return set(ref(db, `rooms/main/hits/${targetUid}/${hitId}`), payload);
}

export function notifyBossDealtDamage(bossId) {
  return update(ref(db, `rooms/main/bosses/${bossId}`), { lastDealtDmgAt: Date.now() }).catch(() => {});
}

export function runBossDamageTransaction(bossId, uid, dmg, bossMeta, onResult) {
  const now = Date.now();
  const isAbs = (bossMeta?.absUntil || 0) > now;
  const hpRef = ref(db, `rooms/main/bosses/${bossId}/hp`);
  let killedByThisTx = false;
  let healedAmount = 0;

  return runTransaction(hpRef, (currHp) => {
    killedByThisTx = false;
    healedAmount = 0;
    if (currHp === null || currHp === undefined) return currHp;
    if (currHp <= 0) return;

    if (isAbs) {
      const maxHp = bossMeta?.maxHp || 1500;
      healedAmount = Math.round(dmg);
      return Math.min(maxHp, currHp + healedAmount);
    }

    const nextHp = currHp - Math.round(dmg);
    if (nextHp <= 0) {
      killedByThisTx = true;
      return 0;
    }
    return nextHp;
  }).then((res) => {
    if (!res.committed) return;
    if (isAbs) {
      onResult({ absorbed: true, healAmount: healedAmount, boss: bossMeta });
      return;
    }
    if (!bossMeta?.combatStartedAt) {
      update(ref(db, `rooms/main/bosses/${bossId}`), { combatStartedAt: Date.now() }).catch(() => {});
    }
    if (killedByThisTx) {
      update(ref(db, `rooms/main/bosses/${bossId}`), {
        alive: false,
        respawnAt: Date.now() + BOSS_RESPAWN_MS,
        lastHitBy: uid
      }).catch(() => {});
      onResult({ killed: true, boss: bossMeta });
    }
  }).catch((err) => {
    console.warn("Boss dmg tx error:", err);
  });
}

export function hostUpdateWorld(bossesState, eventState, allPlayers, highestTier, highestLevel = 10, roomStartedAt = Date.now()) {
  const now = Date.now();
  const minutesElapsed = Math.max(0, (now - (roomStartedAt || now)) / 60000);
  const desiredBossLevel = Math.max(10, Math.round(highestLevel + 2 + minutesElapsed * 0.6));

  BOSS_SPAWNS.forEach((sp, idx) => {
    const b = bossesState[sp.id];
    if (!b) return;
    if (!b.alive) {
      if (b.respawnAt && now >= b.respawnAt) {
        set(ref(db, `rooms/main/bosses/${sp.id}`), createInitialBossData(sp, idx, desiredBossLevel, minutesElapsed));
      }
      return;
    }

    // Tìm người chơi trong tầm nhìn của Boss
    let target = null, minDist = BOSS_VISION_RADIUS;
    allPlayers.forEach(p => {
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < minDist) { minDist = d; target = p; }
    });

    const isHungry = (b.hungryUntil || 0) > now;
    const isAbs = (b.absUntil || 0) > now;
    const isLunging = isAbs && (b.lungeUntil || 0) > now;
    const hungryMult = isHungry ? 1.5 : 1.0;

    const desiredTier = Math.min(5, Math.max(2, 1 + Math.floor(desiredBossLevel / 10)));
    const scaledDmg = Math.round((65 + Math.max(b.level || 10, desiredBossLevel) * 12) * (1 + minutesElapsed * 0.12));
    const patch = {
      tier: Math.max(b.tier || 2, desiredTier),
      level: Math.max(b.level || 10, desiredBossLevel),
      dmg: Math.max(b.dmg || 150, scaledDmg)
    };

    if (target) {
      patch.lastSeenPlayerAt = now;
      if (!b.chaseStartedAt) {
        patch.chaseStartedAt = now;
        patch.lastDealtDmgAt = now;
      }

      // 1. Con mồi trước mắt (5s đuổi không gây dame -> Đói Khát 5s)
      const lastDmgRef = Math.max(b.chaseStartedAt || now, b.lastDealtDmgAt || 0);
      if (!isHungry && (b.chaseStartedAt || 0) > 0 && now - lastDmgRef >= 5000) {
        patch.hungryUntil = now + 5000;
        patch.lastDealtDmgAt = now + 5000;
      }

      // 2. Chạy đâu cho thoát (Vòng xoáy choáng 5s)
      if (minDist <= 280 && now >= (b.vortexCdUntil || 0)) {
        patch.vortexStartedAt = now;
        patch.vortexUntil = now + 4000;
        patch.vortexCdUntil = now + 14000;
      }

      // 3. Sức mạnh tuyệt đối (sau 10s giao tranh/đuổi theo)
      const activeCombatAt = b.combatStartedAt || b.chaseStartedAt || 0;
      if (!isAbs && activeCombatAt > 0 && now - activeCombatAt >= 10000 && now >= (b.absCdUntil || 0)) {
        patch.absUntil = now + 10000;
        patch.absCdUntil = now + 20000;
        patch.combatStartedAt = now + 10000;
      }

      if (isAbs && !isLunging && now >= (b.lungeCdUntil || 0) && minDist > 90) {
        patch.lungeUntil = now + 500;
        patch.lungeCdUntil = now + 2200;
      }

      // 4. Tấn công tầm xa (lốc xoáy dưới chân người chơi)
      const bTier = Math.min(EVO_TIERS.length, Math.max(1, b.tier || 2));
      const bossR = EVO_TIERS[bTier - 1].baseRadius * 1.35;
      const meleeRange = (bossR + 65) * hungryMult;
      const rangedRange = BOSS_RANGED_RANGE * hungryMult;

      if (minDist > meleeRange && minDist <= rangedRange && now >= (b.rangedCdUntil || 0)) {
        const dmgVal = Math.round(patch.dmg * (isAbs ? 1.5 : 1.0));
        patch.rangedCdUntil = now + 1700;
        patch.rangedStrike = {
          id: `t_${sp.id}_${now}`,
          x: Math.round(target.x),
          y: Math.round(target.y),
          radius: Math.round(70 * hungryMult),
          dmg: dmgVal,
          stun: isAbs ? 2.5 : 0,
          triggerAt: now + 400,
          expiresAt: now + 1150
        };
      }
    } else {
      if (b.lastSeenPlayerAt && now - b.lastSeenPlayerAt > 3500) {
        if (b.chaseStartedAt) patch.chaseStartedAt = 0;
        if (b.combatStartedAt) patch.combatStartedAt = 0;
      }
    }

    if (b.rangedStrike && now > b.rangedStrike.expiresAt) {
      patch.rangedStrike = null;
    }

    let angle = b.angle || 0;
    if (target) angle = Math.atan2(target.y - b.y, target.x - b.x);
    else if (Math.hypot(b.x - sp.x, b.y - sp.y) > 1400) angle = Math.atan2(sp.y - b.y, sp.x - b.x);
    else if (Math.random() < 0.08) angle += (Math.random() - 0.5) * 1.2;

    let speed = 13;
    if (isHungry) speed *= 1.5;
    if (isAbs) speed *= 1.2;
    if (isLunging) speed *= 2.4;

    patch.x = Math.round(Math.max(150, Math.min(MAP_SIZE - 150, b.x + Math.cos(angle) * speed)));
    patch.y = Math.round(Math.max(150, Math.min(MAP_SIZE - 150, b.y + Math.sin(angle) * speed)));
    patch.angle = Number(angle.toFixed(2));

    update(ref(db, `rooms/main/bosses/${sp.id}`), patch);
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