import { auth, googleProvider, db } from "./firebase-config.js";
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  ref, set, get, update, push, query, limitToLast,
  onValue, onChildAdded, remove, onDisconnect, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ==================== CẤU HÌNH GAME ====================
const MAP_SIZE = 3200;
const BASE_FOOD_COUNT = 240;
const BOSS_RESPAWN_MS = 60000;   // 1 phút
const EVENT_DURATION_MS = 30000; // Sự kiện kéo dài 30 giây
const EVENT_INTERVAL_MS = 120000;// Mỗi 2 phút diễn ra 1 lần
const DOMAIN_RADIUS = 340;       // Bán kính lĩnh vực Áp Chế Tuyệt Đối

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
    ultName: "Lưỡi Kiếm Tinh Xảo",
    desc: "ST +20%, hồi 1 HP khi ăn mồi. Đặc biệt: Lưỡi kiếm tinh xảo (+50% tầm cắn & ST, chém đứt)."
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
    ultName: "Phòng Ngự Tuyệt Đối",
    desc: "Giảm 20% ST nhận, hồi 1 HP khi ăn mồi. Đặc biệt: Miễn nhiễm ST, phản 100% ST."
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
    ultName: "Tốc Độ Ánh Sáng",
    desc: "Tốc độ +20%, hồi 1 HP khi ăn mồi. Đặc biệt: +100% tốc độ, 50% né ST, tạo lưu ảnh."
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
    ultName: "Áp Chế Tuyệt Đối",
    desc: "Giá 100 Coin/ván. ST+15%, Tốc+15%, Giảm ST 15%, Hồi 5HP. Đặc biệt: Lĩnh vực áp chế huyết mạch."
  }
};

// 5 Dạng tiến hóa (đổi dạng mỗi 10 cấp: 1, 10, 20, 30, 40)
const EVO_TIERS = [
  { tier: 1, name: "Cá Con Tập Sự", baseRadius: 22 },
  { tier: 2, name: "Chiến Ngư Thủy Cung", baseRadius: 31 },
  { tier: 3, name: "Thủy Quái Vạn Cân", baseRadius: 41 },
  { tier: 4, name: "Bá Chủ Biển Sâu", baseRadius: 52 },
  { tier: 5, name: "Thần Ngư Hải Vương", baseRadius: 65 }
];

const EVENTS_POOL = [
  { id: "feast", title: "🍖 ĐẠI TIỆC CỦA VUA CÁ", desc: "Lượng mồi trong Thủy Cung tăng thêm 50%!" },
  { id: "blessing", title: "✨ PHÚC LỘC CỦA VUA CÁ", desc: "Kinh nghiệm (EXP) nhận được nhân đôi (x2)!" },
  { id: "migration", title: "💨 BẦY CÁ DI CƯ", desc: "Tốc độ bơi toàn thủy cung tăng 50%!" },
  { id: "predator", title: "⚔️ CÁ SĂN MỒI", desc: "Sát thương gây ra tăng 30%!" },
  { id: "weakness", title: "🌀 CÁ SUY YẾU", desc: "Toàn bộ chỉ số cá bị giảm 20%!" }
];

const BOSS_SPAWNS = [
  { id: "boss_0", name: "Boss Bắc Hải", x: 850, y: 850 },
  { id: "boss_1", name: "Boss Đông Hải", x: 2350, y: 1050 },
  { id: "boss_2", name: "Boss Nam Hải", x: 1600, y: 2350 }
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
  { id: "evo3", title: "Đạt cấp 10 (Tiến hóa Dạng 2)", target: 1, reward: 90, statKey: "reachedTier2" },
  { id: "boss1", title: "Hạ gục 1 Boss Thủy Cung", target: 1, reward: 250, statKey: "bossKilled" },
  { id: "play3", title: "Hoàn thành 3 trận đấu", target: 3, reward: 75, statKey: "gamesPlayed" }
];

// ==================== STATE NGƯỜI CHƠI & RESET NHIỆM VỤ ====================
let currentUser = null;
let userData = null;
let selectedFishId = "swordfish";

function getTodayDateVN() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
}

const createFreshQuests = () => ({
  foodEaten: 0,
  fishKilled: 0,
  reachedTier2: 0,
  bossKilled: 0,
  gamesPlayed: 0,
  claimed: {},
  lastResetDate: getTodayDateVN()
});

const defaultUserData = (user) => ({
  nickname: user.displayName ? user.displayName.slice(0, 14) : "Ngư Thủ",
  coins: 150,
  bestScore: 0,
  upgrades: { hp: 0, speed: 0, dmg: 0 },
  quests: createFreshQuests()
});

async function ensureDailyQuestReset(shouldSave = true) {
  if (!userData) return;
  const today = getTodayDateVN();
  if (!userData.quests || userData.quests.lastResetDate !== today) {
    userData.quests = createFreshQuests();
    if (shouldSave && currentUser) {
      await saveUserData();
    }
  } else if (!userData.quests.claimed) {
    userData.quests.claimed = {};
  }
}

// ==================== DOM REFERENCES ====================
const screens = {
  login: document.getElementById("login-screen"),
  lobby: document.getElementById("lobby-screen"),
  game: document.getElementById("game-screen")
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");

  const chatWidget = document.getElementById("chat-widget");
  if (name === "login") {
    chatWidget.classList.add("hidden");
  } else {
    chatWidget.classList.remove("hidden");
    chatWidget.classList.toggle("lobby-pos", name === "lobby");
  }
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
      status.textContent = "Lỗi đăng nhập: " + err.message + " (Nếu mở từ Messenger/Zalo hãy mở bằng Chrome/Safari)";
    }
  }
});

document.getElementById("btn-logout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUser = null;
    stopChatListener();
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
    if (!userData.upgrades) userData.upgrades = { hp: 0, speed: 0, dmg: 0 };
    await ensureDailyQuestReset(true);
  }
  initChat();
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

async function renderLobby() {
  await ensureDailyQuestReset(true);

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
      await ensureDailyQuestReset(true);
      if ((userData.quests[q.statKey] || 0) < q.target || userData.quests.claimed[q.id]) {
        return renderLobby();
      }
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

// ==================== HỆ THỐNG CHAT ONLINE ====================
let chatUnsub = null;
let chatOpen = false;
let unreadChatCount = 0;
let lastChatSentAt = 0;

const chatBox = document.getElementById("chat-box");
const chatToggleBtn = document.getElementById("chat-toggle-btn");
const chatCloseBtn = document.getElementById("chat-close-btn");
const chatUnreadBadge = document.getElementById("chat-unread");
const chatMessagesEl = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

function setChatOpen(open) {
  chatOpen = open;
  chatBox.classList.toggle("hidden", !open);
  chatToggleBtn.classList.toggle("hidden", open);
  if (open) {
    unreadChatCount = 0;
    chatUnreadBadge.classList.add("hidden");
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }
}

chatToggleBtn.addEventListener("click", () => setChatOpen(true));
chatCloseBtn.addEventListener("click", () => setChatOpen(false));

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser || !userData) return;
  const text = chatInput.value.trim();
  if (!text) return;
  const now = Date.now();
  if (now - lastChatSentAt < 800) return;
  lastChatSentAt = now;
  chatInput.value = "";

  await push(ref(db, "chat/messages"), {
    uid: currentUser.uid,
    name: userData.nickname || "Ngư Thủ",
    text: text.slice(0, 120),
    createdAt: now
  });
});

function initChat() {
  stopChatListener();
  setChatOpen(!isTouchDevice && window.innerWidth > 768);

  const chatQuery = query(ref(db, "chat/messages"), limitToLast(25));
  let initialLoaded = false;
  chatUnsub = onValue(chatQuery, (snap) => {
    const data = snap.val();
    const list = data ? Object.values(data).sort((a, b) => a.createdAt - b.createdAt) : [];
    const prevCount = chatMessagesEl.children.length;
    chatMessagesEl.innerHTML = list.map(m => {
      const isMe = currentUser && m.uid === currentUser.uid;
      return `<div class="chat-msg ${isMe ? "me" : ""}">
        <span class="c-name">${escapeHtml(m.name)}:</span>
        <span>${escapeHtml(m.text)}</span>
      </div>`;
    }).join("");
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;

    if (initialLoaded && !chatOpen && list.length >= prevCount) {
      unreadChatCount += 1;
      chatUnreadBadge.textContent = unreadChatCount > 9 ? "9+" : unreadChatCount;
      chatUnreadBadge.classList.remove("hidden");
    }
    initialLoaded = true;
  });
}

function stopChatListener() {
  if (chatUnsub) {
    chatUnsub();
    chatUnsub = null;
  }
}

// ==================== GAME ENGINE (HIGH-DPI + MULTIPLAYER) ====================
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const miniCanvas = document.getElementById("minimap-canvas");
const miniCtx = miniCanvas.getContext("2d");

// Tải hình ảnh tài nguyên tùy chỉnh trong Data/Images/
function loadOptionalImage(paths) {
  const obj = { img: new Image(), ready: false };
  let idx = 0;
  obj.img.onload = () => { obj.ready = true; };
  obj.img.onerror = () => {
    idx += 1;
    if (idx < paths.length) obj.img.src = paths[idx];
  };
  obj.img.src = paths[0];
  return obj;
}

