import {
  MAP_SIZE, BASE_FOOD_COUNT, AI_FISH_COUNT, MAP_ITEM_COUNT, MAP_ITEM_RESPAWN_MS, MAP_ITEM_DURATION,
  EVO_TIERS, BOSS_SPAWNS, UPGRADE_DEFS, QUEST_TEMPLATES,
  BOSS_VISION_RADIUS, BOSS_VORTEX_RADIUS, MAX_UPGRADE_LEVEL, MAX_SKILL_LEVEL, SKILL_KEYS, calcExpNeedForLevel
} from "./config.js";
import {
  getFishConfig, getFishSpecialSkill, getAllFishConfigs, getBuffList, getBuffConfig,
  getEventConfig, getMapItemList, getMapItemConfig
} from "./registries.js";
import * as svc from "./firebaseService.js";
import { GameRenderer, getTierFromLevel, getFishRadius } from "./renderer.js";
import { InputController } from "./input.js";

// ==================== STATE ====================
let currentUser = null, userData = null, selectedFishId = "swordfish";
let inGame = false, animFrameId = null, syncIntervalId = null, loopErrorLogged = false;
let myFish = null, remotePlayers = {}, aiFishes = [], foods = [], mapItems = [];
let poisonClouds = [], poisonDropTimer = 0, bubbles = [], floatingTexts = [];
let projectiles = [], biteEffects = [], reflectEffects = [], afterimages = [], afterimageTimer = 0;
let visualRings = [], screenSlashes = [], judgmentPillars = [];
let bossesState = {}, eventState = null, roomMeta = { startedAt: Date.now() };

let biteHold = false, camera = { x: MAP_SIZE / 2, y: MAP_SIZE / 2 };
let sessionStats = { foodEaten: 0, fishKilled: 0, bossKilled: 0, reachedTier2: 0, coinsEarned: 0 };
let pendingLevelUps = 0, choosingBuff = false;

const localBossKillLock = {}, recentPvpKillReward = {}, handledTornadoIds = new Set();
const lastVortexHitAt = {}, bossMeleeCooldown = {}, bossPoisonTick = {}, pvpPoisonTick = {};
const barrierHitCd = {}, rollHitCd = {};

// ==================== ENGINE & INPUT ====================
const canvas = document.getElementById("game-canvas");
const miniCanvas = document.getElementById("minimap-canvas");
const renderer = new GameRenderer(canvas, miniCanvas);
renderer.resize();
window.addEventListener("resize", () => renderer.resize());

const input = new InputController({
  canvas,
  onBiteStart: () => { biteHold = true; performBite(); },
  onBiteEnd: () => { biteHold = false; },
  onUseSkillSlot: (slotIdx) => { if (inGame) triggerSkillSlot(slotIdx); },
  onHotbarSelect: (idx) => {
    if (!inGame || !choosingBuff) return;
    const cards = document.querySelectorAll(".buff-card");
    if (cards[idx]) cards[idx].click();
  },
  onModeChange: () => { if (inGame) refreshMobileControls(); }
});

function refreshMobileControls() {
  document.getElementById("mobile-controls").classList.toggle("hidden", !(input.inputMode === "touch" || input.isTouchDevice));
}

// ==================== DAILY QUESTS & PROFILE ====================
const getTodayDateVN = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
const createFreshQuests = () => ({ foodEaten: 0, fishKilled: 0, reachedTier2: 0, bossKilled: 0, gamesPlayed: 0, claimed: {}, lastResetDate: getTodayDateVN() });
const createDefaultUpgrades = () => ({ hp: 0, speed: 0, dmg: 0, eatRange: 0, defense: 0, skillPower: 0 });
const createDefaultUser = (user) => ({
  nickname: user.displayName ? user.displayName.slice(0, 14) : "Ngư Thủ",
  coins: 150, bestScore: 0, upgrades: createDefaultUpgrades(), quests: createFreshQuests()
});

async function ensureDailyQuestReset(shouldSave = true) {
  if (!userData) return;
  const today = getTodayDateVN();
  if (!userData.quests || userData.quests.lastResetDate !== today) {
    userData.quests = createFreshQuests();
    if (shouldSave && currentUser) await svc.saveUserProfile(currentUser.uid, userData);
  } else if (!userData.quests.claimed) userData.quests.claimed = {};
}

// ==================== SCREENS & AUTH ====================
const screens = { login: document.getElementById("login-screen"), lobby: document.getElementById("lobby-screen"), game: document.getElementById("game-screen") };
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");
  const cw = document.getElementById("chat-widget");
  if (name === "login") cw.classList.add("hidden");
  else { cw.classList.remove("hidden"); cw.classList.toggle("lobby-pos", name === "lobby"); }
}

document.getElementById("btn-google-login").addEventListener("click", async () => {
  const st = document.getElementById("login-status"); st.textContent = "Đang kết nối Google...";
  try { await svc.loginGoogle(); } catch (err) { st.textContent = "Lỗi đăng nhập: " + err.message; }
});
document.getElementById("btn-logout").addEventListener("click", () => svc.logoutGoogle());

svc.initAuthObserver(
  async (user) => {
    currentUser = user;
    userData = await svc.loadUserProfile(user.uid, () => createDefaultUser(user));
    userData.upgrades = { ...createDefaultUpgrades(), ...(userData.upgrades || {}) };
    await ensureDailyQuestReset(true);
    initChatUI(); await renderLobby(); showScreen("lobby");
  },
  () => { currentUser = null; stopChatUI(); showScreen("login"); }
);

document.getElementById("btn-save-name").addEventListener("click", async () => {
  const val = document.getElementById("input-nickname").value.trim();
  if (!val) return alert("Tên không được để trống!");
  userData.nickname = val;
  await svc.saveUserNickname(currentUser.uid, val);
  alert("Đã lưu tên hiển thị: " + val);
});

