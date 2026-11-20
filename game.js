import { auth, googleProvider, db } from "./firebase-config.js";
import {
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  ref, set, get, update, onValue, onChildAdded, remove, onDisconnect, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ==================== CẤU HÌNH GAME ====================
const MAP_SIZE = 3200;
const BOSS_RESPAWN_MS = 60000; // 1 phút

const FISH_TYPES = {
  swordfish: {
    id: "swordfish",
    name: "Cá Kiếm",
    icon: "🗡️",
    color: "#38bdf8",
    accent: "#bae6fd",
    cost: 0,
    dmgMult: 1.20,
    speedMult: 1.0,
    dmgTakenMult: 1.0,
    healOnFood: 1,
    healOnKill: 0,
    skillName: "Kiếm Đâm",
    skillCd: 5.0,
    desc: "Sát thương +20%. Hồi 1 HP khi ăn mồi. Skill: Lướt đâm xuyên gây sát thương lớn."
  },
  turtle: {
    id: "turtle",
    name: "Rùa Biển",
    icon: "🐢",
    color: "#40c057",
    accent: "#a9e34b",
    cost: 0,
    dmgMult: 1.0,
    speedMult: 0.95,
    dmgTakenMult: 0.80, // Giảm 20% sát thương nhận vào
    healOnFood: 1,
    healOnKill: 0,
    skillName: "Mai Bất Tử",
    skillCd: 7.0,
    desc: "Giảm 20% ST nhận vào. Hồi 1 HP khi ăn mồi. Skill: Bật giáp gai phản sát thương."
  },
  butterfish: {
    id: "butterfish",
    name: "Cá Chim",
    icon: "🪽",
    color: "#f783ac",
    accent: "#fcc2d7",
    cost: 0,
    dmgMult: 1.0,
    speedMult: 1.20,
    dmgTakenMult: 1.0,
    healOnFood: 1,
    healOnKill: 0,
    skillName: "Lướt Sóng",
    skillCd: 4.5,
    desc: "Tốc độ bơi +20%. Hồi 1 HP khi ăn mồi. Skill: Tăng tốc cực đại & phóng thủy tiễn."
  },
  kingfish: {
    id: "kingfish",
    name: "Cá Của Vua",
    icon: "👑",
    color: "#f59f00",
    accent: "#ffe066",
    cost: 100,
    dmgMult: 1.15,
    speedMult: 1.15,
    dmgTakenMult: 0.85, // Giảm 15% sát thương nhận vào
    healOnFood: 5,
    healOnKill: 5,
    skillName: "Hoàng Uy",
    skillCd: 5.5,
    desc: "Giá 100 Coin/ván. ST +15%, Tốc độ +15%, Giảm ST nhận 15%, Hồi 5 HP khi ăn mồi/nuốt cá."
  }
};

const EVO_TIERS = [
  { tier: 1, name: "Cá Con Tập Sự", expNeed: 100, baseRadius: 24 },
  { tier: 2, name: "Chiến Ngư Thủy Cung", expNeed: 240, baseRadius: 33 },
  { tier: 3, name: "Thủy Quái Vạn Cân", expNeed: 450, baseRadius: 43 },
  { tier: 4, name: "Bá Chủ Biển Sâu", expNeed: 750, baseRadius: 55 },
  { tier: 5, name: "Thần Ngư Hải Vương", expNeed: 1200, baseRadius: 68 }
];

const BUFF_POOL = [
  { id: "eatRange", icon: "🧲", name: "Hút Mồi", desc: "+25% khoảng cách ăn mồi" },
  { id: "speed", icon: "⚡", name: "Thủy Lưu", desc: "+12% tốc độ bơi" },
  { id: "maxHp", icon: "❤️", name: "Sinh Mệnh", desc: "+25% Máu tối đa" },
  { id: "biteDmg", icon: "🦷", name: "Răng Sắc", desc: "+18% sát thương cắn" },
  { id: "size", icon: "🐋", name: "Khổng Lồ", desc: "+12% kích cỡ & tầm cắn" },
  { id: "skillDmg", icon: "💥", name: "Cuồng Nộ", desc: "+25% sát thương Skill" },
  { id: "skillCd", icon: "⏱️", name: "Linh Hoạt", desc: "-15% hồi chiêu Skill" }
];

const QUEST_TEMPLATES = [
  { id: "eat50", title: "Ăn 50 mồi thủy cung", target: 50, reward: 60, statKey: "foodEaten" },
  { id: "kill3", title: "Nuốt chửng 5 cá đối thủ", target: 5, reward: 120, statKey: "fishKilled" },
  { id: "evo3", title: "Đạt tiến hóa Bậc 3", target: 1, reward: 90, statKey: "reachedTier3" },
  { id: "boss1", title: "Hạ gục 1 Boss Thủy Cung", target: 1, reward: 250, statKey: "bossKilled" },
  { id: "play3", title: "Hoàn thành 3 trận đấu", target: 3, reward: 75, statKey: "gamesPlayed" }
];

// ==================== STATE NGƯỜI CHƠI ====================
let currentUser = null;
let userData = null;
let selectedFishId = "swordfish";

const defaultUserData = (user) => ({
  nickname: user.displayName ? user.displayName.slice(0, 14) : "Ngư Thủ",
  coins: 150,
  bestScore: 0,
  upgrades: { hp: 0, speed: 0, dmg: 0 },
  quests: {
    foodEaten: 0, fishKilled: 0, reachedTier3: 0, bossKilled: 0, gamesPlayed: 0,
    claimed: {}
  }
});

// ==================== DOM REFERENCES ====================
const screens = {
  login: document.getElementById("login-screen"),
  lobby: document.getElementById("lobby-screen"),
  game: document.getElementById("game-screen")
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");
}

// ==================== AUTH & LOBBY ====================
document.getElementById("btn-google-login").addEventListener("click", async () => {
  const status = document.getElementById("login-status");
  status.textContent = "Đang kết nối Google...";
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    status.textContent = "Lỗi đăng nhập: " + err.message;
  }
});

document.getElementById("btn-logout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUser = null;
    showScreen("login");
    return;
  }
  currentUser = user;
  const userRef = ref(db, `users/${user.uid}`);
  const snap = await get(userRef);
  if (!snap.exists()) {
    userData = defaultUserData(user);
    await set(userRef, userData);
  } else {
    userData = snap.val();
    if (!userData.quests) userData.quests = defaultUserData(user).quests;
    if (!userData.quests.claimed) userData.quests.claimed = {};
    if (!userData.upgrades) userData.upgrades = { hp: 0, speed: 0, dmg: 0 };
  }
  renderLobby();
  showScreen("lobby");
});

document.getElementById("btn-save-name").addEventListener("click", async () => {
  const val = document.getElementById("input-nickname").value.trim();
  if (!val) return alert("Tên không được để trống!");
  userData.nickname = val;
  await update(ref(db, `users/${currentUser.uid}`), { nickname: val });
  alert("Đã lưu tên hiển thị: " + val);
});

async function saveUserData() {
  if (!currentUser || !userData) return;
  await set(ref(db, `users/${currentUser.uid}`), userData);
}

