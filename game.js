import { auth, googleProvider, db } from "./firebase-config.js";
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
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
    color: "#1d6fa5",
    midColor: "#38bdf8",
    bellyColor: "#e2f1ff",
    accent: "#7dd3fc",
    finGlow: "#bae6fd",
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
    color: "#2b8a3e",
    midColor: "#51cf66",
    bellyColor: "#d8f5a2",
    accent: "#a9e34b",
    finGlow: "#94d82d",
    cost: 0,
    dmgMult: 1.0,
    speedMult: 0.95,
    dmgTakenMult: 0.80,
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
    color: "#be4bdb",
    midColor: "#f783ac",
    bellyColor: "#fff0f6",
    accent: "#fcc2d7",
    finGlow: "#eebefa",
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
    color: "#c92a2a",
    midColor: "#f59f00",
    bellyColor: "#fff3bf",
    accent: "#ffe066",
    finGlow: "#ffd43b",
    cost: 100,
    dmgMult: 1.15,
    speedMult: 1.15,
    dmgTakenMult: 0.85,
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
getRedirectResult(auth).catch((err) => {
  document.getElementById("login-status").textContent = "Lỗi đăng nhập: " + err.message;
});

document.getElementById("btn-google-login").addEventListener("click", async () => {
  const status = document.getElementById("login-status");
  status.textContent = "Đang kết nối Google...";
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    if (err.code === "auth/popup-blocked") {
      status.textContent = "Đang chuyển hướng đăng nhập Google...";
      await signInWithRedirect(auth, googleProvider);
    } else {
      status.textContent = "Lỗi đăng nhập: " + err.message + " (Nếu mở từ Messenger/Zalo hãy chuyển sang Safari/Chrome)";
    }
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

// ==================== GAME ENGINE (HIGH-DPI + MULTIPLAYER) ====================
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const miniCanvas = document.getElementById("minimap-canvas");
const miniCtx = miniCanvas.getContext("2d");

// Tải hình ảnh thức ăn từ Data/Images/thuc-an
const foodImg = new Image();
let foodImgReady = false;
const foodPaths = [
  "./Data/Images/thuc-an.png",
  "./Data/Images/thuc-an.webp",
  "./Data/Images/thuc-an.jpg"
];
let foodPathIdx = 0;
foodImg.onload = () => { foodImgReady = true; };
foodImg.onerror = () => {
  foodPathIdx += 1;
  if (foodPathIdx < foodPaths.length) {
    foodImg.src = foodPaths[foodPathIdx];
  }
};
foodImg.src = foodPaths[0];

let dpr = Math.min(window.devicePixelRatio || 1, 2.5);
let logicalW = window.innerWidth;
let logicalH = window.innerHeight;
let miniLogicalSize = 150;

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

// Trạng thái điều khiển PC & Mobile
let mousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let biteHold = false;
let isTouchDevice = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
let inputMode = isTouchDevice ? "touch" : "mouse";
let joystick = { active: false, touchId: null, angle: 0, power: 0 };

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

// Khắc phục hoàn toàn lỗi mờ trên điện thoại (High-DPI Scaling)
function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  logicalW = window.innerWidth;
  logicalH = window.innerHeight;

  canvas.width = Math.floor(logicalW * dpr);
  canvas.height = Math.floor(logicalH * dpr);

  const rect = miniCanvas.getBoundingClientRect();
  miniLogicalSize = rect.width > 10 ? rect.width : (logicalW <= 768 ? 96 : 150);
  miniCanvas.width = Math.floor(miniLogicalSize * dpr);
  miniCanvas.height = Math.floor(miniLogicalSize * dpr);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function refreshMobileControlsVisibility() {
  const mc = document.getElementById("mobile-controls");
  if (inputMode === "touch" || isTouchDevice) {
    mc.classList.remove("hidden");
  } else {
    mc.classList.add("hidden");
  }
}

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
    chompTimer: 0,
    buffCounts: {},
    joinedAt: Date.now()
  };

  sessionStats = { foodEaten: 0, fishKilled: 0, bossKilled: 0, reachedTier3: 0, coinsEarned: 0 };
  pendingLevelUps = 0;
  choosingBuff = false;
  biteHold = false;
  resetJoystick();
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
  resizeCanvas(); // Cập nhật độ phân giải Retina ngay khi vào màn game
  refreshMobileControlsVisibility();
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
    name: ["Cá Hổ", "Cá Đuối", "Kình Ngư", "Hải Ngư", "Cá Mập Nhỏ"][idx % 5],
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
      chomping: myFish.chompTimer > 0,
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

// ==================== ĐIỀU KHIỂN PC & CẢM ỨNG MOBILE ====================
canvas.addEventListener("mousemove", (e) => {
  if (inputMode === "touch" && joystick.active) return;
  inputMode = "mouse";
  mousePos.x = e.clientX;
  mousePos.y = e.clientY;
});

canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) {
    inputMode = "mouse";
    biteHold = true;
    performBite();
  }
});