// ==================== LOBBY UI ====================
async function renderLobby() {
  await ensureDailyQuestReset(true);
  document.getElementById("user-avatar").src = currentUser.photoURL || "";
  document.getElementById("input-nickname").value = userData.nickname;
  document.getElementById("lobby-coins").textContent = userData.coins;

  const fishList = document.getElementById("fish-list"); fishList.innerHTML = "";
  getAllFishConfigs().forEach(f => {
    const card = document.createElement("div");
    card.className = `fish-card ${f.id === "kingfish" ? "king" : ""} ${selectedFishId === f.id ? "selected" : ""}`;
    card.innerHTML = `<div class="fish-title"><span>${f.icon} ${f.name}</span>${f.cost > 0 ? `<span class="fish-tag">🪙 ${f.cost}</span>` : `<span class="fish-tag" style="background:#51cf66">Miễn phí</span>`}</div><div class="fish-desc">${f.desc}</div>`;
    card.onclick = () => { selectedFishId = f.id; renderLobby(); };
    fishList.appendChild(card);
  });

  const upgList = document.getElementById("upgrade-list"); upgList.innerHTML = "";
  UPGRADE_DEFS.forEach(u => {
    const maxLvl = u.maxLevel || MAX_UPGRADE_LEVEL;
    const lvl = Math.min(maxLvl, userData.upgrades[u.key] || 0);
    const isMax = lvl >= maxLvl, cost = u.baseCost + lvl * u.stepCost;
    const div = document.createElement("div"); div.className = "upgrade-item";
    div.innerHTML = `<div class="upgrade-info"><b>${u.name} (Cấp ${lvl}/${maxLvl})</b><div>${u.bonusText}</div></div><button class="btn-small" ${isMax ? 'disabled style="background:#2b4459;color:#9ec9e6;cursor:default;"' : ""}>${isMax ? "TỐI ĐA" : `🪙 ${cost}`}</button>`;
    div.querySelector("button").onclick = async () => {
      if (isMax) return;
      if (userData.coins < cost) return alert("Không đủ Coin!");
      userData.coins -= cost; userData.upgrades[u.key] = lvl + 1;
      await svc.saveUserProfile(currentUser.uid, userData); renderLobby();
    };
    upgList.appendChild(div);
  });

  const qList = document.getElementById("quest-list"); qList.innerHTML = "";
  QUEST_TEMPLATES.forEach(q => {
    const prog = Math.min(q.target, userData.quests[q.statKey] || 0), claimed = !!userData.quests.claimed[q.id], done = prog >= q.target;
    const item = document.createElement("div"); item.className = "quest-item";
    item.innerHTML = `<div><div class="q-title">${q.title}</div><div class="q-prog">Tiến độ: ${prog}/${q.target} • Thưởng: 🪙 ${q.reward}</div></div><button class="btn-claim" ${!done || claimed ? "disabled" : ""}>${claimed ? "Đã nhận" : done ? "Nhận" : "Chưa xong"}</button>`;
    item.querySelector("button").onclick = async () => {
      await ensureDailyQuestReset(true);
      if ((userData.quests[q.statKey] || 0) < q.target || userData.quests.claimed[q.id]) return renderLobby();
      userData.coins += q.reward; userData.quests.claimed[q.id] = true;
      await svc.saveUserProfile(currentUser.uid, userData); renderLobby();
    };
    qList.appendChild(item);
  });

  const sf = getFishConfig(selectedFishId);
  document.getElementById("selected-fish-summary").textContent = `Đang chọn: ${sf.icon} ${sf.name}` + (sf.cost > 0 ? ` (Trừ ${sf.cost} Coin khi vào trận)` : "");
  const topArr = await svc.fetchTopLeaderboard(5);
  document.getElementById("lobby-leaderboard").innerHTML = topArr.length
    ? topArr.map((u, i) => `<div class="mini-lb-row"><span>${i === 0 ? "👑" : `#${i + 1}`} ${escapeHtml(u.nickname || "Ẩn danh")}</span><b>${u.bestScore || 0} đ</b></div>`).join("")
    : "Chưa có dữ liệu";
}

// ==================== CHAT UI ====================
let chatUnsub = null, chatOpen = false, unreadChatCount = 0, lastChatAt = 0;
const chatBox = document.getElementById("chat-box"), chatToggleBtn = document.getElementById("chat-toggle-btn");
const chatUnread = document.getElementById("chat-unread"), chatMsgsEl = document.getElementById("chat-messages"), chatInput = document.getElementById("chat-input");

function setChatOpen(open) {
  chatOpen = open; chatBox.classList.toggle("hidden", !open); chatToggleBtn.classList.toggle("hidden", open);
  if (open) { unreadChatCount = 0; chatUnread.classList.add("hidden"); chatMsgsEl.scrollTop = chatMsgsEl.scrollHeight; }
}
chatToggleBtn.addEventListener("click", () => setChatOpen(true));
document.getElementById("chat-close-btn").addEventListener("click", () => setChatOpen(false));
document.getElementById("chat-form").addEventListener("submit", async (e) => {
  e.preventDefault(); if (!currentUser || !userData) return;
  const txt = chatInput.value.trim(); if (!txt || Date.now() - lastChatAt < 800) return;
  lastChatAt = Date.now(); chatInput.value = "";
  await svc.sendChatMessage(currentUser.uid, userData.nickname || "Ngư Thủ", txt);
});
function initChatUI() {
  stopChatUI(); setChatOpen(!input.isTouchDevice && window.innerWidth > 768);
  let initDone = false;
  chatUnsub = svc.subscribeChatMessages(25, (list) => {
    const prev = chatMsgsEl.children.length;
    chatMsgsEl.innerHTML = list.map(m => `<div class="chat-msg ${currentUser && m.uid === currentUser.uid ? "me" : ""}"><span class="c-name">${escapeHtml(m.name)}:</span> <span>${escapeHtml(m.text)}</span></div>`).join("");
    chatMsgsEl.scrollTop = chatMsgsEl.scrollHeight;
    if (initDone && !chatOpen && list.length >= prev) { unreadChatCount++; chatUnread.textContent = unreadChatCount > 9 ? "9+" : unreadChatCount; chatUnread.classList.remove("hidden"); }
    initDone = true;
  });
}
function stopChatUI() { if (chatUnsub) { chatUnsub(); chatUnsub = null; } }

// ==================== HELPERS & STATS ====================
function getHighestPlayerLevel() {
  let maxL = myFish ? myFish.level : 1;
  Object.values(remotePlayers).forEach(p => { if ((p.level || 1) > maxL) maxL = p.level; });
  return maxL;
}

function isImmuneToCC(fish) {
  if (!fish) return false;
  const spec = getFishSpecialSkill(fish.species);
  return (fish.ultTimer > 0 && !!spec?.domainRadius) || (fish.tempBuffs?.ironman || 0) > 0;
}

function applyStunToMe(seconds) {
  if (!myFish || seconds <= 0) return;
  if (isImmuneToCC(myFish)) { addFloatingText(myFish.x, myFish.y - 40, "🛡️ MIỄN KHỐNG CHẾ!", "#fde047", 1.05); return; }
  if (seconds > myFish.stunTimer) { myFish.stunTimer = seconds; addFloatingText(myFish.x, myFish.y - 40, `💫 CHOÁNG ${seconds}s!`, "#facc15", 1.15); }
}

function getActiveEventConfig() {
  if (!eventState || !eventState.active || Date.now() > eventState.endsAt) return null;
  return getEventConfig(eventState.type);
}

function getDomainEffects() {
  if (!myFish) return { suppressed: false, suppressedDebuff: 0, suppressedCount: 0, bossSlowed: false };
  let suppressed = false, suppressedDebuff = 0, suppressedCount = 0, bossSlowed = false;
  if (!isImmuneToCC(myFish)) {
    Object.values(remotePlayers).forEach(p => {
      const sp = getFishSpecialSkill(p.species);
      if (p.ultActive && sp?.domainRadius && Math.hypot(p.x - myFish.x, p.y - myFish.y) <= sp.domainRadius) {
        suppressed = true; suppressedDebuff = Math.max(suppressedDebuff, sp.domainDebuff || 0.4);
      }
    });
    const nowMs = Date.now();
    Object.values(bossesState).forEach(b => {
      if (b?.alive && (b.absUntil || 0) > nowMs && Math.hypot(b.x - myFish.x, b.y - myFish.y) <= BOSS_VISION_RADIUS) bossSlowed = true;
    });
  }
  const mySpec = getFishSpecialSkill(myFish.species);
  if (myFish.ultTimer > 0 && mySpec?.domainRadius) {
    const r = mySpec.domainRadius;
    aiFishes.forEach(ai => { if (Math.hypot(ai.x - myFish.x, ai.y - myFish.y) <= r) suppressedCount++; });
    Object.values(remotePlayers).forEach(p => { if (Math.hypot(p.x - myFish.x, p.y - myFish.y) <= r) suppressedCount++; });
    Object.values(bossesState).forEach(b => { if (b?.alive && Math.hypot(b.x - myFish.x, b.y - myFish.y) <= r) suppressedCount++; });
  }
  return { suppressed, suppressedDebuff, suppressedCount, bossSlowed };
}

function getEffectiveStats() {
  if (!myFish) return null;
  const spec = getFishSpecialSkill(myFish.species);
  const ev = getActiveEventConfig(), dom = getDomainEffects();

  let speedMult = 1, dmgMult = 1, maxHpMult = 1, biteRangeMult = 1, expMult = 1, eatRangeMult = 1;
  let dmgTakenMult = myFish.baseDmgTakenMult;

  if (ev?.modifiers) {
    if (ev.modifiers.speedMult) speedMult *= ev.modifiers.speedMult;
    if (ev.modifiers.dmgMult) dmgMult *= ev.modifiers.dmgMult;
    if (ev.modifiers.maxHpMult) maxHpMult *= ev.modifiers.maxHpMult;
    if (ev.modifiers.expMult) expMult *= ev.modifiers.expMult;
  }
  Object.entries(myFish.tempBuffs || {}).forEach(([id, rem]) => {
    if (rem <= 0) return;
    const m = getMapItemConfig(id)?.modifiers;
    if (!m) return;
    if (m.speedMult) speedMult *= m.speedMult;
    if (m.eatRangeMult) eatRangeMult *= m.eatRangeMult;
    if (m.expMult) expMult *= m.expMult;
    if (m.dmgTakenMult !== undefined) dmgTakenMult *= m.dmgTakenMult;
  });

  if (dom.suppressed) { const k = 1 - dom.suppressedDebuff; speedMult *= k; dmgMult *= k; maxHpMult *= k; }
  if (dom.bossSlowed) speedMult *= 0.6;
  if (dom.suppressedCount > 0) { const b = 1 + dom.suppressedCount * (spec.domainBuffPerEnemy || 0.1); speedMult *= b; dmgMult *= b; maxHpMult *= b; }
  if (myFish.rollTimer > 0) speedMult *= 1.6;

  if (myFish.ultTimer > 0 && spec?.modifiers) {
    const m = spec.modifiers;
    if (m.speedMult) speedMult *= m.speedMult;
    if (m.dmgMult) dmgMult *= m.dmgMult;
    if (m.biteRangeMult) biteRangeMult *= m.biteRangeMult;
    if (m.dmgTakenMult !== undefined) dmgTakenMult *= m.dmgTakenMult;
  }

  return {
    speed: myFish.baseSpeed * speedMult, dmg: myFish.baseDmg * dmgMult, maxHp: Math.round(myFish.baseMaxHp * maxHpMult),
    biteRangeMult, eatRangeMult, expMult, dmgTakenMult, suppressed: dom.suppressed
  };
}

// ==================== 5-SKILL BAR UI BUILDER ====================
function buildSkillBarsUI() {
  const cfg = getFishConfig(myFish.species);
  const pcBar = document.getElementById("hud-skills-bar");
  const mobBar = document.getElementById("mobile-skills-bar");
  pcBar.innerHTML = ""; mobBar.innerHTML = "";

  cfg.skills.forEach((sk, idx) => {
    const typeClass = sk.isUltimate ? "ultimate-slot" : (sk.isSpecial ? "special-slot" : "");
    // PC Slot + Nút nâng cấp (+)
    const wrap = document.createElement("div");
    wrap.className = "skill-slot-wrap";
    wrap.innerHTML = `
      <button type="button" class="btn-upg-skill hidden" id="upg-sk-${idx}" title="Nâng cấp ${sk.name}">+</button>
      <div class="skill-slot ${typeClass}" id="pc-sk-${idx}">
        <div class="sk-key">${SKILL_KEYS[idx]}</div>
        <div class="sk-name">${sk.icon} ${sk.name}</div>
        <div class="sk-lv" id="pc-sk-lv-${idx}">Lv.1</div>
        <div class="sk-overlay" id="pc-sk-ov-${idx}"></div>
      </div>
    `;
    wrap.querySelector(`#pc-sk-${idx}`).addEventListener("click", () => triggerSkillSlot(idx));
    wrap.querySelector(`#upg-sk-${idx}`).addEventListener("click", (e) => { e.stopPropagation(); upgradeSkillSlot(idx); });
    pcBar.appendChild(wrap);

    // Mobile Circular Skill Button
    const mBtn = document.createElement("button");
    mBtn.type = "button";
    mBtn.className = `m-skill-btn ${typeClass}`;
    mBtn.id = `mob-sk-${idx}`;
    mBtn.innerHTML = `<span style="font-size:15px">${sk.icon}</span><span>${SKILL_KEYS[idx]}</span><div class="m-cd" id="mob-sk-cd-${idx}"></div>`;
    mBtn.addEventListener("touchstart", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (myFish.skillPoints > 0 && myFish.level >= sk.unlockLevel && myFish.skillLevels[idx] < MAX_SKILL_LEVEL && e.touches.length === 2) {
        upgradeSkillSlot(idx);
      } else {
        triggerSkillSlot(idx);
      }
    }, { passive: false });
    mobBar.appendChild(mBtn);
  });
}

function upgradeSkillSlot(idx) {
  if (!myFish || myFish.skillPoints <= 0) return;
  const sk = getFishConfig(myFish.species).skills[idx];
  if (!sk || myFish.level < sk.unlockLevel) return;
  if (myFish.skillLevels[idx] >= MAX_SKILL_LEVEL) return;
  myFish.skillPoints -= 1;
  myFish.skillLevels[idx] += 1;
  addToast(`⬆️ Đã nâng cấp [${sk.name}] lên Lv.${myFish.skillLevels[idx]} (+22% uy lực, -8% hồi chiêu)!`);
}

// ==================== MATCH LIFECYCLE ====================
document.getElementById("btn-play").addEventListener("click", startMatch);