const foodImgObj = loadOptionalImage(["./Data/Images/thuc-an.png", "./Data/Images/thuc-an.webp", "./Data/Images/thuc-an.jpg"]);
const slashImgObj = loadOptionalImage(["./Data/Images/slash-effect.png", "./Data/Images/slash-effect.webp"]);
const kingDomainImgObj = loadOptionalImage(["./Data/Images/king-domain.png", "./Data/Images/king-domain.webp"]);

const fishSpriteCache = {};
function getFishSprite(species, tier) {
  const key = species === "boss" ? "boss" : `${species}-${tier}`;
  if (!fishSpriteCache[key]) {
    const entry = { img: new Image(), ready: false };
    entry.img.onload = () => { entry.ready = true; };
    entry.img.src = `./Data/Images/${key}.png`;
    fishSpriteCache[key] = entry;
  }
  return fishSpriteCache[key];
}

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
let reflectEffects = [];
let afterimages = [];
let afterimageSpawnTimer = 0;
let bossesState = {};
let eventState = null;

let mousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let biteHold = false;
let isTouchDevice = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
let inputMode = isTouchDevice ? "touch" : "mouse";
let joystick = { active: false, touchId: null, angle: 0, power: 0 };

let camera = { x: MAP_SIZE / 2, y: MAP_SIZE / 2 };
let sessionStats = { foodEaten: 0, fishKilled: 0, bossKilled: 0, reachedTier2: 0, coinsEarned: 0 };
let pendingLevelUps = 0;
let choosingBuff = false;

const corals = Array.from({ length: 45 }, () => ({
  x: Math.random() * MAP_SIZE,
  y: Math.random() * MAP_SIZE,
  r: 30 + Math.random() * 70,
  hue: 160 + Math.random() * 180
}));

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  logicalW = window.innerWidth;
  logicalH = window.innerHeight;

  canvas.width = Math.floor(logicalW * dpr);
  canvas.height = Math.floor(logicalH * dpr);

  const rect = miniCanvas.getBoundingClientRect();
  miniLogicalSize = rect.width > 10 ? rect.width : (logicalW <= 768 ? 92 : 150);
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

// ==================== TÍNH CHỈ SỐ ĐỘNG (SỰ KIỆN + SKILL ĐẶC BIỆT + LĨNH VỰC VUA) ====================
function getTierFromLevel(lvl) {
  return Math.min(EVO_TIERS.length, 1 + Math.floor(lvl / 10));
}

function getFishRadius(level, tier, sizeMult = 1) {
  const t = Math.min(EVO_TIERS.length, Math.max(1, tier));
  const baseR = EVO_TIERS[t - 1].baseRadius;
  // Khi chưa đủ 10 cấp, mỗi cấp tăng dần kích thước (+4.5%/cấp)
  const subLevel = t === 1 ? (level - 1) : (level % 10);
  const levelScale = 1 + Math.max(0, subLevel) * 0.042;
  return baseR * levelScale * sizeMult;
}

function getActiveEventType() {
  if (!eventState || !eventState.active) return null;
  if (Date.now() > eventState.endsAt) return null;
  return eventState.type;
}

function getKingDomainEffects() {
  if (!myFish) return { suppressed: false, suppressedCount: 0 };
  let suppressed = false;
  let suppressedCount = 0;

  // Kiểm tra mình có đang bị Cá Của Vua khác áp chế không
  Object.values(remotePlayers).forEach(p => {
    if (p.ultActive && p.species === "kingfish") {
      if (Math.hypot(p.x - myFish.x, p.y - myFish.y) <= DOMAIN_RADIUS) {
        suppressed = true;
      }
    }
  });

  // Nếu mình là Cá Của Vua đang bật Áp Chế Tuyệt Đối, đếm số cá địch trong lĩnh vực
  if (myFish.ultTimer > 0 && myFish.species === "kingfish") {
    aiFishes.forEach(ai => {
      if (Math.hypot(ai.x - myFish.x, ai.y - myFish.y) <= DOMAIN_RADIUS) suppressedCount++;
    });
    Object.values(remotePlayers).forEach(p => {
      if (Math.hypot(p.x - myFish.x, p.y - myFish.y) <= DOMAIN_RADIUS) suppressedCount++;
    });
    Object.values(bossesState).forEach(b => {
      if (b && b.alive && Math.hypot(b.x - myFish.x, b.y - myFish.y) <= DOMAIN_RADIUS) suppressedCount++;
    });
  }

  return { suppressed, suppressedCount };
}

function getEffectiveStats() {
  if (!myFish) return null;
  const ev = getActiveEventType();
  const domain = getKingDomainEffects();

  let speedMult = 1;
  let dmgMult = 1;
  let maxHpMult = 1;
  let biteRangeMult = 1;
  let expMult = 1;
  let dmgTakenMult = myFish.dmgTakenMult;

  // Ảnh hưởng Sự kiện
  if (ev === "blessing") expMult *= 2.0;
  if (ev === "migration") speedMult *= 1.5;
  if (ev === "predator") dmgMult *= 1.3;
  if (ev === "weakness") {
    speedMult *= 0.8;
    dmgMult *= 0.8;
    maxHpMult *= 0.8;
  }

  // Ảnh hưởng Lĩnh vực Áp Chế Tuyệt Đối
  if (domain.suppressed) {
    speedMult *= 0.6;
    dmgMult *= 0.6;
    maxHpMult *= 0.6;
  }
  if (domain.suppressedCount > 0) {
    const bonus = 1 + domain.suppressedCount * 0.10;
    speedMult *= bonus;
    dmgMult *= bonus;
    maxHpMult *= bonus;
  }

  // Ảnh hưởng Skill Đặc Biệt (10 giây + miễn thương 50%)
  if (myFish.ultTimer > 0) {
    dmgTakenMult *= 0.5; // Miễn thương 50%
    if (myFish.species === "swordfish") {
      biteRangeMult *= 1.5;
      dmgMult *= 1.5;
    } else if (myFish.species === "turtle") {
      dmgTakenMult = 0; // Sát thương nhận vào bằng 0
    } else if (myFish.species === "butterfish") {
      speedMult *= 2.0; // Tốc độ tăng 100%
    }
  }

  return {
    speed: myFish.baseSpeed * speedMult,
    dmg: myFish.baseDmg * dmgMult,
    maxHp: Math.round(myFish.baseMaxHp * maxHpMult),
    biteRangeMult,
    expMult,
    dmgTakenMult,
    suppressed: domain.suppressed
  };
}

// ==================== BẮT ĐẦU TRẬN ĐẤU ====================
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
    level: 1,
    tier: 1,
    exp: 0,
    expNeed: 45,
    score: 0,
    hp: baseHp,
    baseMaxHp: baseHp,
    baseSpeed,
    baseDmg,
    dmgTakenMult: fishCfg.dmgTakenMult,
    healOnFood: fishCfg.healOnFood,
    healOnKill: fishCfg.healOnKill,
    eatRangeBonus: 1,
    sizeMult: 1,
    skillDmgMult: 1,
    skillCdMult: 1,
    skillTimer: 0,
    ultTimer: 0,
    ultCdTimer: 0,
    shieldTimer: 3.0,
    dashTimer: 0,
    reflectTimer: 0,
    biteCooldown: 0,
    chompTimer: 0,
    buffCounts: {},
    joinedAt: Date.now()
  };

  sessionStats = { foodEaten: 0, fishKilled: 0, bossKilled: 0, reachedTier2: 0, coinsEarned: 0 };
  pendingLevelUps = 0;
  choosingBuff = false;
  biteHold = false;
  resetJoystick();
  floatingTexts = [];
  projectiles = [];
  biteEffects = [];
  reflectEffects = [];
  afterimages = [];

  foods = Array.from({ length: BASE_FOOD_COUNT }, () => spawnFood());
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
  if (isTouchDevice || window.innerWidth <= 768) setChatOpen(false);
  resizeCanvas();
  refreshMobileControlsVisibility();
  inGame = true;

  await connectRealtimeRoom();
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
  const level = 1 + Math.floor(Math.random() * 14);
  const tier = getTierFromLevel(level);
  const maxHp = 75 + level * 18;
  return {
    id: "ai_" + idx + "_" + Math.random().toString(36).slice(2, 6),
    name: ["Cá Hổ", "Cá Đuối", "Kình Ngư", "Hải Ngư", "Cá Mập Nhỏ"][idx % 5],
    species: sp,
    level,
    tier,
    x: Math.random() * MAP_SIZE,
    y: Math.random() * MAP_SIZE,
    angle: Math.random() * Math.PI * 2,
    hp: maxHp,
    maxHp,
    dmg: 10 + level * 3,
    speed: 135 + Math.random() * 40,
    biteCooldown: 0,
    aiTimer: 0
  };
}

// ==================== FIREBASE REALTIME & RESET MAP ====================
let unsubListeners = [];