window.addEventListener("mouseup", (e) => {
  if (e.button === 0) biteHold = false;
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

window.addEventListener("touchstart", () => {
  isTouchDevice = true;
  inputMode = "touch";
  if (inGame) refreshMobileControlsVisibility();
}, { passive: true });

// ---- CẦN GẠT JOYSTICK ĐA ĐIỂM ----
const joystickZone = document.getElementById("joystick-zone");
const joystickBase = document.getElementById("joystick-base");
const joystickKnob = document.getElementById("joystick-knob");

function resetJoystick() {
  joystick.active = false;
  joystick.touchId = null;
  joystick.power = 0;
  joystickKnob.style.transform = "translate(0px, 0px)";
}

function updateJoystickFromTouch(touch) {
  const rect = joystickBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const maxDist = rect.width * 0.42;

  const dx = touch.clientX - cx;
  const dy = touch.clientY - cy;
  const dist = Math.hypot(dx, dy);
  const clamped = Math.min(maxDist, dist);
  const angle = Math.atan2(dy, dx);

  if (dist > 4) {
    joystick.angle = angle;
  }
  joystick.power = clamped / maxDist;
  const kx = Math.cos(angle) * clamped;
  const ky = Math.sin(angle) * clamped;
  joystickKnob.style.transform = `translate(${kx}px, ${ky}px)`;
}

joystickZone.addEventListener("touchstart", (e) => {
  e.preventDefault();
  e.stopPropagation();
  inputMode = "touch";
  if (joystick.touchId === null && e.changedTouches.length > 0) {
    const t = e.changedTouches[0];
    joystick.active = true;
    joystick.touchId = t.identifier;
    updateJoystickFromTouch(t);
  }
}, { passive: false });

joystickZone.addEventListener("touchmove", (e) => {
  e.preventDefault();
  e.stopPropagation();
  for (const t of e.changedTouches) {
    if (t.identifier === joystick.touchId) {
      updateJoystickFromTouch(t);
      break;
    }
  }
}, { passive: false });

function endJoystickTouch(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === joystick.touchId) {
      resetJoystick();
      break;
    }
  }
}
joystickZone.addEventListener("touchend", endJoystickTouch);
joystickZone.addEventListener("touchcancel", endJoystickTouch);

// ---- NÚT CẮN & SKILL TRÊN MOBILE ----
const btnMobileBite = document.getElementById("btn-mobile-bite");
const btnMobileSkill = document.getElementById("btn-mobile-skill");

btnMobileBite.addEventListener("touchstart", (e) => {
  e.preventDefault();
  e.stopPropagation();
  inputMode = "touch";
  biteHold = true;
  performBite();
}, { passive: false });

const stopMobileBite = (e) => {
  e.preventDefault();
  biteHold = false;
};
btnMobileBite.addEventListener("touchend", stopMobileBite, { passive: false });
btnMobileBite.addEventListener("touchcancel", stopMobileBite, { passive: false });

btnMobileSkill.addEventListener("touchstart", (e) => {
  e.preventDefault();
  e.stopPropagation();
  inputMode = "touch";
  triggerSkill();
}, { passive: false });

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

  const isCrit = dTail <= biteRadius + targetRadius * 0.65 && dTail < dHead;
  return { hit: true, isCrit, tailX, tailY };
}