async function startMatch() {
  const cfg = getFishConfig(selectedFishId);
  if (cfg.cost > 0) {
    if (userData.coins < cfg.cost) return alert(`Bạn cần ${cfg.cost} Coin để sử dụng ${cfg.name}!`);
    userData.coins -= cfg.cost;
    await svc.saveUserProfile(currentUser.uid, userData);
  }

  const hpLvl = Math.min(MAX_UPGRADE_LEVEL, userData.upgrades.hp || 0);
  const speedLvl = Math.min(MAX_UPGRADE_LEVEL, userData.upgrades.speed || 0);
  const dmgLvl = Math.min(MAX_UPGRADE_LEVEL, userData.upgrades.dmg || 0);
  const eatLvl = Math.min(MAX_UPGRADE_LEVEL, userData.upgrades.eatRange || 0);
  const defLvl = Math.min(MAX_UPGRADE_LEVEL, userData.upgrades.defense || 0);
  const skPowLvl = Math.min(MAX_UPGRADE_LEVEL, userData.upgrades.skillPower || 0);

  const baseHp = 120 + hpLvl * 20;
  const baseSpeed = 240 * (1 + speedLvl * 0.02) * cfg.stats.speedMult;
  const baseDmg = (22 + dmgLvl * 5) * cfg.stats.dmgMult;

  myFish = {
    uid: currentUser.uid, name: userData.nickname, species: selectedFishId,
    x: 800 + Math.random() * (MAP_SIZE - 1600), y: 800 + Math.random() * (MAP_SIZE - 1600),
    angle: 0, level: 1, tier: 1, exp: 0, expNeed: calcExpNeedForLevel(1), score: 0,
    hp: baseHp, baseMaxHp: baseHp, baseSpeed, baseDmg,
    baseDmgTakenMult: Math.max(0.1, cfg.stats.dmgTakenMult - defLvl * 0.01),
    healOnFood: cfg.stats.healOnFood, healOnKill: cfg.stats.healOnKill,
    eatRangeBonus: 1 + eatLvl * 0.05, sizeMult: 1,
    skillDmgMult: 1 + skPowLvl * 0.05, skillCdMult: 1,
    skillCooldowns: [0, 0, 0, 0, 0],
    skillLevels: [1, 1, 1, 1, 1],
    skillPoints: 0,
    ultTimer: 0, ultFinisher: null, kingGuards: [],
    shieldTimer: 3.0, stunTimer: 0, dashTimer: 0, rollTimer: 0, rollDmg: 0, reflectTimer: 0,
    biteCooldown: 0, chompTimer: 0,
    buffCounts: {}, tempBuffs: {}, knockbackFly: null, joinedAt: Date.now()
  };

  sessionStats = { foodEaten: 0, fishKilled: 0, bossKilled: 0, reachedTier2: 0, coinsEarned: 0 };
  pendingLevelUps = 0; choosingBuff = false; biteHold = false; loopErrorLogged = false;
  input.resetJoystick();
  floatingTexts = []; projectiles = []; biteEffects = []; reflectEffects = []; afterimages = [];
  visualRings = []; screenSlashes = []; judgmentPillars = [];
  poisonClouds = []; poisonDropTimer = 0; handledTornadoIds.clear();
  [localBossKillLock, recentPvpKillReward, lastVortexHitAt, bossMeleeCooldown, bossPoisonTick, pvpPoisonTick, barrierHitCd, rollHitCd]
    .forEach(o => Object.keys(o).forEach(k => delete o[k]));

  foods = Array.from({ length: BASE_FOOD_COUNT }, () => spawnFood());
  mapItems = Array.from({ length: MAP_ITEM_COUNT }, () => spawnMapItem());
  aiFishes = Array.from({ length: AI_FISH_COUNT }, (_, i) => spawnAiFish(i));
  bubbles = Array.from({ length: 220 }, () => ({ x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE, r: 2 + Math.random() * 5, v: 20 + Math.random() * 40 }));

  buildSkillBarsUI();
  ["exit-modal", "death-modal", "buff-modal"].forEach(id => document.getElementById(id).classList.add("hidden"));
  showScreen("game");
  if (input.isTouchDevice || window.innerWidth <= 768) setChatOpen(false);
  renderer.resize(); refreshMobileControls(); inGame = true;

  await svc.joinGameRoom(currentUser.uid, {
    onPlayersChange: (p) => { remotePlayers = p; },
    onIncomingHit: handleIncomingPvpHit,
    onBossesChange: (b) => { bossesState = b; },
    onEventChange: (e) => { eventState = e; },
    onMetaChange: (m) => { roomMeta = m; },
    isHost
  });

  syncIntervalId = setInterval(() => {
    if (!inGame || !myFish) return;
    const eff = getEffectiveStats();
    svc.pushPlayerState(myFish.uid, {
      uid: myFish.uid, name: myFish.name, species: myFish.species,
      x: Math.round(myFish.x), y: Math.round(myFish.y), angle: Number(myFish.angle.toFixed(2)),
      level: myFish.level, tier: myFish.tier, score: myFish.score,
      hp: Math.round(myFish.hp), maxHp: eff.maxHp, sizeMult: myFish.sizeMult,
      shield: myFish.shieldTimer > 0, chomping: myFish.chompTimer > 0,
      ultActive: myFish.ultTimer > 0, stunned: myFish.stunTimer > 0,
      joinedAt: myFish.joinedAt, updatedAt: Date.now()
    });
    if (isHost()) {
      const all = [myFish, ...Object.values(remotePlayers)].filter(Boolean);
      const maxT = Math.max(1, ...all.map(p => p.tier || 1));
      const maxL = Math.max(1, ...all.map(p => p.level || 1));
      svc.hostUpdateWorld(bossesState, eventState, all, maxT, maxL, roomMeta?.startedAt);
    }
  }, 66);

  lastTime = performance.now();
  animFrameId = requestAnimationFrame(gameLoop);
}

function isHost() {
  if (!myFish) return false;
  const active = [myFish, ...Object.values(remotePlayers)].filter(p => !p.updatedAt || Date.now() - p.updatedAt < 10000);
  active.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  return active[0]?.uid === myFish.uid;
}

const spawnFood = (x, y, val = 14) => ({
  x: x ?? Math.random() * MAP_SIZE, y: y ?? Math.random() * MAP_SIZE,
  val, r: val > 20 ? 10 : 6, color: `hsl(${Math.random() * 360}, 85%, 65%)`, phase: Math.random() * Math.PI * 2
});

function spawnMapItem() {
  const pool = getMapItemList();
  const totalWeight = pool.reduce((s, it) => s + (it.weight || 1), 0);
  let roll = Math.random() * totalWeight, chosen = pool[0];
  for (const it of pool) { roll -= (it.weight || 1); if (roll <= 0) { chosen = it; break; } }
  return { type: chosen.id, icon: chosen.icon, color: chosen.color, fallbackText: chosen.fallbackText || "", x: 400 + Math.random() * (MAP_SIZE - 800), y: 400 + Math.random() * (MAP_SIZE - 800), phase: Math.random() * Math.PI * 2 };
}

// Cá AI phân bổ theo cấp độ người chơi mạnh nhất (gồm cả Cá Tinh Anh cấp cao cho nhiều EXP!)
function spawnAiFish(idx) {
  const keys = getAllFishConfigs().filter(f => f.cost === 0).map(f => f.id);
  const topLvl = getHighestPlayerLevel();
  const roll = Math.random();
  let level = 1, elite = false;

  if (roll < 0.35) {
    level = Math.max(1, Math.floor(1 + Math.random() * Math.max(5, topLvl * 0.45)));
  } else if (roll < 0.78) {
    level = Math.max(2, Math.floor(topLvl * 0.55 + Math.random() * Math.max(4, topLvl * 0.55)));
  } else {
    // 22% xuất hiện Cá Tinh Anh cấp cao hơn/bằng top server -> rơi rất nhiều EXP!
    level = Math.min(45, topLvl + 1 + Math.floor(Math.random() * 4));
    elite = true;
  }

  const maxHp = Math.round((85 + level * 26) * (elite ? 1.45 : 1));
  const ang = Math.random() * Math.PI * 2;
  return {
    id: `ai_${idx}_${Math.random().toString(36).slice(2, 6)}`,
    name: elite ? ["Hải Vương Nhỏ", "Kình Ngư Cổ Đại", "Bá Ngư Tinh Anh"][idx % 3] : ["Cá Hổ", "Cá Đuối", "Kình Ngư", "Hải Ngư", "Cá Mập Nhỏ"][idx % 5],
    species: keys[idx % keys.length], level, tier: getTierFromLevel(level), elite,
    x: 400 + Math.random() * (MAP_SIZE - 800), y: 400 + Math.random() * (MAP_SIZE - 800),
    angle: ang, targetAngle: ang, hp: maxHp, maxHp,
    dmg: Math.round((12 + level * 4.2) * (elite ? 1.25 : 1)),
    speed: 135 + Math.random() * 40,
    biteCooldown: 0, poisonTickCd: 0, stunTimer: 0, slowTimer: 0, aiTimer: 1 + Math.random() * 2
  };
}

// ==================== ITEM BUFF & SKILL EXECUTION ====================
function activateMapItem(item) {
  const cfg = getMapItemConfig(item.type);
  if (!cfg || !myFish) return;
  if (cfg.timed) {
    myFish.tempBuffs[cfg.id] = MAP_ITEM_DURATION;
    if (cfg.ccImmune) myFish.stunTimer = 0;
    addFloatingText(myFish.x, myFish.y - 38, `${cfg.icon} ${cfg.name} (15s)!`, cfg.color, 1.15);
    addToast(`✨ Nhận buff ${cfg.name} trong 15 giây!`);
    return;
  }
  if (cfg.id === "luck") {
    if (Math.random() < 0.5) {
      myFish.level += 1; myFish.expNeed = calcExpNeedForLevel(myFish.level);
      myFish.exp = Math.min(myFish.exp, Math.max(0, myFish.expNeed - 1));
      onLevelReached(myFish.level);
      addToast(`🍀 MAY RỦI: Lên ngay Cấp ${myFish.level}!`);
      addFloatingText(myFish.x, myFish.y - 42, "🍀 +1 CẤP!", "#4ade80", 1.3);
      if (!choosingBuff) openBuffChoice();
    } else if (myFish.level > 1) {
      myFish.level -= 1; myFish.expNeed = calcExpNeedForLevel(myFish.level);
      myFish.exp = Math.min(myFish.exp, Math.floor(myFish.expNeed * 0.5));
      myFish.tier = getTierFromLevel(myFish.level);
      myFish.baseMaxHp = Math.max(80, myFish.baseMaxHp - 20);
      myFish.baseDmg = Math.max(10, myFish.baseDmg - 3);
      myFish.hp = Math.min(myFish.hp, getEffectiveStats().maxHp);
      addToast(`💀 MAY RỦI: Tụt xuống Cấp ${myFish.level}!`);
      addFloatingText(myFish.x, myFish.y - 42, "💀 -1 CẤP!", "#f87171", 1.3);
    } else {
      addFloatingText(myFish.x, myFish.y - 42, "🍀 Thoát nạn (Cấp 1)!", "#fde047", 1.1);
    }
  } else if (cfg.id === "aoma") {
    const cands = Object.values(bossesState).filter(b => b?.alive);
    const list = cands.length > 0 ? cands : BOSS_SPAWNS;
    let nearest = list[0], minDist = Infinity;
    list.forEach(b => { const d = Math.hypot(b.x - myFish.x, b.y - myFish.y); if (d < minDist) { minDist = d; nearest = b; } });
    const ang = Math.atan2(nearest.y - myFish.y, nearest.x - myFish.x);
    const stopOff = Math.min(130, minDist * 0.2);
    const flyDur = Math.min(1.8, Math.max(0.75, minDist / 2200));
    myFish.knockbackFly = {
      startX: myFish.x, startY: myFish.y,
      targetX: Math.max(80, Math.min(MAP_SIZE - 80, nearest.x - Math.cos(ang) * stopOff)),
      targetY: Math.max(80, Math.min(MAP_SIZE - 80, nearest.y - Math.sin(ang) * stopOff)),
      progress: 0, duration: flyDur
    };
    myFish.shieldTimer = Math.max(myFish.shieldTimer, flyDur + 0.5);
    addToast(`❓ BUFF ẢO MA! Bị hất tung bay thẳng tới ${nearest.name}!`);
    addFloatingText(myFish.x, myFish.y - 44, "❓ ẢO MA BAY!", "#e879f9", 1.3);
  }
}

