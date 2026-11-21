import { DOMAIN_RADIUS } from "./config.js";

// ==================== REGISTRY CÁC LOÀI CÁ ====================
export const FISH_REGISTRY = {
  swordfish: {
    id: "swordfish", name: "Cá Kiếm", icon: "🗡️", cost: 0,
    visual: { color: "#1d6fa5", midColor: "#38bdf8", bellyColor: "#e2f1ff", accent: "#7dd3fc", finGlow: "#bae6fd" },
    stats: { dmgMult: 1.20, speedMult: 1.0, dmgTakenMult: 1.0, healOnFood: 1, healOnKill: 0 },
    skill: {
      name: "Kiếm Đâm", cd: 5.0,
      execute(ctx) {
        ctx.fish.dashTimer = 0.45;
        ctx.addFloatingText(ctx.fish.x, ctx.fish.y - 35, "🗡️ KIẾM ĐÂM!", "#38bdf8");
        ctx.dealAoEDamage(ctx.fish.x + Math.cos(ctx.fish.angle) * 70, ctx.fish.y + Math.sin(ctx.fish.angle) * 70, 110, ctx.effStats.dmg * 1.8 * ctx.fish.skillDmgMult);
      }
    },
    ultimate: { name: "Lưỡi Kiếm Tinh Xảo", duration: 10, modifiers: { dmgTakenMult: 0.5, dmgMult: 1.5, biteRangeMult: 1.5 }, biteEffectType: "swordSlash" },
    desc: "ST +20%, hồi 1 HP khi ăn mồi. Đặc biệt: Lưỡi kiếm tinh xảo (+50% tầm cắn & ST, chém đứt)."
  },
  turtle: {
    id: "turtle", name: "Rùa Biển", icon: "🐢", cost: 0,
    visual: { color: "#2b8a3e", midColor: "#51cf66", bellyColor: "#d8f5a2", accent: "#a9e34b", finGlow: "#94d82d" },
    stats: { dmgMult: 1.0, speedMult: 0.95, dmgTakenMult: 0.80, healOnFood: 1, healOnKill: 0 },
    skill: {
      name: "Mai Bất Tử", cd: 7.0,
      execute(ctx) {
        ctx.fish.shieldTimer = 3.0; ctx.fish.reflectTimer = 3.0;
        ctx.addFloatingText(ctx.fish.x, ctx.fish.y - 35, "🛡️ MAI BẤT TỬ!", "#51cf66");
      }
    },
    ultimate: { name: "Phòng Ngự Tuyệt Đối", duration: 10, modifiers: { dmgTakenMult: 0 }, reflectRate: 1.0, shieldVisual: "honeycomb" },
    desc: "Giảm 20% ST nhận, hồi 1 HP khi ăn mồi. Đặc biệt: Miễn nhiễm ST, phản 100% ST."
  },
  butterfish: {
    id: "butterfish", name: "Cá Chim", icon: "🪽", cost: 0,
    visual: { color: "#be4bdb", midColor: "#f783ac", bellyColor: "#fff0f6", accent: "#fcc2d7", finGlow: "#eebefa" },
    stats: { dmgMult: 1.0, speedMult: 1.20, dmgTakenMult: 1.0, healOnFood: 1, healOnKill: 0 },
    skill: {
      name: "Lướt Sóng", cd: 4.5,
      execute(ctx) {
        ctx.fish.dashTimer = 0.65;
        ctx.spawnProjectile({ x: ctx.fish.x, y: ctx.fish.y, vx: Math.cos(ctx.fish.angle) * 650, vy: Math.sin(ctx.fish.angle) * 650, dmg: ctx.effStats.dmg * 1.8 * ctx.fish.skillDmgMult, life: 1.0, color: "#f783ac" });
        ctx.addFloatingText(ctx.fish.x, ctx.fish.y - 35, "🪽 LƯỚT SÓNG!", "#f783ac");
      }
    },
    ultimate: { name: "Tốc Độ Ánh Sáng", duration: 10, modifiers: { dmgTakenMult: 0.5, speedMult: 2.0 }, dodgeChance: 0.5, leaveAfterimage: true },
    desc: "Tốc độ +20%, hồi 1 HP khi ăn mồi. Đặc biệt: +100% tốc độ, 50% né ST, tạo lưu ảnh."
  },
  kingfish: {
    id: "kingfish", name: "Cá Của Vua", icon: "👑", cost: 100,
    visual: { color: "#c92a2a", midColor: "#f59f00", bellyColor: "#fff3bf", accent: "#ffe066", finGlow: "#ffd43b" },
    stats: { dmgMult: 1.15, speedMult: 1.15, dmgTakenMult: 0.85, healOnFood: 5, healOnKill: 5 },
    skill: {
      name: "Hoàng Uy", cd: 5.5,
      execute(ctx) {
        ctx.addFloatingText(ctx.fish.x, ctx.fish.y - 40, "👑 HOÀNG UY CHẤN ĐỘNG!", "#ffd43b");
        ctx.dealAoEDamage(ctx.fish.x, ctx.fish.y, 200, ctx.effStats.dmg * 1.8 * ctx.fish.skillDmgMult * 1.25);
      }
    },
    ultimate: { name: "Áp Chế Tuyệt Đối", duration: 10, modifiers: { dmgTakenMult: 0.5 }, domainRadius: DOMAIN_RADIUS, domainDebuff: 0.4, domainBuffPerEnemy: 0.1 },
    desc: "Giá 100 Coin/ván. ST+15%, Tốc+15%, Giảm ST 15%, Hồi 5HP. Đặc biệt: Lĩnh vực áp chế huyết mạch."
  }
};