function performBite() {
  if (!inGame || !myFish || choosingBuff || myFish.biteCooldown > 0) return;

  myFish.biteCooldown = 0.38;
  myFish.chompTimer = 0.22; // Kích hoạt hoạt ảnh há miệng táp
  const myRadius = getFishRadius(myFish.tier, myFish.sizeMult);

  const biteDist = myRadius * 0.95;
  const biteRadius = myRadius * 0.88;
  const biteX = myFish.x + Math.cos(myFish.angle) * biteDist;
  const biteY = myFish.y + Math.sin(myFish.angle) * biteDist;

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
  if (myFish.chompTimer > 0) myFish.chompTimer = Math.max(0, myFish.chompTimer - dt);

  if (biteHold && myFish.biteCooldown <= 0) {
    performBite();
  }

  let moveFactor = 0;
  if (inputMode === "touch") {
    if (joystick.active) {
      myFish.angle = joystick.angle;
      moveFactor = joystick.power;
    } else if (myFish.dashTimer > 0) {
      moveFactor = 1;
    }
  } else {
    const dx = mousePos.x - logicalW / 2;
    const dy = mousePos.y - logicalH / 2;
    const distToCursor = Math.hypot(dx, dy);
    myFish.angle = Math.atan2(dy, dx);
    moveFactor = Math.min(1, distToCursor / 60);
  }

  const curSpeed = myFish.speed * (myFish.dashTimer > 0 ? 2.15 : 1.0);
  myFish.x = Math.max(40, Math.min(MAP_SIZE - 40, myFish.x + Math.cos(myFish.angle) * curSpeed * moveFactor * dt));
  myFish.y = Math.max(40, Math.min(MAP_SIZE - 40, myFish.y + Math.sin(myFish.angle) * curSpeed * moveFactor * dt));

  camera.x += (myFish.x - camera.x) * 0.14;
  camera.y += (myFish.y - camera.y) * 0.14;

  const myRadius = getFishRadius(myFish.tier, myFish.sizeMult);

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

  for (let i = biteEffects.length - 1; i >= 0; i--) {
    biteEffects[i].life -= dt;
    if (biteEffects[i].life <= 0) biteEffects.splice(i, 1);
  }

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
  biteHold = false;
  resetJoystick();
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

// ==================== VẼ THỦY CUNG & MODEL CÁ "CÂU CÁ VẠN CÂN" ====================
function renderGame() {
  const w = logicalW, h = logicalH;
  // Đặt hệ quy chiếu High-DPI để hình ảnh trên điện thoại sắc nét tuyệt đối
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const viewScale = Math.min(1.0, Math.max(0.56, Math.min(w, h) / 760));

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#0b5b8c");
  grad.addColorStop(0.55, "#053356");
  grad.addColorStop(1, "#02182b");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Tia sáng rọi xuống đáy thủy cung
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#a5f3fc";
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
  ctx.translate(w / 2, h / 2);
  ctx.scale(viewScale, viewScale);
  ctx.translate(-camera.x, -camera.y);

  // Ranh giới thủy cung
  ctx.strokeStyle = "rgba(77, 184, 255, 0.5)";
  ctx.lineWidth = 10;
  ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);

  // San hô nền
  corals.forEach(c => {
    ctx.fillStyle = `hsla(${c.hue}, 55%, 32%, 0.22)`;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  });

  // Bong bóng nước
  bubbles.forEach(b => {
    ctx.strokeStyle = "rgba(200, 244, 255, 0.35)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Mồi thủy cung (hạt ngọc phát sáng)
 // Mồi thủy cung bằng hình ảnh Data/Images/thuc-an
  const t = performance.now() / 1000;
  foods.forEach(f => {
    const pulse = Math.sin(t * 3.5 + f.phase) * 1.5;
    const bobY = Math.sin(t * 2.5 + f.phase) * 3;
    if (foodImgReady) {
      const size = (f.r * 5.2) + pulse * 2;
      if (f.val > 20) {
        // Mồi lớn rớt từ cá bị hạ có quầng sáng vàng nổi bật
        ctx.save();
        ctx.globalAlpha = 0.38 + Math.sin(t * 5 + f.phase) * 0.12;
        ctx.fillStyle = "#ffd43b";
        ctx.beginPath();
        ctx.arc(f.x, f.y + bobY, size * 0.38, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.drawImage(foodImg, f.x - size / 2, f.y + bobY - size / 2, size, size);
    } else {
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r + pulse, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  projectiles.forEach(pr => {
    ctx.fillStyle = pr.color;
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, 10, 0, Math.PI * 2);
    ctx.fill();
  });

  const top1Uid = getTop1Uid();

  aiFishes.forEach(ai => {
    drawDetailedFish(ai.x, ai.y, ai.angle, ai.species, ai.tier, 1, ai.name, ai.hp, ai.maxHp, false, false, false, 0, t);
  });

  Object.values(remotePlayers).forEach(p => {
    drawDetailedFish(p.x, p.y, p.angle, p.species, p.tier || 1, p.sizeMult || 1, p.name, p.hp, p.maxHp, p.uid === top1Uid, false, p.shield, p.chomping ? 0.8 : 0, t);
  });

  if (bossState && bossState.alive) {
    drawDetailedFish(bossState.x, bossState.y, bossState.angle || 0, "boss", bossState.tier, 1.35, `BOSS THỦY CUNG (Cấp ${bossState.tier})`, bossState.hp, bossState.maxHp, false, true, false, 0.35, t);
  }

  if (myFish) {
    const chomp = myFish.chompTimer > 0 ? myFish.chompTimer / 0.22 : 0;
    drawDetailedFish(myFish.x, myFish.y, myFish.angle, myFish.species, myFish.tier, myFish.sizeMult, myFish.name, myFish.hp, myFish.maxHp, myFish.uid === top1Uid, false, myFish.shieldTimer > 0, chomp, t);
  }

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
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = 3;
    ctx.strokeText(ft.text, ft.x, ft.y);
    ctx.fillText(ft.text, ft.x, ft.y);
  });

  ctx.restore();
}

// Hàm vẽ vây năng lượng pha lê trong suốt (giống hình thủy quái Câu Cá Vạn Cân)
function drawEnergyBladeFin(x, y, len, width, angleOffset, baseColor, glowColor, wag) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angleOffset + wag);
  const grad = ctx.createLinearGradient(0, 0, -len, 0);
  grad.addColorStop(0, baseColor);
  grad.addColorStop(0.55, glowColor);
  grad.addColorStop(1, "rgba(255, 255, 255, 0.9)");

  ctx.fillStyle = grad;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-len * 0.45, -width * 1.15, -len, -width * 0.25);
  ctx.quadraticCurveTo(-len * 0.55, width * 0.35, 0, width * 0.25);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

function drawDetailedFish(x, y, angle, species, tier, sizeMult, name, hp, maxHp, isTop1, isBoss, hasShield, chompRatio, t) {
  const r = getFishRadius(tier, sizeMult);
  const cfg = isBoss
    ? {
        color: "#0f172a",
        midColor: "#1e3a5f",
        bellyColor: "#cbd5e1",
        accent: "#38bdf8",
        finGlow: "#a5f3fc"
      }
    : (FISH_TYPES[species] || FISH_TYPES.swordfish);

  ctx.save();
  ctx.translate(x, y);

  // Hào quang bá khí cho bậc 3+ và Boss
  if (tier >= 3 || isBoss) {
    const auraAlpha = isBoss ? 0.34 : 0.12 + (tier - 2) * 0.06;
    const auraGrad = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 1.55);
    auraGrad.addColorStop(0, isBoss ? "rgba(56, 189, 248, 0.45)" : "rgba(186, 230, 253, 0.35)");
    auraGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.save();
    ctx.globalAlpha = auraAlpha + Math.sin(t * 4) * 0.05;
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Khiên bảo vệ
  if (hasShield) {
    ctx.strokeStyle = "#51cf66";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.38, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Xoay theo hướng bơi, lật Y khi quay sang trái để cá luôn đúng chiều lưng-bụng
  ctx.save();
  ctx.rotate(angle);
  if (Math.cos(angle) < 0) {
    ctx.scale(1, -1);
  }

  const swimWag = Math.sin(t * (7.5 + tier * 0.7)) * 0.22;
  const finWag = Math.sin(t * 8.5) * 0.16;

  if (species === "turtle") {
    // ===== MODEL RÙA CHIẾN GIÁP =====
    // 4 chân chèo trước sau
    ctx.fillStyle = cfg.color;
    ctx.strokeStyle = "#14532d";
    ctx.lineWidth = 1.8;

    // Chân sau
    ctx.save();
    ctx.translate(-r * 0.55, r * 0.45);
    ctx.rotate(0.5 - finWag);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.34, r * 0.15, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // Chân trước lớn
    ctx.save();
    ctx.translate(r * 0.35, r * 0.52);
    ctx.rotate(-0.45 + finWag * 1.4);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.46, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // Đầu rùa có mỏ & hàm cắn
    ctx.save();
    ctx.translate(r * 0.85, 0);
    ctx.fillStyle = cfg.midColor;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.05, r * 0.38, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Hàm dưới mở khi cắn
    ctx.save();
    ctx.rotate(0.1 + chompRatio * 0.45);
    ctx.fillStyle = cfg.bellyColor;
    ctx.beginPath();
    ctx.moveTo(0, r * 0.05);
    ctx.lineTo(r * 0.32, r * 0.08);
    ctx.lineTo(r * 0.05, r * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Mắt rùa sắc lạnh
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(r * 0.12, -r * 0.1, r * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.arc(r * 0.15, -r * 0.1, r * 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Mai rùa 3D phân mảng lục giác
    const shellGrad = ctx.createRadialGradient(-r * 0.1, -r * 0.3, r * 0.1, 0, 0, r);
    shellGrad.addColorStop(0, cfg.accent);
    shellGrad.addColorStop(0.6, cfg.color);
    shellGrad.addColorStop(1, "#14532d");
    ctx.fillStyle = shellGrad;
    ctx.beginPath();
    ctx.moveTo(-r * 0.95, r * 0.18);
    ctx.bezierCurveTo(-r * 0.8, -r * 0.92, r * 0.75, -r * 0.88, r * 0.88, r * 0.18);
    ctx.quadraticCurveTo(0, r * 0.35, -r * 0.95, r * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = tier >= 3 ? "#ffd43b" : "#8ce99a";
    ctx.stroke();

    // Hoa văn mảng giáp trên mai
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, -r * 0.48); ctx.lineTo(r * 0.4, -r * 0.48);
    ctx.moveTo(-r * 0.15, -r * 0.65); ctx.lineTo(-r * 0.25, r * 0.15);
    ctx.moveTo(r * 0.2, -r * 0.62); ctx.lineTo(r * 0.25, r * 0.15);
    ctx.stroke();

    // Gai giáp khi tiến hóa bậc 3+
    if (tier >= 3) {
      drawEnergyBladeFin(-r * 0.2, -r * 0.62, r * 0.75, r * 0.28, -0.35, cfg.midColor, cfg.finGlow, finWag);
    }
  } else {
    // ===== MODEL CÁ / THỦY QUÁI / BOSS (GIỐNG ẢNH CÂU CÁ VẠN CÂN) =====
    const bodyLen = (isBoss || species === "swordfish") ? r * 1.25 : r * 1.08;
    const bodyH = species === "butterfish" ? r * 0.78 : r * 0.56;

    // 1. Vây đuôi lớn (uốn lượn theo nhịp bơi)
    ctx.save();
    ctx.translate(-bodyLen * 0.82, 0);
    ctx.rotate(swimWag);
    if (tier >= 3 || isBoss) {
      drawEnergyBladeFin(0, -bodyH * 0.15, r * 1.15, r * 0.42, -0.35, cfg.midColor, cfg.finGlow, 0);
      drawEnergyBladeFin(0, bodyH * 0.15, r * 0.95, r * 0.35, 0.35, cfg.midColor, cfg.finGlow, 0);
    } else {
      const tailGrad = ctx.createLinearGradient(0, 0, -r * 0.9, 0);
      tailGrad.addColorStop(0, cfg.color);
      tailGrad.addColorStop(1, cfg.accent);
      ctx.fillStyle = tailGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-r * 0.5, -r * 0.65, -r * 0.92, -r * 0.68);
      ctx.quadraticCurveTo(-r * 0.48, 0, -r * 0.92, r * 0.68);
      ctx.quadraticCurveTo(-r * 0.5, r * 0.65, 0, 0);
      ctx.fill();
      ctx.strokeStyle = cfg.bellyColor;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.restore();

    // 2. Vây lưng (bậc cao biến thành dải vây pha lê dài thướt tha giống ảnh!)
    if (tier >= 3 || isBoss) {
      drawEnergyBladeFin(r * 0.15, -bodyH * 0.78, r * 1.55, r * 0.36, -0.25, cfg.midColor, cfg.finGlow, finWag * 0.5);
      drawEnergyBladeFin(-r * 0.22, -bodyH * 0.68, r * 1.25, r * 0.28, -0.2, cfg.color, cfg.finGlow, -finWag * 0.4);
    } else {
      ctx.fillStyle = cfg.midColor;
      ctx.beginPath();
      ctx.moveTo(r * 0.18, -bodyH * 0.72);
      ctx.quadraticCurveTo(-r * 0.25, -bodyH * 1.55, -r * 0.58, -bodyH * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = cfg.accent;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // 3. Thân cá thuôn dài kiểu cá đại dương / rồng biển
    const bodyGrad = ctx.createLinearGradient(0, -bodyH, 0, bodyH);
    bodyGrad.addColorStop(0, cfg.color);
    bodyGrad.addColorStop(0.52, cfg.midColor);
    bodyGrad.addColorStop(0.75, cfg.bellyColor);
    bodyGrad.addColorStop(1, cfg.bellyColor);

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(bodyLen * 0.95, -bodyH * 0.05); // Mũi
    ctx.bezierCurveTo(bodyLen * 0.45, -bodyH * 1.05, -bodyLen * 0.45, -bodyH * 0.92, -bodyLen * 0.88, -bodyH * 0.14);
    ctx.lineTo(-bodyLen * 0.88, bodyH * 0.16);
    ctx.bezierCurveTo(-bodyLen * 0.45, bodyH * 0.92, bodyLen * 0.35, bodyH * 0.95, bodyLen * 0.86, bodyH * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = isBoss ? "#38bdf8" : "rgba(255,255,255,0.45)";
    ctx.stroke();

    // Đường hông ánh kim (giống con cá trên cùng góc trái ảnh)
    ctx.strokeStyle = cfg.accent;
    ctx.lineWidth = Math.max(1.5, r * 0.06);
    ctx.beginPath();
    ctx.moveTo(bodyLen * 0.42, -bodyH * 0.05);
    ctx.quadraticCurveTo(0, -bodyH * 0.18, -bodyLen * 0.78, 0);
    ctx.stroke();

    // Các đốt giáp bụng hoặc vảy cá
    ctx.strokeStyle = isBoss ? "rgba(15, 23, 42, 0.45)" : "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 1.4;
    for (let s = -2; s <= 2; s++) {
      const sx = s * r * 0.24;
      ctx.beginPath();
      ctx.arc(sx, bodyH * 0.22, r * 0.22, -0.7, 0.9);
      ctx.stroke();
    }

    // Mũi kiếm dài cho Cá Kiếm
    if (species === "swordfish") {
      const swordGrad = ctx.createLinearGradient(bodyLen * 0.75, 0, bodyLen * 1.65, 0);
      swordGrad.addColorStop(0, cfg.color);
      swordGrad.addColorStop(1, "#f0f9ff");
      ctx.fillStyle = swordGrad;
      ctx.beginPath();
      ctx.moveTo(bodyLen * 0.78, -bodyH * 0.18);
      ctx.lineTo(bodyLen * 1.68, -bodyH * 0.02);
      ctx.lineTo(bodyLen * 0.78, bodyH * 0.14);
      ctx.closePath();
      ctx.fill();
    }

    // Sừng chiến giáp trên đầu (Boss & Bậc 3+)
    if (isBoss || tier >= 3 || species === "kingfish") {
      ctx.fillStyle = isBoss ? "#1e293b" : "#ffd43b";
      ctx.beginPath();
      ctx.moveTo(bodyLen * 0.55, -bodyH * 0.42);
      ctx.lineTo(bodyLen * 0.15, -bodyH * 1.25);
      ctx.lineTo(bodyLen * 0.3, -bodyH * 0.55);
      ctx.lineTo(-bodyLen * 0.05, -bodyH * 1.12);
      ctx.lineTo(bodyLen * 0.1, -bodyH * 0.52);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = cfg.accent;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // 4. Hàm dưới cử động & Răng sắc (há rộng khi bấm Chuột trái Cắn!)
    const jawAngle = (isBoss || species === "kingfish" ? 0.18 : 0.06) + chompRatio * 0.52;
    ctx.save();
    ctx.translate(bodyLen * 0.55, bodyH * 0.16);
    ctx.rotate(jawAngle);
    // Khoang miệng tối
    ctx.fillStyle = "#450a0a";
    ctx.beginPath();
    ctx.moveTo(0, -bodyH * 0.12);
    ctx.lineTo(r * 0.45, 0);
    ctx.lineTo(0, bodyH * 0.14);
    ctx.closePath();
    ctx.fill();
    // Răng nhọn trắng
    ctx.fillStyle = "#fff";
    for (let tIdx = 0; tIdx < 3; tIdx++) {
      const tx = r * (0.1 + tIdx * 0.11);
      ctx.beginPath();
      ctx.moveTo(tx, bodyH * 0.08);
      ctx.lineTo(tx + 3, -bodyH * 0.06);
      ctx.lineTo(tx + 6, bodyH * 0.08);
      ctx.fill();
    }
    // Viền hàm dưới
    ctx.fillStyle = cfg.bellyColor;
    ctx.beginPath();
    ctx.moveTo(-r * 0.1, bodyH * 0.06);
    ctx.lineTo(r * 0.46, bodyH * 0.04);
    ctx.quadraticCurveTo(r * 0.15, bodyH * 0.28, -r * 0.12, bodyH * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Đường mang cá (Gill)
    ctx.strokeStyle = "rgba(15, 23, 42, 0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bodyLen * 0.28, 0, bodyH * 0.55, -0.75, 0.75);
    ctx.stroke();

    // Mắt cá sắc bén có ánh sáng
    const eyeX = bodyLen * 0.52;
    const eyeY = -bodyH * 0.22;
    ctx.fillStyle = isBoss ? "#e0f2fe" : "#ffffff";
    ctx.beginPath();
    ctx.ellipse(eyeX, eyeY, r * 0.16, r * 0.13, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isBoss ? "#0284c7" : "#0f172a";
    ctx.beginPath();
    ctx.arc(eyeX + r * 0.04, eyeY, r * 0.075, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(eyeX + r * 0.06, eyeY - r * 0.04, r * 0.03, 0, Math.PI * 2);
    ctx.fill();

    // Vây ngực bên hông (bay phấp phới)
    if (tier >= 3 || isBoss) {
      drawEnergyBladeFin(bodyLen * 0.22, bodyH * 0.35, r * 1.25, r * 0.26, 0.28, cfg.midColor, cfg.finGlow, finWag);
    } else {
      ctx.save();
      ctx.translate(bodyLen * 0.22, bodyH * 0.35);
      ctx.rotate(0.3 + finWag);
      ctx.fillStyle = cfg.accent;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-r * 0.45, r * 0.35, -r * 0.65, r * 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.restore(); // Kết thúc xoay cá

  // ===== THANH MÁU & TÊN PHÍA TRÊN ĐẦU (LUÔN ĐỨNG THẲNG) =====
  const barW = Math.max(56, r * 1.6);
  const barY = -r - 24;

  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(-barW / 2, barY, barW, 8);
  const hpRatio = Math.max(0, Math.min(1, (hp || 0) / (maxHp || 1)));
  ctx.fillStyle = isBoss ? "#ff3b3b" : "#51cf66";
  ctx.fillRect(-barW / 2, barY, barW * hpRatio, 8);
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1;
  ctx.strokeRect(-barW / 2, barY, barW, 8);

  ctx.font = isBoss ? "bold 14px Segoe UI" : "bold 12px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillStyle = isBoss ? "#ff8787" : "#ffffff";
  const prefix = isTop1 ? "👑 " : "";
  ctx.strokeStyle = "rgba(0,0,0,0.8)";
  ctx.lineWidth = 3;
  ctx.strokeText(`${prefix}${name}`, 0, barY - 6);
  ctx.fillText(`${prefix}${name}`, 0, barY - 6);

  ctx.restore();
}

// ==================== MINIMAP & HUD (HIGH-DPI) ====================
function getTop1Uid() {
  const all = [myFish, ...Object.values(remotePlayers)].filter(Boolean);
  all.sort((a, b) => (b.score || 0) - (a.score || 0));
  return all[0]?.uid;
}

function renderMinimap() {
  const mw = miniLogicalSize, mh = miniLogicalSize;
  miniCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  miniCtx.clearRect(0, 0, mw, mh);
  const scale = mw / MAP_SIZE;
  const top1Uid = getTop1Uid();

  Object.values(remotePlayers).forEach(p => {
    const mx = p.x * scale, my = p.y * scale;
    if (p.uid === top1Uid) {
      miniCtx.font = "12px Segoe UI";
      miniCtx.textAlign = "center";
      miniCtx.fillText("👑", mx, my + 4);
    } else {
      miniCtx.fillStyle = "#ffd43b";
      miniCtx.beginPath();
      miniCtx.arc(mx, my, 3.2, 0, Math.PI * 2);
      miniCtx.fill();
    }
  });

  if (bossState && bossState.alive) {
    miniCtx.fillStyle = "#ff3b3b";
    miniCtx.beginPath();
    miniCtx.arc(bossState.x * scale, bossState.y * scale, 5, 0, Math.PI * 2);
    miniCtx.fill();
  }

  if (myFish) {
    const mx = myFish.x * scale, my = myFish.y * scale;
    if (myFish.uid === top1Uid) {
      miniCtx.font = "12px Segoe UI";
      miniCtx.textAlign = "center";
      miniCtx.fillText("👑", mx, my + 4);
    } else {
      miniCtx.fillStyle = "#51cf66";
      miniCtx.beginPath();
      miniCtx.arc(mx, my, 3.8, 0, Math.PI * 2);
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
  document.getElementById("mobile-skill-label").textContent = cfg.skillName;

  const cdOv = document.getElementById("hud-skill-cd");
  const mobileCdOv = document.getElementById("mobile-skill-cd");
  if (myFish.skillTimer > 0) {
    const txt = myFish.skillTimer.toFixed(1) + "s";
    cdOv.style.opacity = "1";
    cdOv.textContent = txt;
    mobileCdOv.style.opacity = "1";
    mobileCdOv.textContent = txt;
  } else {
    cdOv.style.opacity = "0";
    mobileCdOv.style.opacity = "0";
  }

  const buffBar = document.getElementById("active-buffs-bar");
  buffBar.innerHTML = Object.entries(myFish.buffCounts).map(([bid, cnt]) => {
    const b = BUFF_POOL.find(x => x.id === bid);
    return `<div class="buff-badge">${b.icon} <span class="cnt">x${cnt}</span></div>`;
  }).join("");

  const all = [myFish, ...Object.values(remotePlayers)].filter(Boolean);
  all.sort((a, b) => (b.score || 0) - (a.score || 0));
  document.getElementById("ingame-leaderboard").innerHTML = all.slice(0, 5).map((p, i) => `
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
    banner.textContent = `⏳ Boss hồi sinh: ${sec}s`;
  }
}

// ==================== THOÁT / CHẾT & LƯU NHIỆM VỤ ====================
document.getElementById("btn-menu-exit").addEventListener("click", () => {
  biteHold = false;
  resetJoystick();
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
  biteHold = false;
  resetJoystick();
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