function triggerSkillSlot(slotIdx) {
  if (!inGame || !myFish || choosingBuff) return;
  const sk = getFishConfig(myFish.species).skills[slotIdx];
  if (!sk) return;

  if (myFish.level < sk.unlockLevel) {
    addFloatingText(myFish.x, myFish.y - 36, `🔒 Cần Cấp ${sk.unlockLevel}!`, "#cbd5e1", 0.95);
    return;
  }
  // Cho phép Cá Vua bật Áp chế tuyệt đối để giải choáng, các skill khác bị khóa khi choáng
  if (myFish.stunTimer > 0 && !(sk.isSpecial && sk.domainRadius)) return;
  if (myFish.skillCooldowns[slotIdx] > 0) return;

  const skLv = myFish.skillLevels[slotIdx] || 1;
  const lvDmgMult = 1 + (skLv - 1) * 0.22; // +22% uy lực mỗi cấp skill
  const lvCdMult = Math.max(0.55, 1 - (skLv - 1) * 0.08); // -8% hồi chiêu mỗi cấp skill
  myFish.skillCooldowns[slotIdx] = sk.cd * lvCdMult * myFish.skillCdMult;

  const eff = getEffectiveStats();
  const skillDmg = eff.dmg * myFish.skillDmgMult * lvDmgMult;

  sk.execute({
    fish: myFish, effStats: eff, skillDmg,
    isAlive: () => inGame && !!myFish && myFish.hp > 0,
    addFloatingText, addToast,
    spawnProjectile: (p) => projectiles.push(p),
    spawnBiteEffect: (ef) => biteEffects.push(ef),
    spawnVisualRing: (r) => visualRings.push(r),
    dealAoEDamage,
    activateSpecialBuff: (spSk) => {
      myFish.ultTimer = spSk.duration || 10;
      if (isImmuneToCC(myFish)) myFish.stunTimer = 0;
      addToast(`🔥 KÍCH HOẠT: ${spSk.name.toUpperCase()}! (${myFish.ultTimer}s)`);
      addFloatingText(myFish.x, myFish.y - 48, `⚡ ${spSk.name.toUpperCase()}!`, "#fde047", 1.25);
    }
  });
}

// ==================== COMBAT ====================
function applyDamageToMe(rawDmg, attackerName, stunDuration = 0, onReflectCallback = null) {
  if (!inGame || !myFish) return false;
  const spec = getFishSpecialSkill(myFish.species);
  if (myFish.ultTimer > 0 && spec) {
    if (spec.dodgeChance && Math.random() < spec.dodgeChance) { addFloatingText(myFish.x, myFish.y - 34, "💨 Hụt!", "#74c0fc", 1.15); return false; }
    if (spec.reflectRate) {
      addFloatingText(myFish.x, myFish.y - 34, "🛡️ PHẢN ĐÒN!", "#ffd43b", 1.1);
      if (onReflectCallback) onReflectCallback(Math.round(rawDmg * spec.reflectRate));
      return false;
    }
  }
  if (myFish.shieldTimer > 0) return false;

  const eff = getEffectiveStats();
  const actualDmg = Math.max(1, Math.round(rawDmg * eff.dmgTakenMult));
  myFish.hp -= actualDmg;
  addFloatingText(myFish.x, myFish.y - 30, `-${actualDmg}`, "#ff4d4d", 1);
  if (stunDuration > 0) applyStunToMe(stunDuration);
  if (myFish.reflectTimer > 0 && onReflectCallback) onReflectCallback(Math.round(actualDmg * 0.6));
  if (myFish.hp <= 0) finishMatch(true, `Bị ${attackerName} hạ gục!`);
  return true;
}

function handleIncomingPvpHit(hit) {
  if (!inGame || !myFish) return;
  if (hit.isReflectFx) reflectEffects.push({ x: myFish.x, y: myFish.y, life: 0.35, maxLife: 0.35 });
  if (hit.knockbackX || hit.knockbackY) {
    myFish.x = Math.max(40, Math.min(MAP_SIZE - 40, myFish.x + (hit.knockbackX || 0)));
    myFish.y = Math.max(40, Math.min(MAP_SIZE - 40, myFish.y + (hit.knockbackY || 0)));
  }
  applyDamageToMe(hit.dmg, hit.fromName || "người chơi khác", hit.stun || 0, (refDmg) => {
    if (hit.fromUid && !hit.isReflectFx) {
      svc.pushPvpHit(hit.fromUid, { fromUid: myFish.uid, fromName: myFish.name, dmg: refDmg, crit: false, isReflectFx: true });
      if (remotePlayers[hit.fromUid]) reflectEffects.push({ x: remotePlayers[hit.fromUid].x, y: remotePlayers[hit.fromUid].y, life: 0.35, maxLife: 0.35 });
    }
  });
}

function evaluateBiteHit(bx, by, br, tx, ty, ta, tr) {
  const tailX = tx - Math.cos(ta) * tr * 0.95, tailY = ty - Math.sin(ta) * tr * 0.95;
  const headX = tx + Math.cos(ta) * tr * 0.95, headY = ty + Math.sin(ta) * tr * 0.95;
  const dTail = Math.hypot(tailX - bx, tailY - by), dHead = Math.hypot(headX - bx, headY - by);
  const hit = Math.hypot(tx - bx, ty - by) <= br + tr || dTail <= br + tr * 0.55;
  return { hit, isCrit: hit && dTail <= br + tr * 0.65 && dTail < dHead, tailX, tailY };
}

function performBite() {
  if (!inGame || !myFish || choosingBuff || myFish.biteCooldown > 0 || myFish.stunTimer > 0 || myFish.knockbackFly) return;
  const eff = getEffectiveStats();
  const spec = getFishSpecialSkill(myFish.species);

  // Skill Cuối Cá Chim (Lưu Tinh Hủy Diệt): Tấn công siêu nhanh & lao xuyên hết tầm nhìn!
  if (myFish.ultFinisher?.type === "birdMeteor") {
    myFish.biteCooldown = 0.20;
    myFish.chompTimer = 0.16;
    const dashLen = Math.min(720, Math.max(renderer.logicalW, renderer.logicalH) * 0.65);
    const startX = myFish.x, startY = myFish.y;
    const endX = Math.max(50, Math.min(MAP_SIZE - 50, startX + Math.cos(myFish.angle) * dashLen));
    const endY = Math.max(50, Math.min(MAP_SIZE - 50, startY + Math.sin(myFish.angle) * dashLen));
    const steps = 6;
    const meteorDmg = myFish.ultFinisher.dmg;

    for (let s = 1; s <= steps; s++) {
      const px = startX + ((endX - startX) * s) / steps;
      const py = startY + ((endY - startY) * s) / steps;
      afterimages.push({ x: px, y: py, angle: myFish.angle, level: myFish.level, tier: myFish.tier, sizeMult: myFish.sizeMult, species: myFish.species, life: 0.3, maxLife: 0.3 });
    }
    screenSlashes.push({ x: (startX + endX) / 2, y: (startY + endY) / 2, angle: myFish.angle, len: dashLen, life: 0.22, maxLife: 0.22 });
    myFish.x = endX; myFish.y = endY;

    // Gây sát thương mọi kẻ địch dọc đường lao tới
    const hitLine = (tx, ty, tr) => {
      const l2 = Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2) || 1;
      const proj = Math.max(0, Math.min(1, ((tx - startX) * (endX - startX) + (ty - startY) * (endY - startY)) / l2));
      return Math.hypot(tx - (startX + proj * (endX - startX)), ty - (startY + proj * (endY - startY))) <= tr + 55;
    };
    aiFishes.forEach(ai => { if (hitLine(ai.x, ai.y, getFishRadius(ai.level, ai.tier, 1))) damageAiFish(ai, meteorDmg, false, ai.x, ai.y); });
    Object.values(remotePlayers).forEach(p => {
      if (hitLine(p.x, p.y, getFishRadius(p.level || 1, p.tier || 1, p.sizeMult || 1))) {
        svc.pushPvpHit(p.uid, { fromUid: myFish.uid, fromName: myFish.name, dmg: Math.round(meteorDmg), crit: true, isReflectFx: false });
        addFloatingText(p.x, p.y - 30, `☄️ -${Math.round(meteorDmg)}`, "#f472b6", 1.2);
      }
    });
    Object.values(bossesState).forEach(b => {
      if (b?.alive && hitLine(b.x, b.y, getFishRadius(b.level || 10, b.tier || 2, 1.35))) damageBoss(b.id, meteorDmg, false, b.x, b.y - 50);
    });
    return;
  }

  myFish.biteCooldown = 0.38; myFish.chompTimer = 0.22;
  const myR = getFishRadius(myFish.level, myFish.tier, myFish.sizeMult);
  const biteDist = myR * 0.95 * eff.biteRangeMult, biteRadius = myR * 0.88 * eff.biteRangeMult;
  const bx = myFish.x + Math.cos(myFish.angle) * biteDist, by = myFish.y + Math.sin(myFish.angle) * biteDist;

  biteEffects.push({
    x: bx, y: by, angle: myFish.angle, radius: biteRadius, life: 0.24, maxLife: 0.24,
    critSpark: false, effectType: myFish.ultTimer > 0 ? (spec?.biteEffectType || "vampire") : "vampire"
  });

  for (let i = aiFishes.length - 1; i >= 0; i--) {
    const ai = aiFishes[i];
    const res = evaluateBiteHit(bx, by, biteRadius, ai.x, ai.y, ai.angle, getFishRadius(ai.level, ai.tier, 1));
    if (res.hit) damageAiFish(ai, res.isCrit ? eff.dmg * 2 : eff.dmg, res.isCrit, res.tailX, res.tailY);
  }

  Object.values(remotePlayers).forEach(p => {
    const res = evaluateBiteHit(bx, by, biteRadius, p.x, p.y, p.angle || 0, getFishRadius(p.level || 1, p.tier || 1, p.sizeMult || 1));
    if (res.hit) {
      const dmg = res.isCrit ? eff.dmg * 2 : eff.dmg;
      svc.pushPvpHit(p.uid, { fromUid: myFish.uid, fromName: myFish.name, dmg: Math.round(dmg), crit: res.isCrit, isReflectFx: false });
      if (res.isCrit) {
        addFloatingText(res.tailX, res.tailY - 24, `💥 CHÍ MẠNG -${Math.round(dmg)}`, "#ff922b", 1.25);
        biteEffects.push({ x: res.tailX, y: res.tailY, angle: 0, radius: 34, life: 0.24, maxLife: 0.24, critSpark: true });
      } else addFloatingText(p.x, p.y - 30, `-${Math.round(dmg)}`, "#ffd43b", 1);

      if ((p.hp || 100) <= dmg && (!recentPvpKillReward[p.uid] || Date.now() - recentPvpKillReward[p.uid] > 4000)) {
        recentPvpKillReward[p.uid] = Date.now();
        sessionStats.fishKilled++; sessionStats.coinsEarned += 6;
        gainExp(Math.round(calcExpNeedForLevel(p.level || 1) * 0.7));
        if (myFish.healOnKill > 0 && myFish.hp < eff.maxHp) {
          const h = Math.min(myFish.healOnKill, eff.maxHp - myFish.hp); myFish.hp += h;
          addFloatingText(myFish.x, myFish.y - 25, `+${Math.round(h)} HP`, "#51cf66", 1);
        }
        addToast(`🔥 Bạn vừa nuốt chửng ${p.name}! (+6 Coin)`);
      }
    }
  });

  Object.values(bossesState).forEach(b => {
    if (!b?.alive) return;
    const res = evaluateBiteHit(bx, by, biteRadius, b.x, b.y, b.angle || 0, getFishRadius(b.level || 10, b.tier || 2, 1.35));
    if (res.hit) damageBoss(b.id, res.isCrit ? eff.dmg * 2 : eff.dmg, res.isCrit, res.tailX, res.tailY);
  });
}