// ==================== REGISTRY BUFF LÊN CẤP ====================
export const BUFF_REGISTRY = {
  eatRange: { id: "eatRange", icon: "🧲", name: "Hút Mồi", desc: "+25% khoảng cách ăn mồi", apply: (f) => { f.eatRangeBonus += 0.25; } },
  speed:    { id: "speed",    icon: "⚡", name: "Thủy Lưu", desc: "+12% tốc độ bơi", apply: (f) => { f.baseSpeed *= 1.12; } },
  maxHp:    { id: "maxHp",    icon: "❤️", name: "Sinh Mệnh", desc: "+25% Máu tối đa", apply: (f) => { const a = f.baseMaxHp * 0.25; f.baseMaxHp += a; f.hp += a; } },
  biteDmg:  { id: "biteDmg",  icon: "🦷", name: "Răng Sắc", desc: "+18% sát thương cắn", apply: (f) => { f.baseDmg *= 1.18; } },
  size:     { id: "size",     icon: "🐋", name: "Khổng Lồ", desc: "+12% kích cỡ & tầm cắn", apply: (f) => { f.sizeMult += 0.12; } },
  skillDmg: { id: "skillDmg", icon: "💥", name: "Cuồng Nộ", desc: "+25% sát thương Skill", apply: (f) => { f.skillDmgMult += 0.25; } },
  skillCd:  { id: "skillCd",  icon: "⏱️", name: "Linh Hoạt", desc: "-15% hồi chiêu Skill", apply: (f) => { f.skillCdMult *= 0.85; } }
};
  
// ==================== REGISTRY ITEM BUFF RẢI RÁC TRÊN MAP (15s) ====================
export const MAP_ITEM_REGISTRY = {
  speed:   { id: "speed",   name: "Siêu Tốc",    icon: "⚡",  imgKey: "item-speed",   color: "#facc15", weight: 1, timed: true,  modifiers: { speedMult: 1.2 } },
  magnet:  { id: "magnet",  name: "Thu Hút",     icon: "🧲",  imgKey: "item-magnet",  color: "#38bdf8", weight: 1, timed: true,  modifiers: { eatRangeMult: 1.2 } },
  exp:     { id: "exp",     name: "Kinh Nghiệm", icon: "✨",  imgKey: "item-exp",     color: "#a855f7", weight: 1, timed: true,  modifiers: { expMult: 1.3 }, fallbackText: "EXP" },
  poison:  { id: "poison",  name: "Rải Độc",     icon: "☠️",  imgKey: "item-poison",  color: "#22c55e", weight: 1, timed: true,  leavesPoison: true },
  luck:    { id: "luck",    name: "May Rủi",     icon: "🍀",  imgKey: "item-luck",    color: "#4ade80", weight: 1, timed: false },
  aoma:    { id: "aoma",    name: "Ảo Ma",       icon: "❓",  imgKey: "item-aoma",    color: "#e879f9", weight: 3, timed: false, fallbackText: "?" }, // Giữ nguyên tỉ lệ cao để troll
  ironman: { id: "ironman", name: "Iron Man",    icon: "🤖",  imgKey: "item-ironman", color: "#ef4444", weight: 1, timed: true,  modifiers: { dmgTakenMult: 0.7 }, ccImmune: true }
};

// ==================== REGISTRY SỰ KIỆN TOÀN BẢN ĐỒ ====================
export const EVENT_REGISTRY = {
  feast:     { id: "feast",     title: "🍖 ĐẠI TIỆC CỦA VUA CÁ", desc: "Lượng mồi trong Thủy Cung tăng thêm 50%!", modifiers: { foodMult: 1.5 } },
  blessing:  { id: "blessing",  title: "✨ PHÚC LỘC CỦA VUA CÁ", desc: "Kinh nghiệm (EXP) nhận được nhân đôi (x2)!", modifiers: { expMult: 2.0 } },
  migration: { id: "migration", title: "💨 BẦY CÁ DI CƯ", desc: "Tốc độ bơi toàn thủy cung tăng 50%!", modifiers: { speedMult: 1.5 } },
  predator:  { id: "predator",  title: "⚔️ CÁ SĂN MỒI", desc: "Sát thương gây ra tăng 30%!", modifiers: { dmgMult: 1.3 } },
  weakness:  { id: "weakness",  title: "🌀 CÁ SUY YẾU", desc: "Toàn bộ chỉ số cá bị giảm 20%!", modifiers: { speedMult: 0.8, dmgMult: 0.8, maxHpMult: 0.8 } }
};

export const getFishConfig = (id) => FISH_REGISTRY[id] || FISH_REGISTRY.swordfish;
export const getAllFishConfigs = () => Object.values(FISH_REGISTRY);
export const getBuffList = () => Object.values(BUFF_REGISTRY);
export const getBuffConfig = (id) => BUFF_REGISTRY[id];
export const getMapItemList = () => Object.values(MAP_ITEM_REGISTRY);
export const getMapItemConfig = (id) => MAP_ITEM_REGISTRY[id];
export const getEventList = () => Object.values(EVENT_REGISTRY);
export const getEventConfig = (id) => EVENT_REGISTRY[id] || null;