async function resetWorldMapInFirebase() {
  const bossTier = 2;
  const maxHp = 600 + bossTier * 450;
  const bossesInit = {};
  BOSS_SPAWNS.forEach((sp, idx) => {
    bossesInit[sp.id] = {
      id: sp.id,
      name: sp.name,
      alive: true,
      tier: bossTier,
      level: 10,
      x: sp.x,
      y: sp.y,
      homeX: sp.x,
      homeY: sp.y,
      angle: idx * 2,
      hp: maxHp,
      maxHp,
      dmg: 28 + bossTier * 12,
      respawnAt: 0,
      lastHitBy: ""
    };
  });

  const now = Date.now();
  await set(ref(db, "rooms/main/bosses"), bossesInit);
  await set(ref(db, "rooms/main/event"), {
    active: false,
    type: "",
    startedAt: 0,
    endsAt: 0,
    nextEventAt: now + 60000 // Sự kiện đầu tiên sau 1 phút, sau đó mỗi 2 phút
  });
  await remove(ref(db, "rooms/main/hits"));
}

async function connectRealtimeRoom() {
  // Kiểm tra xem map có đang trống không để reset map về ban đầu
  const playersSnap = await get(ref(db, "rooms/main/players"));
  const existing = playersSnap.val() || {};
  const now = Date.now();
  let activeOthers = 0;
  for (const [uid, p] of Object.entries(existing)) {
    if (uid !== currentUser.uid) {
      if (p.updatedAt && now - p.updatedAt < 15000) {
        activeOthers++;
      } else {
        remove(ref(db, `rooms/main/players/${uid}`));
      }
    }
  }
  if (activeOthers === 0) {
    await resetWorldMapInFirebase();
  }

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

    if (hit.isReflectFx) {
      reflectEffects.push({ x: myFish.x, y: myFish.y, life: 0.35, maxLife: 0.35 });
    }
    if (myFish.shieldTimer > 0) return;

    // Cá Chim (Tốc Độ Ánh Sáng): 50% tỉ lệ né sát thương
    if (myFish.ultTimer > 0 && myFish.species === "butterfish" && Math.random() < 0.5) {
      addFloatingText(myFish.x, myFish.y - 34, "💨 Hụt!", "#74c0fc", 1.15);
      return;
    }

    // Rùa Biển (Phòng Ngự Tuyệt Đối): ST = 0, Phản 100% ST
    if (myFish.ultTimer > 0 && myFish.species === "turtle") {
      addFloatingText(myFish.x, myFish.y - 34, "🛡️ PHẢN ĐÒN!", "#ffd43b", 1.1);
      if (hit.fromUid && !hit.isReflectFx) {
        sendPvpHit(hit.fromUid, hit.dmg, false, true);
        const attacker = remotePlayers[hit.fromUid];
        if (attacker) {
          reflectEffects.push({ x: attacker.x, y: attacker.y, life: 0.35, maxLife: 0.35 });
        }
      }
      return;
    }

    const eff = getEffectiveStats();
    const actualDmg = Math.max(1, Math.round(hit.dmg * eff.dmgTakenMult));
    myFish.hp -= actualDmg;
    addFloatingText(myFish.x, myFish.y - 30, hit.crit ? `💥 -${actualDmg}` : `-${actualDmg}`, "#ff4d4d", hit.crit ? 1.3 : 1);
    if (myFish.reflectTimer > 0 && hit.fromUid && !hit.isReflectFx) {
      sendPvpHit(hit.fromUid, actualDmg * 0.6, false, true);
    }
    if (myFish.hp <= 0) {
      handleDeath(`Bị ${hit.fromName || "người chơi khác"} hạ gục!`);
    }
  }));

  // Lắng nghe 3 Con Boss
  unsubListeners.push(onValue(ref(db, "rooms/main/bosses"), (snap) => {
    bossesState = snap.val() || {};
    if (Object.keys(bossesState).length === 0 && isRoomHost()) {
      resetWorldMapInFirebase();
    }
  }));

  // Lắng nghe Sự kiện
  unsubListeners.push(onValue(ref(db, "rooms/main/event"), (snap) => {
    eventState = snap.val();
  }));

  syncIntervalId = setInterval(() => {
    if (!inGame || !myFish) return;
    const eff = getEffectiveStats();
    set(myRef, {
      uid: myFish.uid,
      name: myFish.name,
      species: myFish.species,
      x: Math.round(myFish.x),
      y: Math.round(myFish.y),
      angle: Number(myFish.angle.toFixed(2)),
      level: myFish.level,
      tier: myFish.tier,
      score: myFish.score,
      hp: Math.round(myFish.hp),
      maxHp: eff.maxHp,
      sizeMult: myFish.sizeMult,
      shield: myFish.shieldTimer > 0,
      chomping: myFish.chompTimer > 0,
      ultActive: myFish.ultTimer > 0,
      joinedAt: myFish.joinedAt,
      updatedAt: Date.now()
    });

    if (isRoomHost()) {
      hostUpdateWorld();
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
    if ((p.tier || 1) > maxT) maxT = p.tier;
  });
  return maxT;
}

function hostUpdateWorld() {
  const now = Date.now();

  // 1. Cập nhật 3 Con Boss
  BOSS_SPAWNS.forEach((sp) => {
    const b = bossesState[sp.id];
    if (!b) return;
    const desiredTier = Math.min(6, getHighestPlayerTier() + 1);

    if (!b.alive) {
      if (b.respawnAt && now >= b.respawnAt) {
        const maxHp = 600 + desiredTier * 450;
        set(ref(db, `rooms/main/bosses/${sp.id}`), {
          id: sp.id,
          name: sp.name,
          alive: true,
          tier: desiredTier,
          level: desiredTier * 10,
          x: sp.x,
          y: sp.y,
          homeX: sp.x,
          homeY: sp.y,
          angle: Math.random() * Math.PI * 2,
          hp: maxHp,
          maxHp,
          dmg: 28 + desiredTier * 12,
          respawnAt: 0,
          lastHitBy: ""
        });
      }
      return;
    }

    const players = [myFish, ...Object.values(remotePlayers)].filter(Boolean);
    let target = null, minDist = 600;
    players.forEach(p => {
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < minDist) { minDist = d; target = p; }
    });

    let angle = b.angle || 0;
    if (target) {
      angle = Math.atan2(target.y - b.y, target.x - b.x);
    } else if (Math.hypot(b.x - sp.x, b.y - sp.y) > 550) {
      angle = Math.atan2(sp.y - b.y, sp.x - b.x);
    } else if (Math.random() < 0.08) {
      angle += (Math.random() - 0.5) * 1.2;
    }

    const speed = 13;
    const nx = Math.max(150, Math.min(MAP_SIZE - 150, b.x + Math.cos(angle) * speed));
    const ny = Math.max(150, Math.min(MAP_SIZE - 150, b.y + Math.sin(angle) * speed));

    update(ref(db, `rooms/main/bosses/${sp.id}`), {
      x: Math.round(nx),
      y: Math.round(ny),
      angle: Number(angle.toFixed(2)),
      tier: Math.max(b.tier, desiredTier)
    });
  });

  // 2. Cập nhật Sự kiện mỗi 2 phút (kéo dài 30 giây)
  if (eventState) {
    if (eventState.active && now >= eventState.endsAt) {
      set(ref(db, "rooms/main/event"), {
        active: false,
        type: "",
        startedAt: 0,
        endsAt: 0,
        nextEventAt: eventState.startedAt + EVENT_INTERVAL_MS
      });
    } else if (!eventState.active && eventState.nextEventAt && now >= eventState.nextEventAt) {
      const chosen = EVENTS_POOL[Math.floor(Math.random() * EVENTS_POOL.length)];
      set(ref(db, "rooms/main/event"), {
        active: true,
        type: chosen.id,
        startedAt: now,
        endsAt: now + EVENT_DURATION_MS,
        nextEventAt: now + EVENT_INTERVAL_MS
      });
    }
  }
}

function damageBoss(bossId, dmg) {
  const b = bossesState[bossId];
  if (!b || !b.alive) return;
  const bossRef = ref(db, `rooms/main/bosses/${bossId}`);
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
      addToast(`🏆 HẠ GỤC ${val.name.toUpperCase()}! (+80 Coin, +350 EXP)`);
    }
  });
}

function sendPvpHit(targetUid, dmg, isCrit = false, isReflectFx = false) {
  const hitId = currentUser.uid + "_" + Date.now() + "_" + Math.floor(Math.random() * 999);
  set(ref(db, `rooms/main/hits/${targetUid}/${hitId}`), {
    fromUid: currentUser.uid,
    fromName: myFish.name,
    dmg: Math.round(dmg),
    crit: isCrit,
    isReflectFx
  });
}

async function disconnectRealtimeRoom() {
  if (syncIntervalId) clearInterval(syncIntervalId);
  unsubListeners.forEach(u => u());
  unsubListeners = [];
  if (currentUser) {
    await remove(ref(db, `rooms/main/players/${currentUser.uid}`));
    // Nếu không còn người chơi nào online trong map -> reset toàn bộ map về ban đầu
    const snap = await get(ref(db, "rooms/main/players"));
    const rem = snap.val() || {};
    const now = Date.now();
    const anyOnline = Object.values(rem).some(p => p.updatedAt && now - p.updatedAt < 15000);
    if (!anyOnline) {
      await remove(ref(db, "rooms/main"));
    }
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
  if (document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    return;
  }
  if (!inGame) return;
  if (e.code === "Space") {
    e.preventDefault();
    triggerSkill();
  }
  if (e.code === "KeyE" || e.code === "KeyR") {
    e.preventDefault();
    triggerUltimateSkill();
  }
  if (choosingBuff && ["Digit1", "Digit2", "Digit3"].includes(e.code)) {
    const idx = Number(e.code.replace("Digit", "")) - 1;
    const cards = document.querySelectorAll(".buff-card");
    if (cards[idx]) cards[idx].click();
  }
});