function dealAoEDamage(cx, cy, radius, dmg, opts = {}) {
  aiFishes.forEach(ai => {
    const d = Math.hypot(ai.x - cx, ai.y - cy);
    if (d < radius) {
      damageAiFish(ai, dmg, false, ai.x, ai.y);
      if (opts.stunTimer) ai.stunTimer = Math.max(ai.stunTimer || 0, opts.stunTimer);
      if (opts.slowTimer) ai.slowTimer = Math.max(ai.slowTimer || 0, opts.slowTimer);
      if (opts.knockback) {
        const ang = Math.atan2(ai.y - cy, ai.x - cx);
        ai.x = Math.max(80, Math.min(MAP_SIZE - 80, ai.x + Math.cos(ang) * opts.knockback));
        ai.y = Math.max(80, Math.min(MAP_SIZE - 80, ai.y + Math.sin(ang) * opts.knockback));
      }
    }
  });
  Object.values(remotePlayers).forEach(p => {
    if (Math.hypot(p.x - cx, p.y - cy) < radius) {
      const ang = Math.atan2(p.y - cy, p.x - cx);
      svc.pushPvpHit(p.uid, {
        fromUid: myFish.uid, fromName: myFish.name, dmg: Math.round(dmg), crit: false, isReflectFx: false,
        stun: opts.stunTimer || 0,
        knockbackX: opts.knockback ? Math.round(Math.cos(ang) * opts.knockback) : 0,
        knockbackY: opts.knockback ? Math.round(Math.sin(ang) * opts.knockback) : 0
      });
    }
  });
  Object.values(bossesState).forEach(b => {
    if (b?.alive && Math.hypot(b.x - cx, b.y - cy) < radius + 70) damageBoss(b.id, dmg, false, b.x, b.y - 50);
  });
}

function damageBoss(bossId, dmg, isCrit = false, fxX = null, fxY = null) {
  const b = bossesState[bossId];
  if (!b || !b.alive || b.hp <= 0 || localBossKillLock[bossId] || !Number.isFinite(dmg) || dmg <= 0) return;

  const isAbs = (b.absUntil || 0) > Date.now();
  if (!isAbs) {
    if (isCrit && fxX !== null) {
      addFloatingText(fxX, fxY - 35, `💥 CHÍ MẠNG -${Math.round(dmg)}`, "#ff922b", 1.35);
      biteEffects.push({ x: fxX, y: fxY, angle: 0, radius: 34, life: 0.24, maxLife: 0.24, critSpark: true });
    } else addFloatingText(b.x, b.y - 60, `-${Math.round(dmg)}`, "#ffd43b", 1);
  }

  svc.runBossDamageTransaction(bossId, currentUser.uid, dmg, b, (res) => {
    if (res.absorbed) addFloatingText(b.x, b.y - 65, `💚 +${res.healAmount} HP (Hấp thụ)`, "#51cf66", 1.15);
    else if (res.killed) {
      localBossKillLock[bossId] = true;
      setTimeout(() => { delete localBossKillLock[bossId]; }, 5000);
      sessionStats.bossKilled++; sessionStats.coinsEarned += 25;
      // Boss cho EXP tương xứng với cấp độ của Boss để lên cấp cao (Cấp 30-40)
      const bossExp = Math.round(calcExpNeedForLevel(res.boss?.level || myFish.level) * 1.15);
      gainExp(bossExp);
      addToast(`🏆 HẠ GỤC ${(res.boss?.name || "BOSS").toUpperCase()}! (+25 Coin, +${bossExp} EXP)`);
    }
  });
}

function damageAiFish(ai, dmg, isCrit = false, fxX = ai.x, fxY = ai.y) {
  if (!ai || ai.hp <= 0 || !Number.isFinite(dmg) || dmg <= 0) return;
  ai.hp -= dmg;
  if (isCrit) {
    addFloatingText(fxX, fxY - 26, `💥 CHÍ MẠNG -${Math.round(dmg)}`, "#ff922b", 1.25);
    biteEffects.push({ x: fxX, y: fxY, angle: 0, radius: 34, life: 0.24, maxLife: 0.24, critSpark: true });
  } else addFloatingText(ai.x, ai.y - 25, `-${Math.round(dmg)}`, "#ffd43b", 1);

  if (ai.hp <= 0) {
    sessionStats.fishKilled++; sessionStats.coinsEarned += ai.elite ? 4 : 2;
    // Cá AI cấp cao rơi lượng EXP cực lớn theo đúng cấp độ của nó
    const aiExp = Math.round(calcExpNeedForLevel(ai.level) * (ai.elite ? 0.65 : 0.42));
    gainExp(aiExp);
    const eff = getEffectiveStats();
    if (myFish.healOnKill > 0 && myFish.hp < eff.maxHp) {
      const h = Math.min(myFish.healOnKill, eff.maxHp - myFish.hp); myFish.hp += h;
      addFloatingText(myFish.x, myFish.y - 25, `+${Math.round(h)} HP`, "#51cf66", 1);
    }
    const dropVal = Math.max(25, Math.round(aiExp * 0.12));
    for (let k = 0; k < 4; k++) foods.push(spawnFood(ai.x + (Math.random() - 0.5) * 45, ai.y + (Math.random() - 0.5) * 45, dropVal));
    const idx = aiFishes.indexOf(ai);
    if (idx !== -1) aiFishes[idx] = spawnAiFish(idx);
  }
}

// ==================== EXP & SKILL POINTS ====================
function onLevelReached(newLvl) {
  const oldTier = myFish.tier, newTier = getTierFromLevel(newLvl);
  myFish.tier = newTier;
  if (newTier >= 2) sessionStats.reachedTier2 = 1;
  myFish.baseMaxHp += 20;
  myFish.hp = Math.min(getEffectiveStats().maxHp, myFish.hp + 30);
  myFish.baseDmg += 3;
  pendingLevelUps++;

  // Cộng điểm nâng cấp skill: mỗi 2 cấp +1 điểm, mốc tiến hóa (10,20,30,40) +1 điểm nữa
  if (newLvl % 2 === 0) myFish.skillPoints += 1;
  if (newLvl % 10 === 0 && newLvl <= 40) myFish.skillPoints += 1;

  // Thông báo mở khóa Skill mới tại Cấp 10, 20, 30, 40
  const unlockedSk = getFishConfig(myFish.species).skills.find(s => s.unlockLevel === newLvl);
  if (unlockedSk) {
    addToast(`🔓 MỞ KHÓA SKILL MỚI [${SKILL_KEYS[unlockedSk.slot]}]: ${unlockedSk.name}!`);
  } else if (newTier > oldTier) {
    addToast(`🌟 TIẾN HÓA DẠNG ${newTier}: ${EVO_TIERS[newTier - 1].name}!`);
  } else {
    addToast(`⬆️ Lên Cấp ${newLvl}!`);
  }
}

function gainExp(amount) {
  if (!myFish || !Number.isFinite(amount) || amount <= 0) return;
  const eff = getEffectiveStats(), gained = amount * (eff ? eff.expMult : 1);
  if (!Number.isFinite(gained) || gained <= 0) return;

  myFish.exp += gained; myFish.score += gained;
  let safety = 0;
  while (myFish.exp >= myFish.expNeed && safety < 15) {
    safety++;
    myFish.exp -= myFish.expNeed;
    myFish.level += 1;
    myFish.expNeed = calcExpNeedForLevel(myFish.level);
    onLevelReached(myFish.level);
  }
  if (pendingLevelUps > 0 && !choosingBuff) openBuffChoice();
}

function openBuffChoice() {
  choosingBuff = true; biteHold = false; input.resetJoystick();
  myFish.shieldTimer = Math.max(myFish.shieldTimer, 4.0);
  document.getElementById("buff-modal-title").textContent = myFish.level % 10 === 0 ? `🌟 TIẾN HÓA CẤP ${myFish.level}! 🌟` : `✨ LÊN CẤP ${myFish.level}! ✨`;
  const container = document.getElementById("buff-choices"); container.innerHTML = "";
  [...getBuffList()].sort(() => Math.random() - 0.5).slice(0, 3).forEach((b, idx) => {
    const card = document.createElement("div"); card.className = "buff-card";
    card.innerHTML = `<div class="b-icon">${b.icon}</div><div class="b-name">[${idx + 1}] ${b.name}</div><div class="b-desc">${b.desc}</div>`;
    card.onclick = () => {
      if (!choosingBuff) return;
      myFish.buffCounts[b.id] = (myFish.buffCounts[b.id] || 0) + 1;
      b.apply(myFish);
      pendingLevelUps = Math.max(0, pendingLevelUps - 1);
      document.getElementById("buff-modal").classList.add("hidden");
      choosingBuff = false;
      if (pendingLevelUps > 0) openBuffChoice();
    };
    container.appendChild(card);
  });
  document.getElementById("buff-modal").classList.remove("hidden");
}

function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * Math.min(1, t);
}