function renderLobby() {
  document.getElementById("user-avatar").src = currentUser.photoURL || "";
  document.getElementById("input-nickname").value = userData.nickname;
  document.getElementById("lobby-coins").textContent = userData.coins;

  // Render 4 Fish
  const fishList = document.getElementById("fish-list");
  fishList.innerHTML = "";
  Object.values(FISH_TYPES).forEach(f => {
    const card = document.createElement("div");
    card.className = `fish-card ${f.id === "kingfish" ? "king" : ""} ${selectedFishId === f.id ? "selected" : ""}`;
    card.innerHTML = `
      <div class="fish-title">
        <span>${f.icon} ${f.name}</span>
        ${f.cost > 0 ? `<span class="fish-tag">🪙 ${f.cost}</span>` : `<span class="fish-tag" style="background:#51cf66">Miễn phí</span>`}
      </div>
      <div class="fish-desc">${f.desc}</div>
    `;
    card.onclick = () => {
      selectedFishId = f.id;
      renderLobby();
    };
    fishList.appendChild(card);
  });

  // Render Upgrades
  const upgDefs = [
    { key: "hp", name: "Máu Khởi Đầu", bonus: "+20 HP / cấp" },
    { key: "speed", name: "Tốc Độ Bơi", bonus: "+4% Tốc độ / cấp" },
    { key: "dmg", name: "Sức Cắn", bonus: "+5 Sát thương / cấp" }
  ];
  const upgList = document.getElementById("upgrade-list");
  upgList.innerHTML = "";
  upgDefs.forEach(u => {
    const lvl = userData.upgrades[u.key] || 0;
    const cost = 50 + lvl * 40;
    const div = document.createElement("div");
    div.className = "upgrade-item";
    div.innerHTML = `
      <div class="upgrade-info">
        <b>${u.name} (Cấp ${lvl})</b>
        <div>${u.bonus}</div>
      </div>
      <button class="btn-small">🪙 ${cost}</button>
    `;
    div.querySelector("button").onclick = async () => {
      if (userData.coins < cost) return alert("Không đủ Coin!");
      userData.coins -= cost;
      userData.upgrades[u.key] = lvl + 1;
      await saveUserData();
      renderLobby();
    };
    upgList.appendChild(div);
  });

  // Render Quests
  const qList = document.getElementById("quest-list");
  qList.innerHTML = "";
  QUEST_TEMPLATES.forEach(q => {
    const prog = Math.min(q.target, userData.quests[q.statKey] || 0);
    const claimed = !!userData.quests.claimed[q.id];
    const done = prog >= q.target;
    const item = document.createElement("div");
    item.className = "quest-item";
    item.innerHTML = `
      <div>
        <div class="q-title">${q.title}</div>
        <div class="q-prog">Tiến độ: ${prog}/${q.target} • Thưởng: 🪙 ${q.reward}</div>
      </div>
      <button class="btn-claim" ${!done || claimed ? "disabled" : ""}>
        ${claimed ? "Đã nhận" : done ? "Nhận" : "Chưa xong"}
      </button>
    `;
    item.querySelector("button").onclick = async () => {
      if (!done || claimed) return;
      userData.coins += q.reward;
      userData.quests.claimed[q.id] = true;
      await saveUserData();
      renderLobby();
    };
    qList.appendChild(item);
  });

  const sf = FISH_TYPES[selectedFishId];
  document.getElementById("selected-fish-summary").textContent =
    `Đang chọn: ${sf.icon} ${sf.name}` + (sf.cost > 0 ? ` (Trừ ${sf.cost} Coin khi vào trận)` : "");

  loadLobbyLeaderboard();
}