window.addEventListener("touchstart", (e) => {
  if (e.target.closest("#chat-widget")) return;
  isTouchDevice = true;
  inputMode = "touch";
  if (inGame) refreshMobileControlsVisibility();
}, { passive: true });

// ---- JOYSTICK ----
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

  if (dist > 4) joystick.angle = angle;
  joystick.power = clamped / maxDist;
  joystickKnob.style.transform = `translate(${Math.cos(angle) * clamped}px, ${Math.sin(angle) * clamped}px)`;
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

// ---- NÚT CẮN, SKILL CƠ BẢN & SKILL ĐẶC BIỆT TRÊN MOBILE ----
const btnMobileBite = document.getElementById("btn-mobile-bite");
const btnMobileSkill = document.getElementById("btn-mobile-skill");
const btnMobileUlt = document.getElementById("btn-mobile-ult");

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

btnMobileUlt.addEventListener("touchstart", (e) => {
  e.preventDefault();
  e.stopPropagation();
  inputMode = "touch";
  triggerUltimateSkill();
}, { passive: false });

// Cho phép click vào ô Skill trên PC cũng dùng được
document.getElementById("hud-skill-box").addEventListener("click", triggerSkill);
document.getElementById("hud-ult-box").addEventListener("click", triggerUltimateSkill);

// ==================== CẮN & SKILL CƠ BẢN / SKILL ĐẶC BIỆT ====================
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

  const eff = getEffectiveStats();
  myFish.biteCooldown = 0.38;
  myFish.chompTimer = 0.22;
  const myRadius = getFishRadius(myFish.level, myFish.tier, myFish.sizeMult);

  const biteDist = myRadius * 0.95 * eff.biteRangeMult;
  const biteRadius = myRadius * 0.88 * eff.biteRangeMult;
  const biteX = myFish.x + Math.cos(myFish.angle) * biteDist;
  const biteY = myFish.y + Math.sin(myFish.angle) * biteDist;

  const isSwordUlt = myFish.ultTimer > 0 && myFish.species === "swordfish";

  biteEffects.push({
    x: biteX,
    y: biteY,
    angle: myFish.angle,
    radius: biteRadius,
    life: 0.24,
    maxLife: 0.24,
    critSpark: false,
    swordSlash: isSwordUlt
  });

  // 1. Cắn AI Cá
  for (let i = aiFishes.length - 1; i >= 0; i--) {
    const ai = aiFishes[i];
    const aiR = getFishRadius(ai.level, ai.tier, 1);
    const res = evaluateBiteHit(biteX, biteY, biteRadius, ai.x, ai.y, ai.angle, aiR);
    if (res.hit) {
      const dmg = res.isCrit ? eff.dmg * 2.0 : eff.dmg;
      damageAiFish(ai, dmg, res.isCrit, res.tailX, res.tailY);
    }
  }

  // 2. Cắn Người chơi khác
  Object.values(remotePlayers).forEach(p => {
    const pR = getFishRadius(p.level || 1, p.tier || 1, p.sizeMult || 1);
    const res = evaluateBiteHit(biteX, biteY, biteRadius, p.x, p.y, p.angle || 0, pR);
    if (res.hit) {
      const dmg = res.isCrit ? eff.dmg * 2.0 : eff.dmg;
      sendPvpHit(p.uid, dmg, res.isCrit, false);
      if (res.isCrit) {
        addFloatingText(res.tailX, res.tailY - 24, `💥 CHÍ MẠNG -${Math.round(dmg)}`, "#ff922b", 1.25);
        spawnCritBurst(res.tailX, res.tailY);
      } else {
        addFloatingText(p.x, p.y - 30, `-${Math.round(dmg)}`, "#ffd43b", 1);
      }

      if ((p.hp || 100) <= dmg) {
        sessionStats.fishKilled += 1;
        sessionStats.coinsEarned += 15;
        gainExp(90 + (p.level || 1) * 12);
        if (myFish.healOnKill > 0 && myFish.hp < eff.maxHp) {
          const healed = Math.min(myFish.healOnKill, eff.maxHp - myFish.hp);
          myFish.hp += healed;
          addFloatingText(myFish.x, myFish.y - 25, `+${Math.round(healed)} HP`, "#51cf66", 1);
        }
        addToast(`🔥 Bạn vừa nuốt chửng ${p.name}! (+15 Coin)`);
      }
    }
  });

  // 3. Cắn 3 Con Boss
  Object.values(bossesState).forEach(b => {
    if (!b || !b.alive) return;
    const bossR = getFishRadius(b.level || 10, b.tier || 2, 1.35);
    const res = evaluateBiteHit(biteX, biteY, biteRadius, b.x, b.y, b.angle || 0, bossR);
    if (res.hit) {
      const dmg = res.isCrit ? eff.dmg * 2.0 : eff.dmg;
      damageBoss(b.id, dmg);
      if (res.isCrit) {
        addFloatingText(res.tailX, res.tailY - 35, `💥 CHÍ MẠNG -${Math.round(dmg)}`, "#ff922b", 1.35);
        spawnCritBurst(res.tailX, res.tailY);
      } else {
        addFloatingText(b.x, b.y - 60, `-${Math.round(dmg)}`, "#ffd43b", 1);
      }
    }
  });
}

function spawnCritBurst(x, y) {
  biteEffects.push({
    x, y, angle: 0, radius: 34, life: 0.24, maxLife: 0.24, critSpark: true
  });
}