// ==================== GAME LOOP ====================
let lastTime = 0;

function gameLoop(now) {
  if (!inGame) return;
  animFrameId = requestAnimationFrame(gameLoop);
  try {
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    updateGame(dt);
    const effStats = getEffectiveStats(), domainCheck = getDomainEffects(), top1Uid = getTop1Uid();
    renderer.renderWorld({
      camera, bubbles, foods, mapItems, poisonClouds, projectiles, afterimages,
      aiFishes, remotePlayers, bossesState, myFish, effStats, domainCheck,
      biteEffects, reflectEffects, visualRings, screenSlashes, judgmentPillars, floatingTexts, top1Uid
    });
    renderer.renderMinimap(myFish, remotePlayers, bossesState, top1Uid);
    updateHUD(effStats);
  } catch (err) {
    if (!loopErrorLogged) { loopErrorLogged = true; console.error("GameLoop error:", err); addToast("⚠️ Lỗi nhỏ: " + err.message); }
  }
}

function updateGame(dt) {
  if (!myFish) return;
  for (let i = 0; i < 5; i++) if (myFish.skillCooldowns[i] > 0) myFish.skillCooldowns[i] = Math.max(0, myFish.skillCooldowns[i] - dt);
  ["ultTimer", "shieldTimer", "stunTimer", "dashTimer", "rollTimer", "reflectTimer", "biteCooldown", "chompTimer"].forEach(k => {
    if (myFish[k] > 0) myFish[k] = Math.max(0, myFish[k] - dt);
  });
  Object.keys(myFish.tempBuffs).forEach(k => { myFish.tempBuffs[k] = Math.max(0, myFish.tempBuffs[k] - dt); if (myFish.tempBuffs[k] <= 0) delete myFish.tempBuffs[k]; });
  if (isImmuneToCC(myFish)) myFish.stunTimer = 0;

  const eff = getEffectiveStats();
  if (myFish.hp > eff.maxHp) myFish.hp = eff.maxHp;

  const ev = getActiveEventConfig();
  const desiredFood = Math.round(BASE_FOOD_COUNT * (ev?.modifiers?.foodMult || 1));
  while (foods.length < desiredFood) foods.push(spawnFood());
  if (foods.length > desiredFood + 30) foods.length = desiredFood;

  if (biteHold && myFish.biteCooldown <= 0 && myFish.stunTimer <= 0 && !myFish.knockbackFly) performBite();

  let moveFactor = 0;
  if (myFish.knockbackFly) {
    const kf = myFish.knockbackFly; kf.progress += dt / kf.duration;
    if (kf.progress >= 1) { myFish.x = kf.targetX; myFish.y = kf.targetY; myFish.knockbackFly = null; }
    else {
      const ease = 1 - Math.pow(1 - kf.progress, 2);
      myFish.x = kf.startX + (kf.targetX - kf.startX) * ease;
      myFish.y = kf.startY + (kf.targetY - kf.startY) * ease - Math.sin(kf.progress * Math.PI) * 90;
      myFish.angle += dt * 14;
    }
  } else {
    if (myFish.stunTimer > 0) moveFactor = 0;
    else if (input.inputMode === "touch") {
      if (input.joystick.active) { myFish.angle = input.joystick.angle; moveFactor = input.joystick.power; }
      else if (myFish.dashTimer > 0 || myFish.rollTimer > 0) moveFactor = 1;
    } else {
      const dx = input.mousePos.x - renderer.logicalW / 2, dy = input.mousePos.y - renderer.logicalH / 2;
      myFish.angle = Math.atan2(dy, dx);
      moveFactor = (myFish.rollTimer > 0) ? 1 : Math.min(1, Math.hypot(dx, dy) / 60);
    }
    const curSpeed = eff.speed * (myFish.dashTimer > 0 ? 2.15 : 1.0);
    myFish.x = Math.max(40, Math.min(MAP_SIZE - 40, myFish.x + Math.cos(myFish.angle) * curSpeed * moveFactor * dt));
    myFish.y = Math.max(40, Math.min(MAP_SIZE - 40, myFish.y + Math.sin(myFish.angle) * curSpeed * moveFactor * dt));
  }

  // ===== CẬP NHẬT SKILL CUỐI HỦY DIỆT (CẤP 40) =====
  if (myFish.ultFinisher) {
    const uf = myFish.ultFinisher;
    uf.timer -= dt;
    const viewScale = Math.min(1.0, Math.max(0.56, Math.min(renderer.logicalW, renderer.logicalH) / 760));
    const viewR = (Math.max(renderer.logicalW, renderer.logicalH) / 2) / viewScale;

    if (uf.type === "swordStorm") {
      // Vạn Kiếm Trảm Không: Kiếm chém liên tục khắp màn hình trong 2s!
      uf.tickCd -= dt;
      if (uf.tickCd <= 0) {
        uf.tickCd = 0.2;
        for (let s = 0; s < 5; s++) {
          screenSlashes.push({
            x: camera.x + (Math.random() - 0.5) * viewR * 1.8,
            y: camera.y + (Math.random() - 0.5) * viewR * 1.2,
            angle: (Math.random() - 0.5) * Math.PI,
            len: 220 + Math.random() * 260, life: 0.25, maxLife: 0.25
          });
        }
        dealAoEDamage(camera.x, camera.y, viewR, uf.dmgPerTick);
      }
    } else if (uf.type === "turtleBarrier") {
      // Thái Cổ Kết Giới: Đẩy toàn bộ địch ra ngoài kết giới + gây ST lớn nếu chạm thành!
      const nowB = Date.now(), bRad = uf.radius;
      const pushOut = (tx, ty, id, applyDmg) => {
        const d = Math.hypot(tx - myFish.x, ty - myFish.y);
        if (d < bRad + 28) {
          const ang = Math.atan2(ty - myFish.y, tx - myFish.x);
          if (nowB >= (barrierHitCd[id] || 0)) {
            barrierHitCd[id] = nowB + 450;
            applyDmg(ang);
          }
          return { nx: myFish.x + Math.cos(ang) * (bRad + 35), ny: myFish.y + Math.sin(ang) * (bRad + 35) };
        }
        return null;
      };
      aiFishes.forEach(ai => {
        const res = pushOut(ai.x, ai.y, ai.id, () => damageAiFish(ai, uf.dmg, false, ai.x, ai.y));
        if (res) { ai.x = Math.max(80, Math.min(MAP_SIZE - 80, res.nx)); ai.y = Math.max(80, Math.min(MAP_SIZE - 80, res.ny)); }
      });
      Object.values(remotePlayers).forEach(p => {
        pushOut(p.x, p.y, p.uid, (ang) => {
          svc.pushPvpHit(p.uid, { fromUid: myFish.uid, fromName: myFish.name, dmg: Math.round(uf.dmg), crit: false, isReflectFx: false, knockbackX: Math.round(Math.cos(ang) * 180), knockbackY: Math.round(Math.sin(ang) * 180) });
        });
      });
      Object.values(bossesState).forEach(b => {
        if (b?.alive) pushOut(b.x, b.y, b.id, () => damageBoss(b.id, uf.dmg, false, b.x, b.y - 50));
      });
    } else if (uf.type === "kingJudgement") {
      // Hải Vương Phán Quyết: Giáng cột sét Long Ấn lên toàn bộ địch trong tầm nhìn + Hút máu 25%!
      uf.tickCd -= dt;
      if (uf.tickCd <= 0) {
        uf.tickCd = 0.45;
        let totalDealt = 0;
        aiFishes.forEach(ai => {
          if (Math.hypot(ai.x - myFish.x, ai.y - myFish.y) <= viewR) {
            ai.slowTimer = 1.5;
            judgmentPillars.push({ x: ai.x, y: ai.y, life: 0.35, maxLife: 0.35 });
            damageAiFish(ai, uf.dmgPerTick, false, ai.x, ai.y);
            totalDealt += uf.dmgPerTick;
          }
        });
        Object.values(remotePlayers).forEach(p => {
          if (Math.hypot(p.x - myFish.x, p.y - myFish.y) <= viewR) {
            judgmentPillars.push({ x: p.x, y: p.y, life: 0.35, maxLife: 0.35 });
            svc.pushPvpHit(p.uid, { fromUid: myFish.uid, fromName: myFish.name, dmg: Math.round(uf.dmgPerTick), crit: true, isReflectFx: false, stun: 0.4 });
            totalDealt += uf.dmgPerTick;
          }
        });
        Object.values(bossesState).forEach(b => {
          if (b?.alive && Math.hypot(b.x - myFish.x, b.y - myFish.y) <= viewR) {
            judgmentPillars.push({ x: b.x, y: b.y, life: 0.35, maxLife: 0.35 });
            damageBoss(b.id, uf.dmgPerTick, false, b.x, b.y - 50);
            totalDealt += uf.dmgPerTick;
          }
        });
        if (totalDealt > 0 && myFish.hp < eff.maxHp) {
          const heal = Math.min(eff.maxHp - myFish.hp, Math.round(totalDealt * uf.lifesteal));
          if (heal > 0) { myFish.hp += heal; addFloatingText(myFish.x, myFish.y - 35, `+${heal} HP`, "#51cf66", 1.1); }
        }
      }
    }
    if (uf.timer <= 0) myFish.ultFinisher = null;
  }

  // Rùa Lăn Mai Đột Kích (Cấp 20): húc văng & gây ST kẻ địch chạm phải
  if (myFish.rollTimer > 0) {
    const nowR = Date.now(), rMy = getFishRadius(myFish.level, myFish.tier, myFish.sizeMult) + 25;
    aiFishes.forEach(ai => {
      if (nowR >= (rollHitCd[ai.id] || 0) && Math.hypot(ai.x - myFish.x, ai.y - myFish.y) < rMy + getFishRadius(ai.level, ai.tier, 1)) {
        rollHitCd[ai.id] = nowR + 400;
        damageAiFish(ai, myFish.rollDmg, false, ai.x, ai.y);
      }
    });
    Object.values(bossesState).forEach(b => {
      if (b?.alive && nowR >= (rollHitCd[b.id] || 0) && Math.hypot(b.x - myFish.x, b.y - myFish.y) < rMy + 75) {
        rollHitCd[b.id] = nowR + 450;
        damageBoss(b.id, myFish.rollDmg, false, b.x, b.y - 50);
      }
    });
  }

  // Cận Vệ Hoàng Kim của Cá Vua (Cấp 20): xoay quanh & tự cắn kẻ địch gần
  const tNow = performance.now() / 1000;
  for (let i = myFish.kingGuards.length - 1; i >= 0; i--) {
    const g = myFish.kingGuards[i];
    g.timer -= dt; if (g.hitCd > 0) g.hitCd -= dt;
    if (g.timer <= 0) { myFish.kingGuards.splice(i, 1); continue; }
    if (g.hitCd <= 0) {
      const gx = myFish.x + Math.cos(tNow * 3.5 + g.angleOffset) * 125;
      const gy = myFish.y + Math.sin(tNow * 3.5 + g.angleOffset) * 125;
      let attacked = false;
      for (const ai of aiFishes) {
        if (Math.hypot(ai.x - gx, ai.y - gy) < 90) { damageAiFish(ai, g.dmg, false, ai.x, ai.y); g.hitCd = 0.55; attacked = true; break; }
      }
      if (!attacked) {
        for (const b of Object.values(bossesState)) {
          if (b?.alive && Math.hypot(b.x - gx, b.y - gy) < 120) { damageBoss(b.id, g.dmg, false, b.x, b.y - 50); g.hitCd = 0.55; break; }
        }
      }
    }
  }

  if ((myFish.tempBuffs.poison || 0) > 0 && moveFactor > 0.1 && !myFish.knockbackFly) {
    poisonDropTimer -= dt;
    if (poisonDropTimer <= 0) {
      poisonDropTimer = 0.22;
      poisonClouds.push({ x: myFish.x, y: myFish.y, radius: 42 + getFishRadius(myFish.level, myFish.tier, myFish.sizeMult) * 0.45, life: 5.0, maxLife: 5.0 });
    }
  }

  const specCfg = getFishSpecialSkill(myFish.species);
  if (myFish.ultTimer > 0 && specCfg?.leaveAfterimage && moveFactor > 0.15) {
    afterimageTimer -= dt;
    if (afterimageTimer <= 0) {
      afterimageTimer = 0.045;
      afterimages.push({ x: myFish.x, y: myFish.y, angle: myFish.angle, level: myFish.level, tier: myFish.tier, sizeMult: myFish.sizeMult, species: myFish.species, life: 0.28, maxLife: 0.28 });
    }
  }

  camera.x += (myFish.x - camera.x) * 0.14;
  camera.y += (myFish.y - camera.y) * 0.14;

  const myR = getFishRadius(myFish.level, myFish.tier, myFish.sizeMult);
  const eatR = (myR + 24) * myFish.eatRangeBonus * eff.eatRangeMult;

  for (let i = foods.length - 1; i >= 0; i--) {
    const f = foods[i];
    if (Math.abs(f.x - myFish.x) > eatR || Math.abs(f.y - myFish.y) > eatR) continue;
    const d = Math.hypot(f.x - myFish.x, f.y - myFish.y);
    if (d < eatR) {
      if (d > myR) { f.x += (myFish.x - f.x) * 0.25; f.y += (myFish.y - f.y) * 0.25; }
      else {
        gainExp(f.val); sessionStats.foodEaten++;
        if (myFish.healOnFood > 0 && myFish.hp < eff.maxHp) {
          const h = Math.min(myFish.healOnFood, eff.maxHp - myFish.hp); myFish.hp += h;
          addFloatingText(myFish.x, myFish.y - 25, `+${Math.round(h)} HP`, "#51cf66", 0.85);
        }
        foods.splice(i, 1);
        if (foods.length < desiredFood) foods.push(spawnFood());
      }
    }
  }

  for (let i = mapItems.length - 1; i >= 0; i--) {
    const it = mapItems[i];
    if (Math.hypot(it.x - myFish.x, it.y - myFish.y) < myR + 22) {
      activateMapItem(it); mapItems.splice(i, 1);
      setTimeout(() => { if (inGame && mapItems.length < MAP_ITEM_COUNT) mapItems.push(spawnMapItem()); }, MAP_ITEM_RESPAWN_MS);
    }
  }

  for (let i = poisonClouds.length - 1; i >= 0; i--) { poisonClouds[i].life -= dt; if (poisonClouds[i].life <= 0) poisonClouds.splice(i, 1); }

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
    let stop = false;
    const pRad = pr.radius || 14;
    aiFishes.forEach(ai => {
      if (stop || (pr.hitIds && pr.hitIds.has(ai.id))) return;
      if (Math.hypot(ai.x - pr.x, ai.y - pr.y) < getFishRadius(ai.level, ai.tier, 1) + pRad) {
        if (pr.hitIds) pr.hitIds.add(ai.id);
        const isBack = pr.backCrit && Math.cos(ai.angle - (pr.angle || 0)) > 0.25;
        damageAiFish(ai, isBack ? pr.dmg * 2 : pr.dmg, isBack, ai.x, ai.y);
        if (!pr.piercing) stop = true;
      }
    });
    if (!stop) {
      for (const b of Object.values(bossesState)) {
        if (b?.alive && !(pr.hitIds && pr.hitIds.has(b.id)) && Math.hypot(b.x - pr.x, b.y - pr.y) < 90 + pRad) {
          if (pr.hitIds) pr.hitIds.add(b.id);
          damageBoss(b.id, pr.dmg, false, b.x, b.y - 50);
          if (!pr.piercing) { stop = true; break; }
        }
      }
    }
    if (stop || pr.life <= 0) projectiles.splice(i, 1);
  }

  const domRadius = myFish.ultTimer > 0 ? (specCfg?.domainRadius || 0) : 0;
  const domKeep = 1 - (specCfg?.domainDebuff || 0.4);
  const wallMargin = 280;

  aiFishes.forEach(ai => {
    if (ai.biteCooldown > 0) ai.biteCooldown -= dt;
    if (ai.poisonTickCd > 0) ai.poisonTickCd -= dt;
    if (ai.stunTimer > 0) ai.stunTimer = Math.max(0, ai.stunTimer - dt);
    if (ai.slowTimer > 0) ai.slowTimer = Math.max(0, ai.slowTimer - dt);
    ai.aiTimer -= dt;

    if (ai.stunTimer <= 0) {
      let steerX = 0, steerY = 0;
      if (ai.x < wallMargin) steerX += (wallMargin - ai.x) / wallMargin;
      else if (ai.x > MAP_SIZE - wallMargin) steerX -= (ai.x - (MAP_SIZE - wallMargin)) / wallMargin;
      if (ai.y < wallMargin) steerY += (wallMargin - ai.y) / wallMargin;
      else if (ai.y > MAP_SIZE - wallMargin) steerY -= (ai.y - (MAP_SIZE - wallMargin)) / wallMargin;

      if (steerX !== 0 || steerY !== 0) ai.targetAngle = Math.atan2(steerY, steerX);
      else if (ai.aiTimer <= 0) { ai.aiTimer = 1.8 + Math.random() * 2.5; ai.targetAngle += (Math.random() - 0.5) * 1.4; }
      ai.angle = lerpAngle(ai.angle, ai.targetAngle, dt * 3.2);

      ai.suppressed = domRadius > 0 && Math.hypot(ai.x - myFish.x, ai.y - myFish.y) <= domRadius;
      const sp = ai.speed * (ai.suppressed ? domKeep : 1) * (ai.slowTimer > 0 ? 0.5 : 1);
      ai.x = Math.max(80, Math.min(MAP_SIZE - 80, ai.x + Math.cos(ai.angle) * sp * dt));
      ai.y = Math.max(80, Math.min(MAP_SIZE - 80, ai.y + Math.sin(ai.angle) * sp * dt));
    }

    if (ai.poisonTickCd <= 0 && poisonClouds.some(pc => Math.hypot(pc.x - ai.x, pc.y - ai.y) <= pc.radius + 16)) {
      ai.poisonTickCd = 0.5;
      damageAiFish(ai, Math.max(8, eff.dmg * 0.45), false, ai.x, ai.y);
    }

    if (ai.stunTimer <= 0 && Math.hypot(ai.x - myFish.x, ai.y - myFish.y) < myR + getFishRadius(ai.level, ai.tier, 1) && ai.biteCooldown <= 0) {
      ai.biteCooldown = 0.75;
      const raw = ai.dmg * (ai.suppressed ? domKeep : 1);
      applyDamageToMe(raw, ai.name, 0, (refDmg) => {
        reflectEffects.push({ x: ai.x, y: ai.y, life: 0.35, maxLife: 0.35 });
        damageAiFish(ai, refDmg, false, ai.x, ai.y);
      });
    }
  });

  if (poisonClouds.length > 0) {
    const nowP = Date.now();
    Object.values(remotePlayers).forEach(p => {
      if (nowP >= (pvpPoisonTick[p.uid] || 0) && poisonClouds.some(pc => Math.hypot(pc.x - p.x, pc.y - p.y) <= pc.radius + 18)) {
        pvpPoisonTick[p.uid] = nowP + 600;
        svc.pushPvpHit(p.uid, { fromUid: myFish.uid, fromName: myFish.name, dmg: Math.max(8, Math.round(eff.dmg * 0.4)), crit: false, isReflectFx: false });
      }
    });
  }

  const nowMs = Date.now();
  Object.values(bossesState).forEach(b => {
    if (!b?.alive) return;
    const bossR = getFishRadius(b.level || 10, b.tier || 2, 1.35);
    const dist = Math.hypot(b.x - myFish.x, b.y - myFish.y);
    const bossSup = domRadius > 0 && dist <= domRadius;

    if (poisonClouds.length > 0 && nowMs >= (bossPoisonTick[b.id] || 0)) {
      if (poisonClouds.some(pc => Math.hypot(pc.x - b.x, pc.y - b.y) <= pc.radius + bossR)) {
        bossPoisonTick[b.id] = nowMs + 600;
        damageBoss(b.id, Math.max(10, eff.dmg * 0.45), false, b.x, b.y - 50);
      }
    }

    const isHungry = (b.hungryUntil || 0) > nowMs, isAbs = (b.absUntil || 0) > nowMs, hungryMult = isHungry ? 1.5 : 1.0;

    if ((b.vortexUntil || 0) > nowMs && dist <= BOSS_VORTEX_RADIUS + myR) {
      if (lastVortexHitAt[b.id] !== b.vortexStartedAt) { lastVortexHitAt[b.id] = b.vortexStartedAt; applyStunToMe(5.0); }
    }

    const meleeRange = (bossR + myR + 28) * hungryMult;
    if (dist <= meleeRange && nowMs >= (bossMeleeCooldown[b.id] || 0)) {
      bossMeleeCooldown[b.id] = nowMs + 1150;
      const rawDmg = b.dmg * (isAbs ? 1.5 : 1.0) * (bossSup ? domKeep : 1.0);
      const didDeal = applyDamageToMe(rawDmg, b.name, isAbs ? 2.5 : 0, (refDmg) => {
        reflectEffects.push({ x: b.x, y: b.y, life: 0.35, maxLife: 0.35 });
        damageBoss(b.id, refDmg, false, b.x, b.y - 50);
      });
      if (didDeal) svc.notifyBossDealtDamage(b.id);
    }

    if (b.rangedStrike && nowMs >= b.rangedStrike.triggerAt && nowMs <= b.rangedStrike.expiresAt && !handledTornadoIds.has(b.rangedStrike.id)) {
      handledTornadoIds.add(b.rangedStrike.id);
      if (Math.hypot(b.rangedStrike.x - myFish.x, b.rangedStrike.y - myFish.y) <= b.rangedStrike.radius + myR) {
        const didDeal = applyDamageToMe(b.rangedStrike.dmg * (bossSup ? domKeep : 1.0), `${b.name} (Lốc xoáy)`, b.rangedStrike.stun || 0, (refDmg) => {
          reflectEffects.push({ x: b.x, y: b.y, life: 0.35, maxLife: 0.35 });
          damageBoss(b.id, refDmg, false, b.x, b.y - 50);
        });
        if (didDeal) svc.notifyBossDealtDamage(b.id);
      }
    }
  });

  [biteEffects, reflectEffects, afterimages, visualRings, screenSlashes, judgmentPillars].forEach(arr => {
    for (let i = arr.length - 1; i >= 0; i--) { arr[i].life -= dt; if (arr[i].life <= 0) arr.splice(i, 1); }
  });
  bubbles.forEach(b => { b.y -= b.v * dt; if (b.y < 0) b.y = MAP_SIZE; });
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    floatingTexts[i].y -= 35 * dt; floatingTexts[i].life -= dt;
    if (floatingTexts[i].life <= 0) floatingTexts.splice(i, 1);
  }
}