async function loadLobbyLeaderboard() {
  const snap = await get(ref(db, "users"));
  const lb = document.getElementById("lobby-leaderboard");
  if (!snap.exists()) { lb.innerHTML = "Chưa có dữ liệu"; return; }
  const arr = Object.values(snap.val())
    .sort((a, b) => (b.bestScore || 0) - (a.bestScore || 0))
    .slice(0, 5);
  lb.innerHTML = arr.map((u, i) => `
    <div class="mini-lb-row">
      <span>${i === 0 ? "👑" : `#${i + 1}`} ${escapeHtml(u.nickname || "Ẩn danh")}</span>
      <b>${u.bestScore || 0} đ</b>
    </div>
  `).join("");
}

// ==================== GAME ENGINE (CANVAS + MULTIPLAYER) ====================
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const miniCanvas = document.getElementById("minimap-canvas");
const miniCtx = miniCanvas.getContext("2d");

let inGame = false;
let animFrameId = null;
let syncIntervalId = null;
let myFish = null;
let remotePlayers = {};
let aiFishes = [];
let foods = [];
let bubbles = [];
let floatingTexts = [];
let projectiles = [];
let biteEffects = [];
let bossState = null;
let mousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let leftMouseDown = false;
let camera = { x: MAP_SIZE / 2, y: MAP_SIZE / 2 };
let sessionStats = { foodEaten: 0, fishKilled: 0, bossKilled: 0, reachedTier3: 0, coinsEarned: 0 };
let pendingLevelUps = 0;
let choosingBuff = false;

const corals = Array.from({ length: 45 }, () => ({
  x: Math.random() * MAP_SIZE,
  y: Math.random() * MAP_SIZE,
  r: 30 + Math.random() * 70,
  hue: 160 + Math.random() * 180
}));

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

document.getElementById("btn-play").addEventListener("click", startMatch);

async function startMatch() {
  const fishCfg = FISH_TYPES[selectedFishId];
  if (fishCfg.cost > 0) {
    if (userData.coins < fishCfg.cost) {
      return alert(`Bạn cần ${fishCfg.cost} Coin để sử dụng Cá Của Vua!`);
    }
    userData.coins -= fishCfg.cost;
    await saveUserData();
  }

  const baseHp = 120 + (userData.upgrades.hp || 0) * 20;
  const baseSpeed = (240 + (userData.upgrades.speed || 0) * 10) * fishCfg.speedMult;
  const baseDmg = (22 + (userData.upgrades.dmg || 0) * 5) * fishCfg.dmgMult;

  myFish = {
    uid: currentUser.uid,
    name: userData.nickname,
    species: selectedFishId,
    x: 400 + Math.random() * (MAP_SIZE - 800),
    y: 400 + Math.random() * (MAP_SIZE - 800),
    angle: 0,
    tier: 1,
    exp: 0,
    expNeed: EVO_TIERS[0].expNeed,
    score: 0,
    hp: baseHp,
    maxHp: baseHp,
    speed: baseSpeed,
    dmg: baseDmg,
    dmgTakenMult: fishCfg.dmgTakenMult,
    healOnFood: fishCfg.healOnFood,
    healOnKill: fishCfg.healOnKill,
    eatRangeBonus: 1,
    sizeMult: 1,
    skillDmgMult: 1,
    skillCdMult: 1,
    skillTimer: 0,
    shieldTimer: 3.0,
    dashTimer: 0,
    reflectTimer: 0,
    biteCooldown: 0,
    buffCounts: {},
    joinedAt: Date.now()
  };

  sessionStats = { foodEaten: 0, fishKilled: 0, bossKilled: 0, reachedTier3: 0, coinsEarned: 0 };
  pendingLevelUps = 0;
  choosingBuff = false;
  leftMouseDown = false;
  floatingTexts = [];
  projectiles = [];
  biteEffects = [];

  foods = Array.from({ length: 240 }, () => spawnFood());
  aiFishes = Array.from({ length: 16 }, (_, i) => spawnAiFish(i));
  bubbles = Array.from({ length: 60 }, () => ({
    x: Math.random() * MAP_SIZE,
    y: Math.random() * MAP_SIZE,
    r: 2 + Math.random() * 5,
    v: 20 + Math.random() * 40
  }));

  document.getElementById("exit-modal").classList.add("hidden");
  document.getElementById("death-modal").classList.add("hidden");
  document.getElementById("buff-modal").classList.add("hidden");

  showScreen("game");
  inGame = true;

  connectRealtimeRoom();
  lastTime = performance.now();
  animFrameId = requestAnimationFrame(gameLoop);
}

function spawnFood(x, y, val = 14) {
  return {
    x: x ?? Math.random() * MAP_SIZE,
    y: y ?? Math.random() * MAP_SIZE,
    val,
    r: val > 20 ? 10 : 6,
    color: `hsl(${Math.random() * 360}, 85%, 65%)`,
    phase: Math.random() * Math.PI * 2
  };
}

function spawnAiFish(idx) {
  const keys = ["swordfish", "turtle", "butterfish"];
  const sp = keys[idx % keys.length];
  const tier = Math.min(4, 1 + Math.floor(Math.random() * 3));
  const maxHp = 80 + tier * 70;
  return {
    id: "ai_" + idx + "_" + Math.random().toString(36).slice(2, 6),
    name: ["Cá Hổ", "Cá Đuối", "Kình Ngư", "Hải Cẩu", "Cá Mập Nhỏ"][idx % 5],
    species: sp,
    tier,
    x: Math.random() * MAP_SIZE,
    y: Math.random() * MAP_SIZE,
    angle: Math.random() * Math.PI * 2,
    hp: maxHp,
    maxHp,
    dmg: 12 + tier * 8,
    speed: 140 + Math.random() * 40,
    biteCooldown: 0,
    aiTimer: 0
  };
}

// ==================== FIREBASE REALTIME MULTIPLAYER ====================
let unsubListeners = [];

function connectRealtimeRoom() {
  const myRef = ref(db, `rooms/main/players/${currentUser.uid}`);
  onDisconnect(myRef).remove();

  const playersRef = ref(db, "rooms/main/players");
  unsubListeners.push(onValue(playersRef, (snap) => {
    const data = snap.val() || {};
    delete data[currentUser.uid];
    remotePlayers = data;
  }));

  const hitsRef = ref(db, `rooms/main/hits/${currentUser.uid}`);
  onDisconnect(hitsRef).remove();
  unsubListeners.push(onChildAdded(hitsRef, (snap) => {
    if (!inGame || !myFish) return;
    const hit = snap.val();
    remove(snap.ref);
    if (myFish.shieldTimer > 0) return;
    const actualDmg = Math.max(1, Math.round(hit.dmg * myFish.dmgTakenMult));
    myFish.hp -= actualDmg;
    addFloatingText(myFish.x, myFish.y - 30, hit.crit ? `💥 -${actualDmg}` : `-${actualDmg}`, "#ff4d4d", hit.crit ? 1.3 : 1);
    if (myFish.reflectTimer > 0 && hit.fromUid) {
      sendPvpHit(hit.fromUid, actualDmg * 0.6, false);
    }
    if (myFish.hp <= 0) {
      handleDeath(`Bị ${hit.fromName || "người chơi khác"} nuốt chửng!`);
    }
  }));

  const bossRef = ref(db, "rooms/main/boss");
  unsubListeners.push(onValue(bossRef, (snap) => {
    bossState = snap.val();
    if (!bossState && isRoomHost()) {
      spawnBossInFirebase();
    }
  }));

  syncIntervalId = setInterval(() => {
    if (!inGame || !myFish) return;
    set(myRef, {
      uid: myFish.uid,
      name: myFish.name,
      species: myFish.species,
      x: Math.round(myFish.x),
      y: Math.round(myFish.y),
      angle: Number(myFish.angle.toFixed(2)),
      tier: myFish.tier,
      score: myFish.score,
      hp: Math.round(myFish.hp),
      maxHp: Math.round(myFish.maxHp),
      sizeMult: myFish.sizeMult,
      shield: myFish.shieldTimer > 0,
      joinedAt: myFish.joinedAt,
      updatedAt: Date.now()
    });

    if (isRoomHost()) {
      hostUpdateBoss();
    }
  }, 66);
}

function isRoomHost() {
  if (!myFish) return false;
  const all = [myFish, ...Object.values(remotePlayers)];
  const active = all.filter(p => !p.updatedAt || Date.now() - p.updatedAt < 10000);
  active.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  return active[0]?.uid === myFish.uid;
}

function getHighestPlayerTier() {
  let maxT = myFish ? myFish.tier : 1;
  Object.values(remotePlayers).forEach(p => {
    if (p.tier > maxT) maxT = p.tier;
  });
  return maxT;
}

function spawnBossInFirebase() {
  const bossTier = getHighestPlayerTier() + 1;
  const maxHp = 600 + bossTier * 450;
  set(ref(db, "rooms/main/boss"), {
    alive: true,
    tier: bossTier,
    x: MAP_SIZE / 2,
    y: MAP_SIZE / 2,
    angle: 0,
    hp: maxHp,
    maxHp,
    dmg: 28 + bossTier * 12,
    respawnAt: 0,
    lastHitBy: ""
  });
}

function hostUpdateBoss() {
  if (!bossState) return;
  const now = Date.now();
  if (!bossState.alive) {
    if (bossState.respawnAt && now >= bossState.respawnAt) {
      spawnBossInFirebase();
    }
    return;
  }
  const players = [myFish, ...Object.values(remotePlayers)].filter(Boolean);
  let target = null, minDist = 650;
  players.forEach(p => {
    const d = Math.hypot(p.x - bossState.x, p.y - bossState.y);
    if (d < minDist) { minDist = d; target = p; }
  });
  let angle = bossState.angle || 0;
  if (target) {
    angle = Math.atan2(target.y - bossState.y, target.x - bossState.x);
  } else if (Math.random() < 0.08) {
    angle += (Math.random() - 0.5) * 1.2;
  }
  const speed = 13;
  const nx = Math.max(150, Math.min(MAP_SIZE - 150, bossState.x + Math.cos(angle) * speed));
  const ny = Math.max(150, Math.min(MAP_SIZE - 150, bossState.y + Math.sin(angle) * speed));

  const desiredTier = getHighestPlayerTier() + 1;
  update(ref(db, "rooms/main/boss"), {
    x: Math.round(nx),
    y: Math.round(ny),
    angle: Number(angle.toFixed(2)),
    tier: Math.max(bossState.tier, desiredTier)
  });
}

function damageBoss(dmg) {
  if (!bossState || !bossState.alive) return;
  const bossRef = ref(db, "rooms/main/boss");
  runTransaction(bossRef, (curr) => {
    if (!curr || !curr.alive) return curr;
    curr.hp -= Math.round(dmg);
    curr.lastHitBy = currentUser.uid;
    if (curr.hp <= 0) {
      curr.hp = 0;
      curr.alive = false;
      curr.respawnAt = Date.now() + BOSS_RESPAWN_MS;
    }
    return curr;
  }).then((res) => {
    const val = res.snapshot.val();
    if (val && !val.alive && val.lastHitBy === currentUser.uid) {
      sessionStats.bossKilled += 1;
      sessionStats.coinsEarned += 80;
      gainExp(350);
      addToast("🏆 BẠN ĐÃ HẠ GỤC BOSS THỦY CUNG! (+80 Coin, +350 EXP)");
    }
  });
}

function sendPvpHit(targetUid, dmg, isCrit = false) {
  const hitId = currentUser.uid + "_" + Date.now() + "_" + Math.floor(Math.random() * 999);
  set(ref(db, `rooms/main/hits/${targetUid}/${hitId}`), {
    fromUid: currentUser.uid,
    fromName: myFish.name,
    dmg: Math.round(dmg),
    crit: isCrit
  });
}

function disconnectRealtimeRoom() {
  if (syncIntervalId) clearInterval(syncIntervalId);
  unsubListeners.forEach(u => u());
  unsubListeners = [];
  if (currentUser) {
    remove(ref(db, `rooms/main/players/${currentUser.uid}`));
  }
}

// ==================== ĐIỀU KHIỂN: CẮN CHUỘT TRÁI & SKILL ====================
canvas.addEventListener("mousemove", (e) => {
  mousePos.x = e.clientX;
  mousePos.y = e.clientY;
});

canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) {
    leftMouseDown = true;
    performBite();
  }
});

window.addEventListener("mouseup", (e) => {
  if (e.button === 0) leftMouseDown = false;
});

canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  triggerSkill();
});

window.addEventListener("keydown", (e) => {
  if (!inGame) return;
  if (e.code === "Space") {
    e.preventDefault();
    triggerSkill();
  }
  if (choosingBuff && ["Digit1", "Digit2", "Digit3"].includes(e.code)) {
    const idx = Number(e.code.replace("Digit", "")) - 1;
    const cards = document.querySelectorAll(".buff-card");
    if (cards[idx]) cards[idx].click();
  }
});

// ==================== HÀM CẮN & ĐÁNH GIÁ ĐIỂM YẾU ĐUÔI ====================
function evaluateBiteHit(biteX, biteY, biteRadius, targetX, targetY, targetAngle, targetRadius) {
  const dCenter = Math.hypot(targetX - biteX, targetY - biteY);
  const tailX = targetX - Math.cos(targetAngle) * targetRadius * 0.95;
  const tailY = targetY - Math.sin(targetAngle) * targetRadius * 0.95;
  const headX = targetX + Math.cos(targetAngle) * targetRadius * 0.95;
  const headY = targetY + Math.sin(targetAngle) * targetRadius * 0.95;

  const dTail = Math.hypot(tailX - biteX, tailY - biteY);
  const dHead = Math.hypot(headX - biteX, headY - biteY);

  const hit = dCenter <= biteRadius + targetRadius || dTail <= biteRadius + targetRadius * 0.55;
  if (!hit) return { hit: false, isCrit: false, tailX, tailY };

  // Chí mạng khi cắn trúng vùng đuôi (và tâm cú cắn gần đuôi hơn gần đầu)
  const isCrit = dTail <= biteRadius + targetRadius * 0.65 && dTail < dHead;
  return { hit: true, isCrit, tailX, tailY };
}

function performBite() {
  if (!inGame || !myFish || choosingBuff || myFish.biteCooldown > 0) return;

  myFish.biteCooldown = 0.38;
  const myRadius = getFishRadius(myFish.tier, myFish.sizeMult);

  // Tầm cắn tỷ lệ thuận với kích thước cá
  const biteDist = myRadius * 0.95;
  const biteRadius = myRadius * 0.88;
  const biteX = myFish.x + Math.cos(myFish.angle) * biteDist;
  const biteY = myFish.y + Math.sin(myFish.angle) * biteDist;

  // Hiệu ứng vệt cắn trước miệng
  biteEffects.push({
    x: biteX,
    y: biteY,
    angle: myFish.angle,
    radius: biteRadius,
    life: 0.16,
    maxLife: 0.16,
    critSpark: false
  });

  // 1. Cắn AI Cá
  for (let i = aiFishes.length - 1; i >= 0; i--) {
    const ai = aiFishes[i];
    const aiR = getFishRadius(ai.tier, 1);
    const res = evaluateBiteHit(biteX, biteY, biteRadius, ai.x, ai.y, ai.angle, aiR);
    if (res.hit) {
      const dmg = res.isCrit ? myFish.dmg * 2.0 : myFish.dmg;
      damageAiFish(ai, dmg, res.isCrit, res.tailX, res.tailY);
    }
  }

  // 2. Cắn Người chơi khác (PvP)
  Object.values(remotePlayers).forEach(p => {
    const pR = getFishRadius(p.tier || 1, p.sizeMult || 1);
    const res = evaluateBiteHit(biteX, biteY, biteRadius, p.x, p.y, p.angle || 0, pR);
    if (res.hit) {
      const dmg = res.isCrit ? myFish.dmg * 2.0 : myFish.dmg;
      sendPvpHit(p.uid, dmg, res.isCrit);
      if (res.isCrit) {
        addFloatingText(res.tailX, res.tailY - 24, `💥 CHÍ MẠNG -${Math.round(dmg)}`, "#ff922b", 1.25);
        spawnCritBurst(res.tailX, res.tailY);
      } else {
        addFloatingText(p.x, p.y - 30, `-${Math.round(dmg)}`, "#ffd43b", 1);
      }

      if ((p.hp || 100) <= dmg) {
        sessionStats.fishKilled += 1;
        sessionStats.coinsEarned += 15;
        gainExp(90 + (p.tier || 1) * 40);
        if (myFish.healOnKill > 0 && myFish.hp < myFish.maxHp) {
          const healed = Math.min(myFish.healOnKill, myFish.maxHp - myFish.hp);
          myFish.hp += healed;
          addFloatingText(myFish.x, myFish.y - 25, `+${Math.round(healed)} HP`, "#51cf66", 1);
        }
        addToast(`🔥 Bạn vừa nuốt chửng ${p.name}! (+15 Coin)`);
      }
    }
  });

  // 3. Cắn Boss Thủy Cung
  if (bossState && bossState.alive) {
    const bossR = getFishRadius(bossState.tier, 1.35);
    const res = evaluateBiteHit(biteX, biteY, biteRadius, bossState.x, bossState.y, bossState.angle || 0, bossR);
    if (res.hit) {
      const dmg = res.isCrit ? myFish.dmg * 2.0 : myFish.dmg;
      damageBoss(dmg);
      if (res.isCrit) {
        addFloatingText(res.tailX, res.tailY - 35, `💥 CHÍ MẠNG -${Math.round(dmg)}`, "#ff922b", 1.35);
        spawnCritBurst(res.tailX, res.tailY);
      } else {
        addFloatingText(bossState.x, bossState.y - 60, `-${Math.round(dmg)}`, "#ffd43b", 1);
      }
    }
  }
}

function spawnCritBurst(x, y) {
  biteEffects.push({
    x, y, angle: 0, radius: 34, life: 0.24, maxLife: 0.24, critSpark: true
  });
}

function triggerSkill() {
  if (!myFish || myFish.skillTimer > 0 || choosingBuff) return;
  const cfg = FISH_TYPES[myFish.species];
  myFish.skillTimer = cfg.skillCd * myFish.skillCdMult;
  const sDmg = myFish.dmg * 1.8 * myFish.skillDmgMult;

  if (myFish.species === "swordfish") {
    myFish.dashTimer = 0.45;
    addFloatingText(myFish.x, myFish.y - 35, "🗡️ KIẾM ĐÂM!", "#38bdf8");
    dealAoEDamage(myFish.x + Math.cos(myFish.angle) * 70, myFish.y + Math.sin(myFish.angle) * 70, 110, sDmg);
  } else if (myFish.species === "turtle") {
    myFish.shieldTimer = 3.0;
    myFish.reflectTimer = 3.0;
    addFloatingText(myFish.x, myFish.y - 35, "🛡️ MAI BẤT TỬ!", "#51cf66");
  } else if (myFish.species === "butterfish") {
    myFish.dashTimer = 0.65;
    projectiles.push({
      x: myFish.x, y: myFish.y,
      vx: Math.cos(myFish.angle) * 650, vy: Math.sin(myFish.angle) * 650,
      dmg: sDmg, life: 1.0, color: "#f783ac"
    });
    addFloatingText(myFish.x, myFish.y - 35, "🪽 LƯỚT SÓNG!", "#f783ac");
  } else if (myFish.species === "kingfish") {
    addFloatingText(myFish.x, myFish.y - 40, "👑 HOÀNG UY CHẤN ĐỘNG!", "#ffd43b");
    dealAoEDamage(myFish.x, myFish.y, 200, sDmg * 1.25);
  }
}

function dealAoEDamage(cx, cy, radius, dmg) {
  aiFishes.forEach(ai => {
    if (Math.hypot(ai.x - cx, ai.y - cy) < radius) {
      damageAiFish(ai, dmg, false, ai.x, ai.y);
    }
  });
  Object.values(remotePlayers).forEach(p => {
    if (Math.hypot(p.x - cx, p.y - cy) < radius) {
      sendPvpHit(p.uid, dmg, false);
    }
  });
  if (bossState && bossState.alive && Math.hypot(bossState.x - cx, bossState.y - cy) < radius + 70) {
    damageBoss(dmg);
    addFloatingText(bossState.x, bossState.y - 50, `-${Math.round(dmg)}`, "#ffd43b");
  }
}

// ==================== GAME LOOP ====================
let lastTime = 0;

function gameLoop(now) {
  if (!inGame) return;
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  updateGame(dt);
  renderGame();
  renderMinimap();
  updateHUD();

  animFrameId = requestAnimationFrame(gameLoop);
}

function updateGame(dt) {
  if (!myFish) return;

  if (myFish.skillTimer > 0) myFish.skillTimer = Math.max(0, myFish.skillTimer - dt);
  if (myFish.shieldTimer > 0) myFish.shieldTimer = Math.max(0, myFish.shieldTimer - dt);
  if (myFish.dashTimer > 0) myFish.dashTimer = Math.max(0, myFish.dashTimer - dt);
  if (myFish.reflectTimer > 0) myFish.reflectTimer = Math.max(0, myFish.reflectTimer - dt);
  if (myFish.biteCooldown > 0) myFish.biteCooldown = Math.max(0, myFish.biteCooldown - dt);

  // Giữ chuột trái để cắn liên tục theo tốc độ hồi cắn
  if (leftMouseDown && myFish.biteCooldown <= 0) {
    performBite();
  }

  // Di chuyển theo chuột
  const dx = mousePos.x - canvas.width / 2;
  const dy = mousePos.y - canvas.height / 2;
  const distToCursor = Math.hypot(dx, dy);
  myFish.angle = Math.atan2(dy, dx);

  const curSpeed = myFish.speed * (myFish.dashTimer > 0 ? 2.15 : 1.0);
  const moveFactor = Math.min(1, distToCursor / 60);
  myFish.x = Math.max(40, Math.min(MAP_SIZE - 40, myFish.x + Math.cos(myFish.angle) * curSpeed * moveFactor * dt));
  myFish.y = Math.max(40, Math.min(MAP_SIZE - 40, myFish.y + Math.sin(myFish.angle) * curSpeed * moveFactor * dt));

  camera.x += (myFish.x - camera.x) * 0.14;
  camera.y += (myFish.y - camera.y) * 0.14;

  const myRadius = getFishRadius(myFish.tier, myFish.sizeMult);

  // Ăn mồi & Hồi máu (1 HP cho cá thường, 5 HP cho Cá Của Vua)
  const eatRadius = (myRadius + 24) * myFish.eatRangeBonus;
  for (let i = foods.length - 1; i >= 0; i--) {
    const f = foods[i];
    const d = Math.hypot(f.x - myFish.x, f.y - myFish.y);
    if (d < eatRadius) {
      if (d > myRadius) {
        f.x += (myFish.x - f.x) * 0.25;
        f.y += (myFish.y - f.y) * 0.25;
      } else {
        gainExp(f.val);
        sessionStats.foodEaten += 1;
        if (myFish.healOnFood > 0 && myFish.hp < myFish.maxHp) {
          const healed = Math.min(myFish.healOnFood, myFish.maxHp - myFish.hp);
          myFish.hp += healed;
          addFloatingText(myFish.x, myFish.y - 25, `+${Math.round(healed)} HP`, "#51cf66", 0.85);
        }
        foods.splice(i, 1);
        foods.push(spawnFood());
      }
    }
  }

  // Đạn kỹ năng (Cá chim)
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.life -= dt;
    let hit = false;
    aiFishes.forEach(ai => {
      if (!hit && Math.hypot(ai.x - pr.x, ai.y - pr.y) < getFishRadius(ai.tier, 1) + 14) {
        damageAiFish(ai, pr.dmg, false, ai.x, ai.y);
        hit = true;
      }
    });
    if (!hit && bossState && bossState.alive && Math.hypot(bossState.x - pr.x, bossState.y - pr.y) < 90) {
      damageBoss(pr.dmg);
      hit = true;
    }
    if (hit || pr.life <= 0) projectiles.splice(i, 1);
  }

  // AI Cá di chuyển & tấn công ngược lại người chơi (người chơi phải tự bấm chuột trái để cắn lại)
  aiFishes.forEach(ai => {
    if (ai.biteCooldown > 0) ai.biteCooldown -= dt;
    ai.aiTimer -= dt;
    if (ai.aiTimer <= 0) {
      ai.aiTimer = 1 + Math.random() * 2;
      ai.angle += (Math.random() - 0.5) * 1.8;
    }
    ai.x = Math.max(60, Math.min(MAP_SIZE - 60, ai.x + Math.cos(ai.angle) * ai.speed * dt));
    ai.y = Math.max(60, Math.min(MAP_SIZE - 60, ai.y + Math.sin(ai.angle) * ai.speed * dt));

    const aiR = getFishRadius(ai.tier, 1);
    const d = Math.hypot(ai.x - myFish.x, ai.y - myFish.y);
    if (d < myRadius + aiR && ai.biteCooldown <= 0 && myFish.shieldTimer <= 0) {
      ai.biteCooldown = 0.75;
      const dmg = Math.max(1, Math.round(ai.dmg * myFish.dmgTakenMult));
      myFish.hp -= dmg;
      addFloatingText(myFish.x, myFish.y - 30, `-${dmg}`, "#ff6b6b");
      if (myFish.hp <= 0) handleDeath(`Bị ${ai.name} hạ gục!`);
    }
  });

  // Boss tấn công người chơi khi áp sát
  if (bossState && bossState.alive) {
    const bossR = getFishRadius(bossState.tier, 1.35);
    const distBoss = Math.hypot(bossState.x - myFish.x, bossState.y - myFish.y);
    if (distBoss < myRadius + bossR && myFish.shieldTimer <= 0 && Math.random() < dt * 1.4) {
      const bDmg = Math.max(1, Math.round(bossState.dmg * myFish.dmgTakenMult));
      myFish.hp -= bDmg;
      addFloatingText(myFish.x, myFish.y - 30, `-${bDmg}`, "#ff3b3b");
      if (myFish.hp <= 0) handleDeath("Bị Boss Thủy Cung nghiền nát!");
    }
  }

  // Hiệu ứng vệt cắn
  for (let i = biteEffects.length - 1; i >= 0; i--) {
    biteEffects[i].life -= dt;
    if (biteEffects[i].life <= 0) biteEffects.splice(i, 1);
  }

  // Bong bóng & chữ bay
  bubbles.forEach(b => {
    b.y -= b.v * dt;
    if (b.y < 0) b.y = MAP_SIZE;
  });
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    floatingTexts[i].y -= 35 * dt;
    floatingTexts[i].life -= dt;
    if (floatingTexts[i].life <= 0) floatingTexts.splice(i, 1);
  }
}

function damageAiFish(ai, dmg, isCrit = false, fxX = ai.x, fxY = ai.y) {
  ai.hp -= dmg;
  if (isCrit) {
    addFloatingText(fxX, fxY - 26, `💥 CHÍ MẠNG -${Math.round(dmg)}`, "#ff922b", 1.25);
    spawnCritBurst(fxX, fxY);
  } else {
    addFloatingText(ai.x, ai.y - 25, `-${Math.round(dmg)}`, "#ffd43b", 1);
  }
  if (ai.hp <= 0) {
    sessionStats.fishKilled += 1;
    sessionStats.coinsEarned += 5;
    gainExp(55 + ai.tier * 25);
    if (myFish.healOnKill > 0 && myFish.hp < myFish.maxHp) {
      const healed = Math.min(myFish.healOnKill, myFish.maxHp - myFish.hp);
      myFish.hp += healed;
      addFloatingText(myFish.x, myFish.y - 25, `+${Math.round(healed)} HP`, "#51cf66", 1);
    }
    for (let k = 0; k < 4; k++) {
      foods.push(spawnFood(ai.x + (Math.random() - 0.5) * 40, ai.y + (Math.random() - 0.5) * 40, 25));
    }
    const idx = aiFishes.indexOf(ai);
    if (idx !== -1) aiFishes[idx] = spawnAiFish(idx);
  }
}

function gainExp(amount) {
  myFish.exp += amount;
  myFish.score += amount;
  while (myFish.exp >= myFish.expNeed) {
    myFish.exp -= myFish.expNeed;
    if (myFish.tier < EVO_TIERS.length) {
      myFish.tier += 1;
      myFish.expNeed = EVO_TIERS[myFish.tier - 1].expNeed;
      if (myFish.tier >= 3) sessionStats.reachedTier3 = 1;
    } else {
      myFish.expNeed = Math.round(myFish.expNeed * 1.25);
    }
    myFish.maxHp += 35;
    myFish.hp = Math.min(myFish.maxHp, myFish.hp + 50);
    myFish.dmg += 6;
    pendingLevelUps += 1;
    addToast(`✨ TIẾN HÓA: ${EVO_TIERS[myFish.tier - 1].name}!`);
  }
  if (pendingLevelUps > 0 && !choosingBuff) {
    openBuffChoice();
  }
}

function openBuffChoice() {
  choosingBuff = true;
  leftMouseDown = false;
  myFish.shieldTimer = Math.max(myFish.shieldTimer, 4.0);
  const shuffled = [...BUFF_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
  const container = document.getElementById("buff-choices");
  container.innerHTML = "";
  shuffled.forEach((b, idx) => {
    const card = document.createElement("div");
    card.className = "buff-card";
    card.innerHTML = `
      <div class="b-icon">${b.icon}</div>
      <div class="b-name">[${idx + 1}] ${b.name}</div>
      <div class="b-desc">${b.desc}</div>
    `;
    card.onclick = () => {
      applyBuff(b.id);
      pendingLevelUps -= 1;
      document.getElementById("buff-modal").classList.add("hidden");
      choosingBuff = false;
      if (pendingLevelUps > 0) openBuffChoice();
    };
    container.appendChild(card);
  });
  document.getElementById("buff-modal").classList.remove("hidden");
}

function applyBuff(id) {
  myFish.buffCounts[id] = (myFish.buffCounts[id] || 0) + 1;
  if (id === "eatRange") myFish.eatRangeBonus += 0.25;
  if (id === "speed") myFish.speed *= 1.12;
  if (id === "maxHp") {
    const add = myFish.maxHp * 0.25;
    myFish.maxHp += add;
    myFish.hp += add;
  }
  if (id === "biteDmg") myFish.dmg *= 1.18;
  if (id === "size") myFish.sizeMult += 0.12;
  if (id === "skillDmg") myFish.skillDmgMult += 0.25;
  if (id === "skillCd") myFish.skillCdMult *= 0.85;
}

function getFishRadius(tier, sizeMult = 1) {
  const t = Math.min(EVO_TIERS.length, Math.max(1, tier));
  return EVO_TIERS[t - 1].baseRadius * sizeMult;
}

// ==================== VẼ THỦY CUNG & CÁ "VẠN CÂN" ====================
function renderGame() {
  const w = canvas.width, h = canvas.height;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#094c78");
  grad.addColorStop(0.6, "#042b48");
  grad.addColorStop(1, "#021627");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#8ce9ff";
  for (let i = 0; i < 6; i++) {
    const rx = ((i * 340 - camera.x * 0.2) % (w + 400)) - 100;
    ctx.beginPath();
    ctx.moveTo(rx, 0);
    ctx.lineTo(rx + 120, 0);
    ctx.lineTo(rx + 280, h);
    ctx.lineTo(rx + 40, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.translate(w / 2 - camera.x, h / 2 - camera.y);

  ctx.strokeStyle = "rgba(77, 184, 255, 0.45)";
  ctx.lineWidth = 10;
  ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);

  corals.forEach(c => {
    ctx.fillStyle = `hsla(${c.hue}, 55%, 30%, 0.22)`;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "rgba(200, 240, 255, 0.25)";
  bubbles.forEach(b => {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  });

  const t = performance.now() / 1000;
  foods.forEach(f => {
    const pulse = Math.sin(t * 4 + f.phase) * 1.5;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r + pulse, 0, Math.PI * 2);
    ctx.fill();
  });

  projectiles.forEach(pr => {
    ctx.fillStyle = pr.color;
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, 10, 0, Math.PI * 2);
    ctx.fill();
  });

  const top1Uid = getTop1Uid();

  aiFishes.forEach(ai => {
    drawAnimatedFish(ai.x, ai.y, ai.angle, ai.species, ai.tier, 1, ai.name, ai.hp, ai.maxHp, false, false, false, t);
  });

  Object.values(remotePlayers).forEach(p => {
    drawAnimatedFish(p.x, p.y, p.angle, p.species, p.tier || 1, p.sizeMult || 1, p.name, p.hp, p.maxHp, p.uid === top1Uid, false, p.shield, t);
  });

  if (bossState && bossState.alive) {
    drawAnimatedFish(bossState.x, bossState.y, bossState.angle || 0, "boss", bossState.tier, 1.35, `BOSS THỦY CUNG (Cấp ${bossState.tier})`, bossState.hp, bossState.maxHp, false, true, false, t);
  }

  if (myFish) {
    drawAnimatedFish(myFish.x, myFish.y, myFish.angle, myFish.species, myFish.tier, myFish.sizeMult, myFish.name, myFish.hp, myFish.maxHp, myFish.uid === top1Uid, false, myFish.shieldTimer > 0, t);
  }

  // Vẽ hiệu ứng táp cắn & tia nổ chí mạng
  biteEffects.forEach(ef => {
    const alpha = ef.life / ef.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (ef.critSpark) {
      ctx.strokeStyle = "#ff922b";
      ctx.lineWidth = 4;
      for (let k = 0; k < 8; k++) {
        const a = (Math.PI * 2 * k) / 8;
        ctx.beginPath();
        ctx.moveTo(ef.x + Math.cos(a) * 8, ef.y + Math.sin(a) * 8);
        ctx.lineTo(ef.x + Math.cos(a) * ef.radius * (1.2 - alpha * 0.4), ef.y + Math.sin(a) * ef.radius * (1.2 - alpha * 0.4));
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = "#e0f2fe";
      ctx.lineWidth = Math.max(3, ef.radius * 0.12);
      ctx.beginPath();
      ctx.arc(ef.x, ef.y, ef.radius * 0.78, ef.angle - 0.9, ef.angle + 0.9);
      ctx.stroke();
    }
    ctx.restore();
  });

  floatingTexts.forEach(ft => {
    ctx.font = `bold ${Math.round(16 * (ft.scale || 1))}px Segoe UI`;
    ctx.fillStyle = ft.color;
    ctx.textAlign = "center";
    ctx.fillText(ft.text, ft.x, ft.y);
  });

  ctx.restore();
}

function drawAnimatedFish(x, y, angle, species, tier, sizeMult, name, hp, maxHp, isTop1, isBoss, hasShield, t) {
  const r = getFishRadius(tier, sizeMult);
  const cfg = isBoss
    ? { color: "#b91c1c", accent: "#fbbf24" }
    : (FISH_TYPES[species] || FISH_TYPES.swordfish);

  ctx.save();
  ctx.translate(x, y);

  if (tier >= 3 || isBoss) {
    const auraAlpha = isBoss ? 0.38 : 0.14 + (tier - 2) * 0.08;
    const auraColor = isBoss ? "#ff2a2a" : cfg.accent;
    ctx.save();
    ctx.globalAlpha = auraAlpha + Math.sin(t * 5) * 0.06;
    ctx.fillStyle = auraColor;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (hasShield) {
    ctx.strokeStyle = "#51cf66";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.32, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.save();
  ctx.rotate(angle);
  const swimWag = Math.sin(t * (8 + tier * 0.8)) * 0.28;

  // Đuôi cá
  ctx.save();
  ctx.translate(-r * 0.85, 0);
  ctx.rotate(swimWag);
  ctx.fillStyle = cfg.accent;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-r * 0.75, -r * 0.55);
  ctx.lineTo(-r * 0.45, 0);
  ctx.lineTo(-r * 0.75, r * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Vây ngực
  const finWag = Math.sin(t * 9) * 0.25;
  ctx.fillStyle = cfg.accent;
  [-1, 1].forEach(side => {
    ctx.save();
    ctx.translate(r * 0.1, side * r * 0.52);
    ctx.rotate(side * (0.4 + finWag));
    ctx.beginPath();
    ctx.ellipse(0, side * r * 0.2, r * 0.35, r * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // Thân cá
  ctx.fillStyle = cfg.color;
  ctx.beginPath();
  if (species === "turtle") {
    ctx.ellipse(0, 0, r * 1.05, r * 0.88, 0, 0, Math.PI * 2);
  } else if (species === "butterfish") {
    ctx.ellipse(0, 0, r * 0.95, r * 0.78, 0, 0, Math.PI * 2);
  } else {
    ctx.ellipse(0, 0, r * 1.2, r * 0.65, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = cfg.accent;
  ctx.stroke();

  if (species === "swordfish") {
    ctx.fillStyle = "#e0f2fe";
    ctx.beginPath();
    ctx.moveTo(r * 1.15, -r * 0.12);
    ctx.lineTo(r * 1.95, 0);
    ctx.lineTo(r * 1.15, r * 0.12);
    ctx.closePath();
    ctx.fill();
  }
  if (tier >= 3 || isBoss || species === "kingfish") {
    ctx.fillStyle = "#ffd43b";
    for (let s = -2; s <= 1; s++) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.3, -r * 0.48);
      ctx.lineTo(s * r * 0.3 - r * 0.18, -r * 0.88);
      ctx.lineTo(s * r * 0.3 + r * 0.18, -r * 0.48);
      ctx.fill();
    }
  }

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(r * 0.55, -r * 0.24, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = isBoss ? "#ff0000" : "#111";
  ctx.beginPath();
  ctx.arc(r * 0.6, -r * 0.24, r * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const barW = Math.max(54, r * 1.5);
  const barY = -r - 22;

  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(-barW / 2, barY, barW, 8);
  const hpRatio = Math.max(0, Math.min(1, (hp || 0) / (maxHp || 1)));
  ctx.fillStyle = isBoss ? "#ff3b3b" : "#51cf66";
  ctx.fillRect(-barW / 2, barY, barW * hpRatio, 8);

  ctx.font = isBoss ? "bold 14px Segoe UI" : "bold 12px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillStyle = isBoss ? "#ff8787" : "#ffffff";
  const prefix = isTop1 ? "👑 " : "";
  ctx.fillText(`${prefix}${name}`, 0, barY - 6);

  ctx.restore();
}

// ==================== MINIMAP & HUD ====================
function getTop1Uid() {
  const all = [myFish, ...Object.values(remotePlayers)].filter(Boolean);
  all.sort((a, b) => (b.score || 0) - (a.score || 0));
  return all[0]?.uid;
}

function renderMinimap() {
  const mw = miniCanvas.width, mh = miniCanvas.height;
  miniCtx.clearRect(0, 0, mw, mh);
  const scale = mw / MAP_SIZE;
  const top1Uid = getTop1Uid();

  Object.values(remotePlayers).forEach(p => {
    const mx = p.x * scale, my = p.y * scale;
    if (p.uid === top1Uid) {
      miniCtx.font = "13px Segoe UI";
      miniCtx.textAlign = "center";
      miniCtx.fillText("👑", mx, my + 4);
    } else {
      miniCtx.fillStyle = "#ffd43b";
      miniCtx.beginPath();
      miniCtx.arc(mx, my, 3.5, 0, Math.PI * 2);
      miniCtx.fill();
    }
  });

  if (bossState && bossState.alive) {
    miniCtx.fillStyle = "#ff3b3b";
    miniCtx.beginPath();
    miniCtx.arc(bossState.x * scale, bossState.y * scale, 5.5, 0, Math.PI * 2);
    miniCtx.fill();
  }

  if (myFish) {
    const mx = myFish.x * scale, my = myFish.y * scale;
    if (myFish.uid === top1Uid) {
      miniCtx.font = "13px Segoe UI";
      miniCtx.textAlign = "center";
      miniCtx.fillText("👑", mx, my + 4);
    } else {
      miniCtx.fillStyle = "#51cf66";
      miniCtx.beginPath();
      miniCtx.arc(mx, my, 4, 0, Math.PI * 2);
      miniCtx.fill();
    }
  }
}

function updateHUD() {
  if (!myFish) return;
  const evo = EVO_TIERS[Math.min(EVO_TIERS.length - 1, myFish.tier - 1)];
  document.getElementById("hud-evo-info").textContent = `Bậc ${myFish.tier}: ${evo.name} (${Math.round(myFish.score)} đ)`;

  const hpPct = Math.max(0, Math.min(100, (myFish.hp / myFish.maxHp) * 100));
  document.getElementById("hud-hp-fill").style.width = hpPct + "%";
  document.getElementById("hud-hp-text").textContent = `${Math.ceil(myFish.hp)} / ${Math.round(myFish.maxHp)}`;

  const expPct = Math.min(100, (myFish.exp / myFish.expNeed) * 100);
  document.getElementById("hud-exp-fill").style.width = expPct + "%";
  document.getElementById("hud-exp-text").textContent = `EXP: ${Math.floor(myFish.exp)} / ${myFish.expNeed}`;

  const cfg = FISH_TYPES[myFish.species];
  document.getElementById("hud-skill-name").textContent = cfg.skillName;
  const cdOv = document.getElementById("hud-skill-cd");
  if (myFish.skillTimer > 0) {
    cdOv.style.opacity = "1";
    cdOv.textContent = myFish.skillTimer.toFixed(1) + "s";
  } else {
    cdOv.style.opacity = "0";
  }

  const buffBar = document.getElementById("active-buffs-bar");
  buffBar.innerHTML = Object.entries(myFish.buffCounts).map(([bid, cnt]) => {
    const b = BUFF_POOL.find(x => x.id === bid);
    return `<div class="buff-badge">${b.icon} <span class="cnt">x${cnt}</span></div>`;
  }).join("");

  const all = [myFish, ...Object.values(remotePlayers)].filter(Boolean);
  all.sort((a, b) => (b.score || 0) - (a.score || 0));
  document.getElementById("ingame-leaderboard").innerHTML = all.slice(0, 6).map((p, i) => `
    <div class="lb-row ${p.uid === myFish.uid ? "me" : ""}">
      <span>${i === 0 ? "👑" : `${i + 1}.`} ${escapeHtml(p.name)}</span>
      <span>${Math.round(p.score || 0)}</span>
    </div>
  `).join("");

  const banner = document.getElementById("boss-timer-banner");
  if (!bossState) {
    banner.textContent = "Boss: Đang khởi tạo...";
  } else if (bossState.alive) {
    banner.textContent = `👹 Boss Cấp ${bossState.tier}: ${Math.round(bossState.hp)} HP`;
  } else {
    const sec = Math.max(0, Math.ceil((bossState.respawnAt - Date.now()) / 1000));
    banner.textContent = `⏳ Boss hồi sinh sau: ${sec}s`;
  }
}

// ==================== THOÁT / CHẾT & LƯU NHIỆM VỤ ====================
document.getElementById("btn-menu-exit").addEventListener("click", () => {
  document.getElementById("exit-modal").classList.remove("hidden");
});
document.getElementById("btn-resume").addEventListener("click", () => {
  document.getElementById("exit-modal").classList.add("hidden");
});
document.getElementById("btn-confirm-exit").addEventListener("click", () => {
  finishMatch(false, "");
});
document.getElementById("btn-back-lobby").addEventListener("click", () => {
  document.getElementById("death-modal").classList.add("hidden");
  renderLobby();
  showScreen("lobby");
});

function handleDeath(reason) {
  finishMatch(true, reason);
}

async function finishMatch(isDead, reason) {
  if (!inGame) return;
  inGame = false;
  leftMouseDown = false;
  cancelAnimationFrame(animFrameId);
  disconnectRealtimeRoom();

  const score = myFish ? Math.round(myFish.score) : 0;
  const bonusCoins = Math.floor(score / 40);
  const totalCoins = sessionStats.coinsEarned + bonusCoins;

  userData.coins += totalCoins;
  userData.bestScore = Math.max(userData.bestScore || 0, score);
  userData.quests.foodEaten = (userData.quests.foodEaten || 0) + sessionStats.foodEaten;
  userData.quests.fishKilled = (userData.quests.fishKilled || 0) + sessionStats.fishKilled;
  userData.quests.bossKilled = (userData.quests.bossKilled || 0) + sessionStats.bossKilled;
  userData.quests.reachedTier3 = Math.max(userData.quests.reachedTier3 || 0, sessionStats.reachedTier3);
  userData.quests.gamesPlayed = (userData.quests.gamesPlayed || 0) + 1;

  await saveUserData();

  if (isDead) {
    document.getElementById("death-title").textContent = "💀 BẠN ĐÃ TỬ VONG!";
    document.getElementById("death-summary").innerHTML = `
      <div>${escapeHtml(reason)}</div>
      <div>Điểm đạt được: <b>${score}</b></div>
      <div>Cá đã nuốt: <b>${sessionStats.fishKilled}</b> • Mồi đã ăn: <b>${sessionStats.foodEaten}</b></div>
      <div>Coin nhận được: <b style="color:#ffd43b">+${totalCoins} Coin</b></div>
    `;
    document.getElementById("death-modal").classList.remove("hidden");
  } else {
    renderLobby();
    showScreen("lobby");
  }
}

// ==================== TIỆN ÍCH ====================
function addFloatingText(x, y, text, color, scale = 1) {
  floatingTexts.push({ x, y, text, color, scale, life: 1.0 });
}

function addToast(msg) {
  const c = document.getElementById("toast-container");
  const d = document.createElement("div");
  d.className = "toast";
  d.textContent = msg;
  c.appendChild(d);
  setTimeout(() => d.remove(), 3500);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[s]));
}