function triggerSkill() {
  if (!myFish || myFish.skillTimer > 0 || choosingBuff) return;
  const cfg = FISH_TYPES[myFish.species];
  const eff = getEffectiveStats();
  myFish.skillTimer = cfg.skillCd * myFish.skillCdMult;
  const sDmg = eff.dmg * 1.8 * myFish.skillDmgMult;

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

function triggerUltimateSkill() {
  if (!myFish || myFish.ultCdTimer > 0 || choosingBuff) return;
  const cfg = FISH_TYPES[myFish.species];
  // Hồi chiêu gấp 3 lần skill cơ bản
  myFish.ultCdTimer = cfg.skillCd * 3 * myFish.skillCdMult;
  myFish.ultTimer = 10.0; // Hiệu lực trong 10 giây
  addToast(`🔥 KÍCH HOẠT: ${cfg.ultName.toUpperCase()}! (10s)`);
  addFloatingText(myFish.x, myFish.y - 48, `⚡ ${cfg.ultName.toUpperCase()}!`, "#fde047", 1.25);
}

function dealAoEDamage(cx, cy, radius, dmg) {
  aiFishes.forEach(ai => {
    if (Math.hypot(ai.x - cx, ai.y - cy) < radius) {
      damageAiFish(ai, dmg, false, ai.x, ai.y);
    }
  });
  Object.values(remotePlayers).forEach(p => {
    if (Math.hypot(p.x - cx, p.y - cy) < radius) {
      sendPvpHit(p.uid, dmg, false, false);
    }
  });
  Object.values(bossesState).forEach(b => {
    if (b && b.alive && Math.hypot(b.x - cx, b.y - cy) < radius + 70) {
      damageBoss(b.id, dmg);
      addFloatingText(b.x, b.y - 50, `-${Math.round(dmg)}`, "#ffd43b");
    }
  });
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
  if (myFish.ultTimer > 0) myFish.ultTimer = Math.max(0, myFish.ultTimer - dt);
  if (myFish.ultCdTimer > 0) myFish.ultCdTimer = Math.max(0, myFish.ultCdTimer - dt);
  if (myFish.shieldTimer > 0) myFish.shieldTimer = Math.max(0, myFish.shieldTimer - dt);
  if (myFish.dashTimer > 0) myFish.dashTimer = Math.max(0, myFish.dashTimer - dt);
  if (myFish.reflectTimer > 0) myFish.reflectTimer = Math.max(0, myFish.reflectTimer - dt);
  if (myFish.biteCooldown > 0) myFish.biteCooldown = Math.max(0, myFish.biteCooldown - dt);
  if (myFish.chompTimer > 0) myFish.chompTimer = Math.max(0, myFish.chompTimer - dt);

  const eff = getEffectiveStats();
  if (myFish.hp > eff.maxHp) myFish.hp = eff.maxHp;

  // Điều chỉnh số lượng mồi theo Sự Kiện "Đại tiệc của vua cá" (+50%)
  const desiredFoodCount = getActiveEventType() === "feast" ? Math.round(BASE_FOOD_COUNT * 1.5) : BASE_FOOD_COUNT;
  while (foods.length < desiredFoodCount) foods.push(spawnFood());
  if (foods.length > desiredFoodCount + 25) foods.length = desiredFoodCount;

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

  const curSpeed = eff.speed * (myFish.dashTimer > 0 ? 2.15 : 1.0);
  myFish.x = Math.max(40, Math.min(MAP_SIZE - 40, myFish.x + Math.cos(myFish.angle) * curSpeed * moveFactor * dt));
  myFish.y = Math.max(40, Math.min(MAP_SIZE - 40, myFish.y + Math.sin(myFish.angle) * curSpeed * moveFactor * dt));

  // Cá Chim (Tốc Độ Ánh Sáng): để lại lưu ảnh phân thân mờ dần khi bơi
  if (myFish.ultTimer > 0 && myFish.species === "butterfish" && moveFactor > 0.15) {
    afterimageSpawnTimer -= dt;
    if (afterimageSpawnTimer <= 0) {
      afterimageSpawnTimer = 0.045;
      afterimages.push({
        x: myFish.x, y: myFish.y, angle: myFish.angle,
        level: myFish.level, tier: myFish.tier, sizeMult: myFish.sizeMult,
        species: myFish.species, life: 0.28, maxLife: 0.28
      });
    }
  }

  camera.x += (myFish.x - camera.x) * 0.14;
  camera.y += (myFish.y - camera.y) * 0.14;

  const myRadius = getFishRadius(myFish.level, myFish.tier, myFish.sizeMult);

  // Ăn mồi
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
        if (myFish.healOnFood > 0 && myFish.hp < eff.maxHp) {
          const healed = Math.min(myFish.healOnFood, eff.maxHp - myFish.hp);
          myFish.hp += healed;
          addFloatingText(myFish.x, myFish.y - 25, `+${Math.round(healed)} HP`, "#51cf66", 0.85);
        }
        foods.splice(i, 1);
        if (foods.length < desiredFoodCount) foods.push(spawnFood());
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
      if (!hit && Math.hypot(ai.x - pr.x, ai.y - pr.y) < getFishRadius(ai.level, ai.tier, 1) + 14) {
        damageAiFish(ai, pr.dmg, false, ai.x, ai.y);
        hit = true;
      }
    });
    if (!hit) {
      for (const b of Object.values(bossesState)) {
        if (b && b.alive && Math.hypot(b.x - pr.x, b.y - pr.y) < 90) {
          damageBoss(b.id, pr.dmg);
          hit = true;
          break;
        }
      }
    }
    if (hit || pr.life <= 0) projectiles.splice(i, 1);
  }

  // AI Cá & Kiểm tra Áp Chế Huyết Mạch của Cá Vua
  const kingInUlt = myFish.ultTimer > 0 && myFish.species === "kingfish";

  aiFishes.forEach(ai => {
    if (ai.biteCooldown > 0) ai.biteCooldown -= dt;
    ai.aiTimer -= dt;
    if (ai.aiTimer <= 0) {
      ai.aiTimer = 1 + Math.random() * 2;
      ai.angle += (Math.random() - 0.5) * 1.8;
    }

    const aiSuppressed = kingInUlt && Math.hypot(ai.x - myFish.x, ai.y - myFish.y) <= DOMAIN_RADIUS;
    ai.suppressed = aiSuppressed;
    const aiSpeed = ai.speed * (aiSuppressed ? 0.6 : 1.0);
    ai.x = Math.max(60, Math.min(MAP_SIZE - 60, ai.x + Math.cos(ai.angle) * aiSpeed * dt));
    ai.y = Math.max(60, Math.min(MAP_SIZE - 60, ai.y + Math.sin(ai.angle) * aiSpeed * dt));

    const aiR = getFishRadius(ai.level, ai.tier, 1);
    const d = Math.hypot(ai.x - myFish.x, ai.y - myFish.y);
    if (d < myRadius + aiR && ai.biteCooldown <= 0 && myFish.shieldTimer <= 0) {
      ai.biteCooldown = 0.75;
      const rawDmg = ai.dmg * (aiSuppressed ? 0.6 : 1.0);

      if (myFish.ultTimer > 0 && myFish.species === "butterfish" && Math.random() < 0.5) {
        addFloatingText(myFish.x, myFish.y - 34, "💨 Hụt!", "#74c0fc", 1.15);
        return;
      }
      if (myFish.ultTimer > 0 && myFish.species === "turtle") {
        reflectEffects.push({ x: ai.x, y: ai.y, life: 0.35, maxLife: 0.35 });
        addFloatingText(myFish.x, myFish.y - 34, "🛡️ PHẢN ĐÒN!", "#ffd43b", 1.1);
        damageAiFish(ai, rawDmg, false, ai.x, ai.y);
        return;
      }

      const dmg = Math.max(1, Math.round(rawDmg * eff.dmgTakenMult));
      myFish.hp -= dmg;
      addFloatingText(myFish.x, myFish.y - 30, `-${dmg}`, "#ff6b6b");
      if (myFish.hp <= 0) handleDeath(`Bị ${ai.name} hạ gục!`);
    }
  });

  // 3 Boss tấn công người chơi
  Object.values(bossesState).forEach(b => {
    if (!b || !b.alive) return;
    const bossR = getFishRadius(b.level || 10, b.tier || 2, 1.35);
    const distBoss = Math.hypot(b.x - myFish.x, b.y - myFish.y);
    const bossSuppressed = kingInUlt && distBoss <= DOMAIN_RADIUS;

    if (distBoss < myRadius + bossR && myFish.shieldTimer <= 0 && Math.random() < dt * 1.4) {
      const rawDmg = b.dmg * (bossSuppressed ? 0.6 : 1.0);
      if (myFish.ultTimer > 0 && myFish.species === "butterfish" && Math.random() < 0.5) {
        addFloatingText(myFish.x, myFish.y - 34, "💨 Hụt!", "#74c0fc", 1.15);
        return;
      }
      if (myFish.ultTimer > 0 && myFish.species === "turtle") {
        reflectEffects.push({ x: b.x, y: b.y, life: 0.35, maxLife: 0.35 });
        addFloatingText(myFish.x, myFish.y - 34, "🛡️ PHẢN ĐÒN!", "#ffd43b", 1.1);
        damageBoss(b.id, rawDmg);
        return;
      }
      const bDmg = Math.max(1, Math.round(rawDmg * eff.dmgTakenMult));
      myFish.hp -= bDmg;
      addFloatingText(myFish.x, myFish.y - 30, `-${bDmg}`, "#ff3b3b");
      if (myFish.hp <= 0) handleDeath(`Bị ${b.name} nghiền nát!`);
    }
  });

  // Cập nhật các hiệu ứng tạm thời
  for (let i = biteEffects.length - 1; i >= 0; i--) {
    biteEffects[i].life -= dt;
    if (biteEffects[i].life <= 0) biteEffects.splice(i, 1);
  }
  for (let i = reflectEffects.length - 1; i >= 0; i--) {
    reflectEffects[i].life -= dt;
    if (reflectEffects[i].life <= 0) reflectEffects.splice(i, 1);
  }
  for (let i = afterimages.length - 1; i >= 0; i--) {
    afterimages[i].life -= dt;
    if (afterimages[i].life <= 0) afterimages.splice(i, 1);
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
    gainExp(55 + ai.level * 10);
    const eff = getEffectiveStats();
    if (myFish.healOnKill > 0 && myFish.hp < eff.maxHp) {
      const healed = Math.min(myFish.healOnKill, eff.maxHp - myFish.hp);
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
  const eff = getEffectiveStats();
  myFish.exp += amount * eff.expMult;
  myFish.score += amount * eff.expMult;

  while (myFish.exp >= myFish.expNeed) {
    myFish.exp -= myFish.expNeed;
    myFish.level += 1;
    myFish.expNeed = Math.round(45 + (myFish.level - 1) * 18);

    const oldTier = myFish.tier;
    const newTier = getTierFromLevel(myFish.level);
    myFish.tier = newTier;
    if (newTier >= 2) sessionStats.reachedTier2 = 1;

    myFish.baseMaxHp += 20;
    myFish.hp = Math.min(getEffectiveStats().maxHp, myFish.hp + 30);
    myFish.baseDmg += 3;
    pendingLevelUps += 1;

    if (newTier > oldTier) {
      addToast(`🌟 TIẾN HÓA DẠNG ${newTier}: ${EVO_TIERS[newTier - 1].name}!`);
    } else {
      addToast(`⬆️ Lên Cấp ${myFish.level} (Kích thước tăng!)`);
    }
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
  document.getElementById("buff-modal-title").textContent =
    myFish.level % 10 === 0 ? `🌟 TIẾN HÓA CẤP ${myFish.level}! 🌟` : `✨ LÊN CẤP ${myFish.level}! ✨`;

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
  if (id === "speed") myFish.baseSpeed *= 1.12;
  if (id === "maxHp") {
    const add = myFish.baseMaxHp * 0.25;
    myFish.baseMaxHp += add;
    myFish.hp += add;
  }
  if (id === "biteDmg") myFish.baseDmg *= 1.18;
  if (id === "size") myFish.sizeMult += 0.12;
  if (id === "skillDmg") myFish.skillDmgMult += 0.25;
  if (id === "skillCd") myFish.skillCdMult *= 0.85;
}

// ==================== VẼ THỦY CUNG, HIỆU ỨNG SKILL ĐẶC BIỆT & CÁ ====================
function renderGame() {
  const w = logicalW, h = logicalH;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const viewScale = Math.min(1.0, Math.max(0.56, Math.min(w, h) / 760));

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#0b5b8c");
  grad.addColorStop(0.55, "#053356");
  grad.addColorStop(1, "#02182b");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

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

  ctx.strokeStyle = "rgba(77, 184, 255, 0.5)";
  ctx.lineWidth = 10;
  ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);

  corals.forEach(c => {
    ctx.fillStyle = `hsla(${c.hue}, 55%, 32%, 0.22)`;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  });

  bubbles.forEach(b => {
    ctx.strokeStyle = "rgba(200, 244, 255, 0.35)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.stroke();
  });

  const t = performance.now() / 1000;

  // Vẽ Lĩnh Vực "Áp Chế Tuyệt Đối" của Cá Của Vua (nằm dưới lớp cá)
  if (myFish && myFish.ultTimer > 0 && myFish.species === "kingfish") {
    drawKingDomain(myFish.x, myFish.y, t);
  }
  Object.values(remotePlayers).forEach(p => {
    if (p.ultActive && p.species === "kingfish") {
      drawKingDomain(p.x, p.y, t);
    }
  });

  // Mồi thủy cung
  foods.forEach(f => {
    const pulse = Math.sin(t * 3.5 + f.phase) * 1.5;
    const bobY = Math.sin(t * 2.5 + f.phase) * 3;
    if (foodImgObj.ready) {
      const size = (f.r * 5.2) + pulse * 2;
      if (f.val > 20) {
        ctx.save();
        ctx.globalAlpha = 0.38 + Math.sin(t * 5 + f.phase) * 0.12;
        ctx.fillStyle = "#ffd43b";
        ctx.beginPath();
        ctx.arc(f.x, f.y + bobY, size * 0.38, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.drawImage(foodImgObj.img, f.x - size / 2, f.y + bobY - size / 2, size, size);
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

  // Lưu ảnh phân thân mờ dần của Cá Chim (Tốc Độ Ánh Sáng)
  afterimages.forEach(af => {
    ctx.save();
    ctx.globalAlpha = (af.life / af.maxLife) * 0.48;
    drawDetailedFish(af.x, af.y, af.angle, af.species, af.level, af.tier, af.sizeMult, "", 1, 1, false, false, false, 0, false, false, t, true);
    ctx.restore();
  });

  const top1Uid = getTop1Uid();
  const domainCheck = getKingDomainEffects();
  const myKingUlt = myFish && myFish.ultTimer > 0 && myFish.species === "kingfish";

  // Vẽ AI Cá
  aiFishes.forEach(ai => {
    drawDetailedFish(ai.x, ai.y, ai.angle, ai.species, ai.level, ai.tier, 1, ai.name, ai.hp, ai.maxHp, false, false, false, 0, false, !!ai.suppressed, t, false);
  });

  // Vẽ Người chơi khác
  Object.values(remotePlayers).forEach(p => {
    const pSuppressed = myKingUlt && Math.hypot(p.x - myFish.x, p.y - myFish.y) <= DOMAIN_RADIUS;
    drawDetailedFish(p.x, p.y, p.angle, p.species, p.level || 1, p.tier || 1, p.sizeMult || 1, p.name, p.hp, p.maxHp, p.uid === top1Uid, false, p.shield, p.chomping ? 0.8 : 0, !!p.ultActive, pSuppressed, t, false);
  });

  // Vẽ 3 Con Boss
  Object.values(bossesState).forEach(b => {
    if (!b || !b.alive) return;
    const bSuppressed = myKingUlt && Math.hypot(b.x - myFish.x, b.y - myFish.y) <= DOMAIN_RADIUS;
    drawDetailedFish(b.x, b.y, b.angle || 0, "boss", b.level || 10, b.tier || 2, 1.35, `${b.name} (Cấp ${b.level || b.tier * 10})`, b.hp, b.maxHp, false, true, false, 0.35, false, bSuppressed, t, false);
  });

  // Vẽ Bản thân
  if (myFish) {
    const chomp = myFish.chompTimer > 0 ? myFish.chompTimer / 0.22 : 0;
    const eff = getEffectiveStats();
    drawDetailedFish(myFish.x, myFish.y, myFish.angle, myFish.species, myFish.level, myFish.tier, myFish.sizeMult, myFish.name, myFish.hp, eff.maxHp, myFish.uid === top1Uid, false, myFish.shieldTimer > 0, chomp, myFish.ultTimer > 0, domainCheck.suppressed, t, false);
  }

  // Hiệu ứng Cắn Ma Cà Rồng + Hiệu ứng Chém Đứt (Lưỡi Kiếm Tinh Xảo)
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
    } else if (ef.swordSlash) {
      // Hiệu ứng chém đứt Lưỡi Kiếm Tinh Xảo phía trước mặt
      ctx.translate(ef.x, ef.y);
      ctx.rotate(ef.angle);
      if (slashImgObj.ready) {
        const sz = ef.radius * 2.5;
        ctx.drawImage(slashImgObj.img, -sz * 0.35, -sz / 2, sz, sz);
      } else {
        const R = ef.radius * 1.15;
        const slashGrad = ctx.createLinearGradient(-R * 0.3, -R, R * 0.9, R);
        slashGrad.addColorStop(0, "rgba(56, 189, 248, 0.2)");
        slashGrad.addColorStop(0.5, "#e0f2fe");
        slashGrad.addColorStop(1, "rgba(56, 189, 248, 0.2)");
        ctx.fillStyle = slashGrad;
        ctx.beginPath();
        ctx.arc(0, 0, R, -1.25, 1.25);
        ctx.quadraticCurveTo(R * 0.35, 0, Math.cos(-1.25) * R, Math.sin(-1.25) * R);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-R * 0.2, -R * 0.9);
        ctx.lineTo(R * 1.15, R * 0.9);
        ctx.stroke();
      }
    } else {
      // Răng Ma Cà Rồng
      const progress = 1 - alpha;
      const snap = Math.min(1, progress * 1.65);
      const R = ef.radius * 0.88;
      const jawGap = R * 0.72 * (1 - snap * 0.86);

      ctx.translate(ef.x, ef.y);
      ctx.rotate(ef.angle);
      if (Math.cos(ef.angle) < 0) ctx.scale(1, -1);

      const drawVampireJaw = (dir) => {
        ctx.save();
        ctx.translate(0, -dir * jawGap);

        ctx.strokeStyle = "rgba(225, 29, 72, 0.85)";
        ctx.lineWidth = Math.max(2.5, R * 0.11);
        ctx.beginPath();
        ctx.moveTo(-R * 0.62, -dir * R * 0.08);
        ctx.quadraticCurveTo(0, -dir * R * 0.34, R * 0.62, -dir * R * 0.08);
        ctx.stroke();

        ctx.fillStyle = "#fff5f5";
        ctx.strokeStyle = "#be123c";
        ctx.lineWidth = 1.3;
        [-0.14, 0.14].forEach(pos => {
          ctx.beginPath();
          ctx.moveTo(R * (pos - 0.08), -dir * R * 0.1);
          ctx.lineTo(R * pos, dir * R * 0.24);
          ctx.lineTo(R * (pos + 0.08), -dir * R * 0.1);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        });

        [-1, 1].forEach(side => {
          const bx = side * R * 0.4;
          const fangGrad = ctx.createLinearGradient(bx, -dir * R * 0.12, bx, dir * R * 0.68);
          fangGrad.addColorStop(0, "#ffffff");
          fangGrad.addColorStop(0.75, "#ffe4e6");
          fangGrad.addColorStop(1, "#fda4af");

          ctx.fillStyle = fangGrad;
          ctx.strokeStyle = "#9f1239";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(bx - side * R * 0.15, -dir * R * 0.14);
          ctx.quadraticCurveTo(bx + side * R * 0.04, dir * R * 0.28, bx - side * R * 0.05, dir * R * 0.66);
          ctx.quadraticCurveTo(bx - side * R * 0.08, dir * R * 0.25, bx + side * R * 0.12, -dir * R * 0.12);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        });
        ctx.restore();
      };

      drawVampireJaw(1);
      drawVampireJaw(-1);
      if (snap > 0.7) {
        ctx.strokeStyle = "#fff1f2";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-R * 0.75, 0);
        ctx.lineTo(R * 0.75, 0);
        ctx.stroke();
      }
    }
    ctx.restore();
  });

  // Hoạt ảnh Phản Sát Thương trên người kẻ đánh Rùa Biển
  reflectEffects.forEach(rf => {
    const a = rf.life / rf.maxLife;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(rf.x, rf.y);
    const rad = 46 * (1.2 - a * 0.4);
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 4;
    for (let k = 0; k < 10; k++) {
      const ang = (Math.PI * 2 * k) / 10 + a * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * 10, Math.sin(ang) * 10);
      ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(245, 158, 11, 0.35)";
    ctx.beginPath();
    ctx.arc(0, 0, rad * 0.65, 0, Math.PI * 2);
    ctx.fill();
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

// Hào quang Siêu Xayda (Dragon Ball Super Saiyan Aura)
function drawSuperSaiyanAura(r, t) {
  ctx.save();
  const flameCount = 14;
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    const baseR = pass === 0 ? r * 1.48 : r * 1.25;
    for (let i = 0; i <= flameCount * 2; i++) {
      const ang = (Math.PI * 2 * i) / (flameCount * 2);
      const isSpike = i % 2 === 0;
      const flicker = Math.sin(t * 24 + i * 2.1 + pass) * (r * 0.16);
      // Ngọn lửa bốc mạnh lên phía trên giống Siêu Xayda
      const upBias = Math.sin(ang) < 0 ? Math.abs(Math.sin(ang)) * r * 0.32 : 0;
      const rad = (isSpike ? baseR + r * 0.36 + upBias : baseR * 0.85) + flicker;
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = pass === 0 ? "rgba(250, 204, 21, 0.42)" : "rgba(254, 249, 195, 0.58)";
    ctx.fill();
    ctx.strokeStyle = pass === 0 ? "#f59e0b" : "#fef08a";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

// Khiên Đất Tổ Ong Màu Vàng (Phòng Ngự Tuyệt Đối của Rùa Biển)
function drawHoneycombEarthShield(r, t) {
  const shieldR = r * 1.45;
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, shieldR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(234, 179, 8, 0.22)";
  ctx.fill();
  ctx.save();
  ctx.clip();

  // Vẽ lưới lục giác tổ ong bên trong khiên
  const hexR = Math.max(12, r * 0.32);
  const dx = hexR * 1.5;
  const dy = hexR * Math.sqrt(3);
  ctx.strokeStyle = "rgba(253, 224, 71, 0.65)";
  ctx.lineWidth = 1.6;

  for (let gx = -shieldR - hexR; gx <= shieldR + hexR; gx += dx) {
    const colIdx = Math.round(gx / dx);
    for (let gy = -shieldR - hexR; gy <= shieldR + hexR; gy += dy) {
      const cy = gy + (colIdx % 2 !== 0 ? dy / 2 : 0);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const ang = (Math.PI / 3) * k;
        const vx = gx + Math.cos(ang) * hexR;
        const vy = cy + Math.sin(ang) * hexR;
        if (k === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();

  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(0, 0, shieldR + Math.sin(t * 10) * 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Lĩnh Vực "Áp Chế Tuyệt Đối" của Cá Của Vua
function drawKingDomain(x, y, t) {
  ctx.save();
  ctx.translate(x, y);
  if (kingDomainImgObj.ready) {
    ctx.save();
    ctx.rotate(t * 0.4);
    ctx.globalAlpha = 0.72;
    ctx.drawImage(kingDomainImgObj.img, -DOMAIN_RADIUS, -DOMAIN_RADIUS, DOMAIN_RADIUS * 2, DOMAIN_RADIUS * 2);
    ctx.restore();
  } else {
    const grad = ctx.createRadialGradient(0, 0, DOMAIN_RADIUS * 0.15, 0, 0, DOMAIN_RADIUS);
    grad.addColorStop(0, "rgba(251, 191, 36, 0.10)");
    grad.addColorStop(0.7, "rgba(185, 28, 28, 0.18)");
    grad.addColorStop(1, "rgba(245, 158, 11, 0.42)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, DOMAIN_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Vòng trận pháp hoàng kim xoay tròn
    ctx.save();
    ctx.rotate(t * 0.45);
    ctx.strokeStyle = "rgba(253, 224, 71, 0.85)";
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 10]);
    ctx.beginPath();
    ctx.arc(0, 0, DOMAIN_RADIUS - 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "rgba(248, 113, 113, 0.65)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI * 2 * k) / 6;
      const px = Math.cos(a) * (DOMAIN_RADIUS * 0.82);
      const py = Math.sin(a) * (DOMAIN_RADIUS * 0.82);
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

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

function drawDetailedFish(x, y, angle, species, level, tier, sizeMult, name, hp, maxHp, isTop1, isBoss, hasShield, chompRatio, ultActive, isSuppressed, t, isAfterimage) {
  const r = getFishRadius(level, tier, sizeMult);
  const cfg = isBoss
    ? { color: "#0f172a", midColor: "#1e3a5f", bellyColor: "#cbd5e1", accent: "#38bdf8", finGlow: "#a5f3fc" }
    : (FISH_TYPES[species] || FISH_TYPES.swordfish);

  ctx.save();
  ctx.translate(x, y);

  if (!isAfterimage) {
    // Hào quang Siêu Xayda khi dùng Skill Đặc Biệt
    if (ultActive) {
      drawSuperSaiyanAura(r, t);
    } else if (tier >= 3 || isBoss) {
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

    // Khiên đất tổ ong của Rùa Biển khi bật Skill Đặc Biệt
    if (ultActive && species === "turtle") {
      drawHoneycombEarthShield(r, t);
    } else if (hasShield) {
      ctx.strokeStyle = "#51cf66";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.38, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.save();
  ctx.rotate(angle);
  if (Math.cos(angle) < 0) ctx.scale(1, -1);

  const sprite = getFishSprite(isBoss ? "boss" : species, tier);
  if (sprite.ready) {
    const swimTilt = Math.sin(t * (7 + tier * 0.7)) * 0.08;
    const stretch = 1 + Math.sin(t * 9) * 0.03;
    const aspect = sprite.img.naturalHeight / (sprite.img.naturalWidth || 1);
    const drawW = r * 3.1;
    const drawH = drawW * aspect;

    ctx.rotate(swimTilt);
    ctx.translate(chompRatio * r * 0.22, 0);
    ctx.scale(stretch, 2 - stretch);
    ctx.drawImage(sprite.img, -drawW / 2, -drawH / 2, drawW, drawH);
  } else {
    const swimWag = Math.sin(t * (7.5 + tier * 0.7)) * 0.22;
    const finWag = Math.sin(t * 8.5) * 0.16;

    if (species === "turtle") {
      ctx.fillStyle = cfg.color;
      ctx.strokeStyle = "#14532d";
      ctx.lineWidth = 1.8;

      ctx.save();
      ctx.translate(-r * 0.55, r * 0.45);
      ctx.rotate(0.5 - finWag);
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.34, r * 0.15, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(r * 0.35, r * 0.52);
      ctx.rotate(-0.45 + finWag * 1.4);
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.46, r * 0.18, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(r * 0.85, 0);
      ctx.fillStyle = cfg.midColor;
      ctx.beginPath(); ctx.ellipse(0, -r * 0.05, r * 0.38, r * 0.25, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      ctx.save();
      ctx.rotate(0.1 + chompRatio * 0.45);
      ctx.fillStyle = cfg.bellyColor;
      ctx.beginPath();
      ctx.moveTo(0, r * 0.05); ctx.lineTo(r * 0.32, r * 0.08); ctx.lineTo(r * 0.05, r * 0.22);
      ctx.closePath(); ctx.fill();
      ctx.restore();

      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(r * 0.12, -r * 0.1, r * 0.09, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath(); ctx.arc(r * 0.15, -r * 0.1, r * 0.045, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

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

      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-r * 0.45, -r * 0.48); ctx.lineTo(r * 0.4, -r * 0.48);
      ctx.moveTo(-r * 0.15, -r * 0.65); ctx.lineTo(-r * 0.25, r * 0.15);
      ctx.moveTo(r * 0.2, -r * 0.62); ctx.lineTo(r * 0.25, r * 0.15);
      ctx.stroke();

      if (tier >= 3) {
        drawEnergyBladeFin(-r * 0.2, -r * 0.62, r * 0.75, r * 0.28, -0.35, cfg.midColor, cfg.finGlow, finWag);
      }
    } else {
      const bodyLen = (isBoss || species === "swordfish") ? r * 1.25 : r * 1.08;
      const bodyH = species === "butterfish" ? r * 0.78 : r * 0.56;

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

      const bodyGrad = ctx.createLinearGradient(0, -bodyH, 0, bodyH);
      bodyGrad.addColorStop(0, cfg.color);
      bodyGrad.addColorStop(0.52, cfg.midColor);
      bodyGrad.addColorStop(0.75, cfg.bellyColor);
      bodyGrad.addColorStop(1, cfg.bellyColor);

      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(bodyLen * 0.95, -bodyH * 0.05);
      ctx.bezierCurveTo(bodyLen * 0.45, -bodyH * 1.05, -bodyLen * 0.45, -bodyH * 0.92, -bodyLen * 0.88, -bodyH * 0.14);
      ctx.lineTo(-bodyLen * 0.88, bodyH * 0.16);
      ctx.bezierCurveTo(-bodyLen * 0.45, bodyH * 0.92, bodyLen * 0.35, bodyH * 0.95, bodyLen * 0.86, bodyH * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isBoss ? "#38bdf8" : "rgba(255,255,255,0.45)";
      ctx.stroke();

      ctx.strokeStyle = cfg.accent;
      ctx.lineWidth = Math.max(1.5, r * 0.06);
      ctx.beginPath();
      ctx.moveTo(bodyLen * 0.42, -bodyH * 0.05);
      ctx.quadraticCurveTo(0, -bodyH * 0.18, -bodyLen * 0.78, 0);
      ctx.stroke();

      ctx.strokeStyle = isBoss ? "rgba(15, 23, 42, 0.45)" : "rgba(255, 255, 255, 0.22)";
      ctx.lineWidth = 1.4;
      for (let s = -2; s <= 2; s++) {
        const sx = s * r * 0.24;
        ctx.beginPath(); ctx.arc(sx, bodyH * 0.22, r * 0.22, -0.7, 0.9); ctx.stroke();
      }

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

      const jawAngle = (isBoss || species === "kingfish" ? 0.18 : 0.06) + chompRatio * 0.52;
      ctx.save();
      ctx.translate(bodyLen * 0.55, bodyH * 0.16);
      ctx.rotate(jawAngle);
      ctx.fillStyle = "#450a0a";
      ctx.beginPath();
      ctx.moveTo(0, -bodyH * 0.12); ctx.lineTo(r * 0.45, 0); ctx.lineTo(0, bodyH * 0.14);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff";
      for (let tIdx = 0; tIdx < 3; tIdx++) {
        const tx = r * (0.1 + tIdx * 0.11);
        ctx.beginPath();
        ctx.moveTo(tx, bodyH * 0.08); ctx.lineTo(tx + 3, -bodyH * 0.06); ctx.lineTo(tx + 6, bodyH * 0.08);
        ctx.fill();
      }
      ctx.fillStyle = cfg.bellyColor;
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, bodyH * 0.06);
      ctx.lineTo(r * 0.46, bodyH * 0.04);
      ctx.quadraticCurveTo(r * 0.15, bodyH * 0.28, -r * 0.12, bodyH * 0.22);
      ctx.closePath(); ctx.fill();
      ctx.restore();

      ctx.strokeStyle = "rgba(15, 23, 42, 0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bodyLen * 0.28, 0, bodyH * 0.55, -0.75, 0.75); ctx.stroke();

      const eyeX = bodyLen * 0.52;
      const eyeY = -bodyH * 0.22;
      ctx.fillStyle = isBoss ? "#e0f2fe" : "#ffffff";
      ctx.beginPath(); ctx.ellipse(eyeX, eyeY, r * 0.16, r * 0.13, -0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = isBoss ? "#0284c7" : "#0f172a";
      ctx.beginPath(); ctx.arc(eyeX + r * 0.04, eyeY, r * 0.075, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(eyeX + r * 0.06, eyeY - r * 0.04, r * 0.03, 0, Math.PI * 2); ctx.fill();

      if (tier >= 3 || isBoss) {
        drawEnergyBladeFin(bodyLen * 0.22, bodyH * 0.35, r * 1.25, r * 0.26, 0.28, cfg.midColor, cfg.finGlow, finWag);
      } else {
        ctx.save();
        ctx.translate(bodyLen * 0.22, bodyH * 0.35);
        ctx.rotate(0.3 + finWag);
        ctx.fillStyle = cfg.accent;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.quadraticCurveTo(-r * 0.45, r * 0.35, -r * 0.65, r * 0.08);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
  }

  ctx.restore();

  if (!isAfterimage) {
    // Thanh máu & tên phía trên đầu
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

    // Chữ "Áp chế huyết mạch" khi nằm trong Lĩnh Vực của Cá Vua
    if (isSuppressed) {
      ctx.font = "bold 12px Segoe UI";
      ctx.fillStyle = "#ff4d6d";
      ctx.strokeText("🩸 Áp chế huyết mạch", 0, r + 22);
      ctx.fillText("🩸 Áp chế huyết mạch", 0, r + 22);
    }
  }

  ctx.restore();
}

// ==================== MINIMAP & HUD ====================
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

  // Vẽ tất cả 3 Boss còn sống bằng chấm đỏ
  Object.values(bossesState).forEach(b => {
    if (b && b.alive) {
      miniCtx.fillStyle = "#ff3b3b";
      miniCtx.beginPath();
      miniCtx.arc(b.x * scale, b.y * scale, 4.8, 0, Math.PI * 2);
      miniCtx.fill();
    }
  });

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
  const eff = getEffectiveStats();
  const evo = EVO_TIERS[Math.min(EVO_TIERS.length - 1, myFish.tier - 1)];
  document.getElementById("hud-evo-info").textContent =
    `Cấp ${myFish.level} • Dạng ${myFish.tier}: ${evo.name} (${Math.round(myFish.score)} đ)`;

  const hpPct = Math.max(0, Math.min(100, (myFish.hp / eff.maxHp) * 100));
  document.getElementById("hud-hp-fill").style.width = hpPct + "%";
  document.getElementById("hud-hp-text").textContent = `${Math.ceil(myFish.hp)} / ${eff.maxHp}`;

  const expPct = Math.min(100, (myFish.exp / myFish.expNeed) * 100);
  document.getElementById("hud-exp-fill").style.width = expPct + "%";
  document.getElementById("hud-exp-text").textContent = `EXP: ${Math.floor(myFish.exp)} / ${myFish.expNeed}`;

  const cfg = FISH_TYPES[myFish.species];
  document.getElementById("hud-skill-name").textContent = cfg.skillName;
  document.getElementById("mobile-skill-label").textContent = cfg.skillName;
  document.getElementById("hud-ult-name").textContent = cfg.ultName;
  document.getElementById("mobile-ult-label").textContent = "ĐẶC BIỆT";

  const cdOv = document.getElementById("hud-skill-cd");
  const mobileCdOv = document.getElementById("mobile-skill-cd");
  if (myFish.skillTimer > 0) {
    const txt = myFish.skillTimer.toFixed(1) + "s";
    cdOv.style.opacity = "1"; cdOv.textContent = txt;
    mobileCdOv.style.opacity = "1"; mobileCdOv.textContent = txt;
  } else {
    cdOv.style.opacity = "0";
    mobileCdOv.style.opacity = "0";
  }

  // Cooldown / Hiệu lực Skill Đặc Biệt
  const ultBox = document.getElementById("hud-ult-box");
  const ultCdOv = document.getElementById("hud-ult-cd");
  const mobileUltCdOv = document.getElementById("mobile-ult-cd");
  if (myFish.ultTimer > 0) {
    ultBox.classList.add("active-ult");
    const activeTxt = `⚡${myFish.ultTimer.toFixed(0)}s`;
    ultCdOv.style.opacity = "1";
    ultCdOv.style.background = "rgba(217, 119, 6, 0.55)";
    ultCdOv.textContent = activeTxt;
    mobileUltCdOv.style.opacity = "1";
    mobileUltCdOv.style.background = "rgba(217, 119, 6, 0.55)";
    mobileUltCdOv.textContent = activeTxt;
  } else if (myFish.ultCdTimer > 0) {
    ultBox.classList.remove("active-ult");
    const txt = myFish.ultCdTimer.toFixed(0) + "s";
    ultCdOv.style.opacity = "1";
    ultCdOv.style.background = "rgba(0, 0, 0, 0.74)";
    ultCdOv.textContent = txt;
    mobileUltCdOv.style.opacity = "1";
    mobileUltCdOv.style.background = "rgba(0, 0, 0, 0.74)";
    mobileUltCdOv.textContent = txt;
  } else {
    ultBox.classList.remove("active-ult");
    ultCdOv.style.opacity = "0";
    mobileUltCdOv.style.opacity = "0";
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

  // Trạng thái cả 3 Con Boss
  const bossListEl = document.getElementById("boss-status-list");
  bossListEl.innerHTML = BOSS_SPAWNS.map((sp, i) => {
    const b = bossesState[sp.id];
    if (!b) return `<div class="boss-row"><span>Boss ${i + 1}</span><span>...</span></div>`;
    if (b.alive) {
      return `<div class="boss-row"><span>👹 ${sp.name}</span><span>${Math.round(b.hp)} HP</span></div>`;
    }
    const sec = Math.max(0, Math.ceil((b.respawnAt - Date.now()) / 1000));
    return `<div class="boss-row respawning"><span>⏳ ${sp.name}</span><span>${sec}s</span></div>`;
  }).join("");

  // Banner Sự Kiện phía trên chính giữa màn hình
  const evBanner = document.getElementById("event-banner");
  const activeEvId = getActiveEventType();
  if (activeEvId) {
    const evInfo = EVENTS_POOL.find(x => x.id === activeEvId);
    const remainSec = Math.max(0, Math.ceil((eventState.endsAt - Date.now()) / 1000));
    document.getElementById("event-title").textContent = `${evInfo.title} (${remainSec}s)`;
    document.getElementById("event-desc").textContent = evInfo.desc;
    evBanner.classList.remove("hidden");
  } else {
    evBanner.classList.add("hidden");
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
  await disconnectRealtimeRoom();

  await ensureDailyQuestReset(false);

  const score = myFish ? Math.round(myFish.score) : 0;
  const bonusCoins = Math.floor(score / 40);
  const totalCoins = sessionStats.coinsEarned + bonusCoins;

  userData.coins += totalCoins;
  userData.bestScore = Math.max(userData.bestScore || 0, score);
  userData.quests.foodEaten = (userData.quests.foodEaten || 0) + sessionStats.foodEaten;
  userData.quests.fishKilled = (userData.quests.fishKilled || 0) + sessionStats.fishKilled;
  userData.quests.bossKilled = (userData.quests.bossKilled || 0) + sessionStats.bossKilled;
  userData.quests.reachedTier2 = Math.max(userData.quests.reachedTier2 || 0, sessionStats.reachedTier2);
  userData.quests.gamesPlayed = (userData.quests.gamesPlayed || 0) + 1;

  await saveUserData();

  if (isDead) {
    document.getElementById("death-title").textContent = "💀 BẠN ĐÃ TỬ VONG!";
    document.getElementById("death-summary").innerHTML = `
      <div>${escapeHtml(reason)}</div>
      <div>Cấp đạt được: <b>Cấp ${myFish.level}</b> • Điểm: <b>${score}</b></div>
      <div>Cá đã nuốt: <b>${sessionStats.fishKilled}</b> • Mồi đã ăn: <b>${sessionStats.foodEaten}</b></div>
      <div>Coin nhận được: <b style="color:#ffd43b">+${totalCoins} Coin</b></div>
    `;
    document.getElementById("death-modal").classList.remove("hidden");
  } else {
    await renderLobby();
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