// ==================== HUD & EXIT ====================
function getTop1Uid() {
  const all = [myFish, ...Object.values(remotePlayers)].filter(Boolean);
  all.sort((a, b) => (b.score || 0) - (a.score || 0));
  return all[0]?.uid;
}

function updateHUD(eff) {
  if (!myFish) return;
  const evo = EVO_TIERS[Math.min(EVO_TIERS.length - 1, myFish.tier - 1)];
  document.getElementById("hud-evo-info").textContent = `Cấp ${myFish.level} • Dạng ${myFish.tier}: ${evo.name} (${Math.round(myFish.score)} đ)`;
  document.getElementById("hud-hp-fill").style.width = `${Math.max(0, Math.min(100, (myFish.hp / eff.maxHp) * 100))}%`;
  document.getElementById("hud-hp-text").textContent = `${Math.ceil(myFish.hp)} / ${eff.maxHp}`;
  document.getElementById("hud-exp-fill").style.width = `${Math.min(100, (myFish.exp / myFish.expNeed) * 100)}%`;
  document.getElementById("hud-exp-text").textContent = `EXP: ${Math.floor(myFish.exp)} / ${myFish.expNeed}`;

  // Thông báo điểm nâng cấp Skill
  const spBanner = document.getElementById("skill-points-banner");
  if (myFish.skillPoints > 0) {
    document.getElementById("sp-count").textContent = myFish.skillPoints;
    spBanner.classList.remove("hidden");
  } else spBanner.classList.add("hidden");

  // Cập nhật trạng thái 5 Ô Kỹ Năng (PC + Mobile + Nút nâng cấp +)
  const skills = getFishConfig(myFish.species).skills;
  skills.forEach((sk, idx) => {
    const unlocked = myFish.level >= sk.unlockLevel;
    const cd = myFish.skillCooldowns[idx];
    const skLv = myFish.skillLevels[idx];
    const isSpecActive = sk.isSpecial && myFish.ultTimer > 0;
    const isFinActive = sk.isUltimate && !!myFish.ultFinisher;

    const pcEl = document.getElementById(`pc-sk-${idx}`);
    const ovEl = document.getElementById(`pc-sk-ov-${idx}`);
    const lvEl = document.getElementById(`pc-sk-lv-${idx}`);
    const upgBtn = document.getElementById(`upg-sk-${idx}`);
    const mobEl = document.getElementById(`mob-sk-${idx}`);
    const mobCd = document.getElementById(`mob-sk-cd-${idx}`);

    if (lvEl) lvEl.textContent = unlocked ? `Lv.${skLv}/${MAX_SKILL_LEVEL}` : `Cấp ${sk.unlockLevel}`;
    if (upgBtn) upgBtn.classList.toggle("hidden", !(unlocked && myFish.skillPoints > 0 && skLv < MAX_SKILL_LEVEL));

    if (pcEl && ovEl) {
      pcEl.classList.toggle("locked", !unlocked);
      pcEl.classList.toggle("active-skill", isSpecActive || isFinActive);
      if (!unlocked) { ovEl.style.opacity = "1"; ovEl.textContent = `🔒 Cấp ${sk.unlockLevel}`; }
      else if (isSpecActive) { ovEl.style.opacity = "1"; ovEl.style.background = "rgba(217,119,6,0.55)"; ovEl.textContent = `⚡${myFish.ultTimer.toFixed(0)}s`; }
      else if (isFinActive) { ovEl.style.opacity = "1"; ovEl.style.background = "rgba(126,34,206,0.6)"; ovEl.textContent = `💥${myFish.ultFinisher.timer.toFixed(1)}s`; }
      else if (cd > 0) { ovEl.style.opacity = "1"; ovEl.style.background = "rgba(0,0,0,0.75)"; ovEl.textContent = `${cd.toFixed(1)}s`; }
      else { ovEl.style.opacity = "0"; }
    }

    if (mobEl && mobCd) {
      mobEl.classList.toggle("locked", !unlocked);
      if (!unlocked) { mobCd.style.opacity = "1"; mobCd.textContent = `🔒${sk.unlockLevel}`; }
      else if (isSpecActive) { mobCd.style.opacity = "1"; mobCd.textContent = `⚡${myFish.ultTimer.toFixed(0)}s`; }
      else if (isFinActive) { mobCd.style.opacity = "1"; mobCd.textContent = `💥${myFish.ultFinisher.timer.toFixed(1)}s`; }
      else if (cd > 0) { mobCd.style.opacity = "1"; mobCd.textContent = `${cd.toFixed(0)}s`; }
      else { mobCd.style.opacity = "0"; }
    }
  });

  const permHtml = Object.entries(myFish.buffCounts).map(([bid, cnt]) => { const b = getBuffConfig(bid); return b ? `<div class="buff-badge">${b.icon} <span class="cnt">x${cnt}</span></div>` : ""; }).join("");
  const tempHtml = Object.entries(myFish.tempBuffs).map(([tid, sec]) => { const it = getMapItemConfig(tid); return it ? `<div class="buff-badge" style="border-color:${it.color}">${it.icon} <span class="cnt">${Math.ceil(sec)}s</span></div>` : ""; }).join("");
  document.getElementById("active-buffs-bar").innerHTML = permHtml + tempHtml;

  const all = [myFish, ...Object.values(remotePlayers)].filter(Boolean).sort((a, b) => (b.score || 0) - (a.score || 0));
  document.getElementById("ingame-leaderboard").innerHTML = all.slice(0, 5).map((p, i) => `<div class="lb-row ${p.uid === myFish.uid ? "me" : ""}"><span>${i === 0 ? "👑" : `${i + 1}.`} ${escapeHtml(p.name)}</span><span>${Math.round(p.score || 0)}</span></div>`).join("");

  document.getElementById("boss-status-list").innerHTML = BOSS_SPAWNS.map((sp, i) => {
    const b = bossesState[sp.id];
    if (!b) return `<div class="boss-row"><span>Boss ${i + 1}</span><span>...</span></div>`;
    if (b.alive) return `<div class="boss-row"><span>👹 ${sp.name}</span><span>${Math.round(b.hp)} HP</span></div>`;
    return `<div class="boss-row respawning"><span>⏳ ${sp.name}</span><span>${Math.max(0, Math.ceil((b.respawnAt - Date.now()) / 1000))}s</span></div>`;
  }).join("");

  const evBanner = document.getElementById("event-banner"), ev = getActiveEventConfig();
  if (ev) {
    document.getElementById("event-title").textContent = `${ev.title} (${Math.max(0, Math.ceil((eventState.endsAt - Date.now()) / 1000))}s)`;
    document.getElementById("event-desc").textContent = ev.desc;
    evBanner.classList.remove("hidden");
  } else evBanner.classList.add("hidden");
}

document.getElementById("btn-menu-exit").addEventListener("click", () => { biteHold = false; input.resetJoystick(); document.getElementById("exit-modal").classList.remove("hidden"); });
document.getElementById("btn-resume").addEventListener("click", () => document.getElementById("exit-modal").classList.add("hidden"));
document.getElementById("btn-confirm-exit").addEventListener("click", () => finishMatch(false, ""));
document.getElementById("btn-back-lobby").addEventListener("click", () => { document.getElementById("death-modal").classList.add("hidden"); renderLobby(); showScreen("lobby"); });

async function finishMatch(isDead, reason) {
  if (!inGame) return;
  inGame = false; biteHold = false; input.resetJoystick();
  cancelAnimationFrame(animFrameId);
  if (syncIntervalId) clearInterval(syncIntervalId);
  await svc.leaveGameRoom(currentUser?.uid);
  await ensureDailyQuestReset(false);

  const score = myFish ? Math.round(myFish.score) : 0;
  const totalCoins = sessionStats.coinsEarned + Math.floor(score / 150);
  userData.coins += totalCoins;
  userData.bestScore = Math.max(userData.bestScore || 0, score);
  userData.quests.foodEaten += sessionStats.foodEaten;
  userData.quests.fishKilled += sessionStats.fishKilled;
  userData.quests.bossKilled += sessionStats.bossKilled;
  userData.quests.reachedTier2 = Math.max(userData.quests.reachedTier2 || 0, sessionStats.reachedTier2);
  userData.quests.gamesPlayed += 1;
  await svc.saveUserProfile(currentUser.uid, userData);

  if (isDead) {
    document.getElementById("death-title").textContent = "💀 BẠN ĐÃ TỬ VONG!";
    document.getElementById("death-summary").innerHTML = `<div>${escapeHtml(reason)}</div><div>Cấp đạt được: <b>Cấp ${myFish.level}</b> • Điểm: <b>${score}</b></div><div>Cá đã nuốt: <b>${sessionStats.fishKilled}</b> • Mồi đã ăn: <b>${sessionStats.foodEaten}</b></div><div>Coin nhận được: <b style="color:#ffd43b">+${totalCoins} Coin</b></div>`;
    document.getElementById("death-modal").classList.remove("hidden");
  } else { await renderLobby(); showScreen("lobby"); }
}

function addFloatingText(x, y, text, color, scale = 1) { floatingTexts.push({ x, y, text, color, scale, life: 1.0 }); }
function addToast(msg) { const d = document.createElement("div"); d.className = "toast"; d.textContent = msg; document.getElementById("toast-container").appendChild(d); setTimeout(() => d.remove(), 3500); }
function escapeHtml(str) { return String(str).replace(/[&<>"']/g, s => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s])); }