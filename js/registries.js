import { DOMAIN_RADIUS } from "./config.js";

// ==================== REGISTRY 4 LOÀI CÁ & 5 SKILL (1, 10, 20, 30, 40) ====================
export const FISH_REGISTRY = {
  swordfish: {
    id: "swordfish", name: "Cá Kiếm", icon: "🗡️", cost: 0,
    visual: { color: "#1d6fa5", midColor: "#38bdf8", bellyColor: "#e2f1ff", accent: "#7dd3fc", finGlow: "#bae6fd" },
    stats: { dmgMult: 1.20, speedMult: 1.0, dmgTakenMult: 1.0, healOnFood: 1, healOnKill: 0 },
    desc: "ST +20%, hồi 1 HP khi ăn mồi. Bộ 5 skill chém xuyên & Vạn Kiếm Trảm Không toàn màn hình.",
    skills: [
      {
        slot: 0, unlockLevel: 1, icon: "🗡️", name: "Kiếm Đâm", cd: 5.0,
        execute(ctx) {
          ctx.fish.dashTimer = 0.45;
          ctx.addFloatingText(ctx.fish.x, ctx.fish.y - 35, "🗡️ KIẾM ĐÂM!", "#38bdf8");
          ctx.dealAoEDamage(ctx.fish.x + Math.cos(ctx.fish.angle) * 75, ctx.fish.y + Math.sin(ctx.fish.angle) * 75, 115, ctx.skillDmg * 1.8);
        }
      },
      {
        slot: 1, unlockLevel: 10, icon: "⚔️", name: "Loạn Kiếm", cd: 7.5,
        execute(ctx) {
          ctx.addFloatingText(ctx.fish.x, ctx.fish.y - 38, "⚔️ LOẠN KIẾM LIÊN HOÀN!", "#7dd3fc");
          for (let i = 0; i < 3; i++) {
            setTimeout(() => {
              if (!ctx.isAlive()) return;
              const fx = ctx.fish.x + Math.cos(ctx.fish.angle) * 90;
              const fy = ctx.fish.y + Math.sin(ctx.fish.angle) * 90;
              ctx.spawnBiteEffect({ x: fx, y: fy, angle: ctx.fish.angle + (i - 1) * 0.25, radius: 115, life: 0.2, maxLife: 0.2, effectType: "swordSlash" });
              ctx.dealAoEDamage(fx, fy, 130, ctx.skillDmg * 0.95, { slowTimer: 2.0 });
            }, i * 190);
          }
        }
      },
      {
        slot: 2, unlockLevel: 20, icon: "🌙", name: "Kiếm Khí", cd: 8.5,
        execute(ctx) {
          ctx.addFloatingText(ctx.fish.x, ctx.fish.y - 38, "🌙 KIẾM KHÍ XUYÊN PHÁ!", "#bae6fd");
          ctx.spawnProjectile({
            x: ctx.fish.x, y: ctx.fish.y, angle: ctx.fish.angle,
            vx: Math.cos(ctx.fish.angle) * 760, vy: Math.sin(ctx.fish.angle) * 760,
            dmg: ctx.skillDmg * 2.2, life: 1.4, color: "#38bdf8",
            radius: 36, piercing: true, backCrit: true, spriteKey: "swordWave", hitIds: new Set()
          });
        }
      },
      {
        slot: 3, unlockLevel: 30, icon: "🔥", name: "Lưỡi Kiếm Tinh Xảo", cd: 18.0,
        isSpecial: true, duration: 10,
        modifiers: { dmgTakenMult: 0.5, dmgMult: 1.5, biteRangeMult: 1.5 },
        biteEffectType: "swordSlash",
        execute(ctx) { ctx.activateSpecialBuff(this); }
      },
      {
        slot: 4, unlockLevel: 40, icon: "🌌", name: "Vạn Kiếm Trảm", cd: 30.0,
        isUltimate: true, duration: 2.0,
        execute(ctx) {
          ctx.fish.ultFinisher = { type: "swordStorm", timer: 2.0, tickCd: 0, dmgPerTick: ctx.skillDmg * 1.4 };
          ctx.addToast("🌌 VẠN KIẾM TRẢM KHÔNG! Chém nát màn hình trong 2s!");
          ctx.addFloatingText(ctx.fish.x, ctx.fish.y - 52, "🌌 VẠN KIẾM TRẢM KHÔNG!", "#38bdf8", 1.35);
        }
      }
    ]
  },

  turtle: {
    id: "turtle", name: "Rùa Biển", icon: "🐢", cost: 0,
    visual: { color: "#2b8a3e", midColor: "#51cf66", bellyColor: "#d8f5a2", accent: "#a9e34b", finGlow: "#94d82d" },
    stats: { dmgMult: 1.0, speedMult: 0.95, dmgTakenMult: 0.80, healOnFood: 1, healOnKill: 0 },
    desc: "Giảm 20% ST nhận, hồi 1 HP khi ăn mồi. Bộ 5 skill đỡ đòn, phản sát thương & Thái Cổ Kết Giới.",
    skills: [
      {
        slot: 0, unlockLevel: 1, icon: "🛡️", name: "Mai Bất Tử", cd: 7.0,
        execute(ctx) {
          ctx.fish.shieldTimer = Math.max(ctx.fish.shieldTimer, 3.0);
          ctx.fish.reflectTimer = Math.max(ctx.fish.reflectTimer, 3.0);
          ctx.addFloatingText(ctx.fish.x, ctx.fish.y - 35, "🛡️ MAI BẤT TỬ!", "#51cf66");
        }
      },
      {
        slot: 1, unlockLevel: 10, icon: "🌋", name: "Chấn Động", cd: 9.0,
        execute(ctx) {
          ctx.addFloatingText(ctx.fish.x, ctx.fish.y - 38, "🌋 CHẤN ĐỘNG ĐÁY BIỂN!", "#facc15");
          ctx.spawnVisualRing({ x: ctx.fish.x, y: ctx.fish.y, radius: 240, life: 0.5, maxLife: 0.5, spriteKey: "turtleQuake", color: "#eab308" });
          ctx.dealAoEDamage(ctx.fish.x, ctx.fish.y, 240, ctx.skillDmg * 1.6, { stunTimer: 1.5, knockback: 90 });
        }
      },
      {
        slot: 2, unlockLevel: 20, icon: "🌀", name: "Lăn Mai", cd: 10.0,
        execute(ctx) {
          ctx.fish.rollTimer = 1.6;
          ctx.fish.rollDmg = ctx.skillDmg * 1.4;
          ctx.addFloatingText(ctx.fish.x, ctx.fish.y - 38, "🌀 LĂN MAI ĐỘT KÍCH!", "#a9e34b");
        }
      },
      {
        slot: 3, unlockLevel: 30, icon: "🔥", name: "Phòng Ngự Tuyệt Đối", cd: 21.0,
        isSpecial: true, duration: 10,
        modifiers: { dmgTakenMult: 0 }, reflectRate: 1.0, shieldVisual: "honeycomb",
        execute(ctx) { ctx.activateSpecialBuff(this); }
      },
      {
        slot: 4, unlockLevel: 40, icon: "🏵️", name: "Thái Cổ Kết Giới", cd: 32.0,
        isUltimate: true, duration: 5.0,
        execute(ctx) {
          ctx.fish.ultFinisher = { type: "turtleBarrier", timer: 5.0, radius: 420, dmg: ctx.skillDmg * 2.2 };
          ctx.addToast("🏵️ THÁI CỔ KẾT GIỚI! Đẩy bật & nghiền nát kẻ địch chạm vào!");
          ctx.addFloatingText(ctx.fish.x, ctx.fish.y - 52, "🏵️ THÁI CỔ KẾT GIỚI!", "#facc15", 1.35);
        }
      }
    ]
  },

  butterfish: {
    id: "butterfish", name: "Cá Chim", icon: "🪽", cost: 0,
    visual: { color: "#be4bdb", midColor: "#f783ac", bellyColor: "#fff0f6", accent: "#fcc2d7", finGlow: "#eebefa" },
    stats: { dmgMult: 1.0, speedMult: 1.20, dmgTakenMult: 1.0, healOnFood: 1, healOnKill: 0 },
    desc: "Tốc độ +20%, hồi 1 HP khi ăn mồi. Bộ 5 skill tốc độ tia chớp & Lưu Tinh lao xuyên tầm nhìn.",
    skills: [
      {
        slot: 0, unlockLevel: 1, icon: "🪽", name: "Lướt Sóng", cd: 4.5,
        execute(ctx) {
          ctx.fish.dashTimer = 0.65;
          ctx.spawnProjectile({
            x: ctx.fish.x, y: ctx.fish.y, angle: ctx.fish.angle,
            vx: Math.cos(ctx.fish.angle) * 680, vy: Math.sin(ctx.fish.angle) * 680,
            dmg: ctx.skillDmg * 1.8, life: 1.0, color: "#f783ac", radius: 14, spriteKey: "birdBolt"
          });
          ctx.addFloatingText(ctx.fish.x, ctx.fish.y - 35, "🪽 LƯỚT SÓNG!", "#f783ac");
        }
      },
      {
        slot: 1, unlockLevel: 10, icon: "🌧️", name: "Mưa Thủy Tiễn", cd: 7.0,
        execute(ctx) {
          ctx.addFloatingText(ctx.fish.x, ctx.fish.y - 38, "🌧️ MƯA THỦY TIỄN!", "#f472b6");
          for (let i = -2; i <= 2; i++) {
            const a = ctx.fish.angle + i * 0.16;
            ctx.spawnProjectile({
              x: ctx.fish.x, y: ctx.fish.y, angle: a,
              vx: Math.cos(a) * 720, vy: Math.sin(a) * 720,
              dmg: ctx.skillDmg * 1.0, life: 0.95, color: "#f472b6", radius: 14, spriteKey: "birdBolt"
            });
          }
        }
      },
      {
        slot: 2, unlockLevel: 20, icon: "🌪️", name: "Xoáy Tách Đàn", cd: 9.0,
        execute(ctx) {
          ctx.fish.dashTimer = 1.6;
          ctx.addFloatingText(ctx.fish.x, ctx.fish.y - 38, "🌪️ XOÁY GIÓ TÁCH ĐÀN!", "#e879f9");
          ctx.spawnVisualRing({ x: ctx.fish.x, y: ctx.fish.y, radius: 220, life: 0.4, maxLife: 0.4, color: "#f472b6" });
          ctx.dealAoEDamage(ctx.fish.x, ctx.fish.y, 220, ctx.skillDmg * 1.2, { knockback: 260 });
        }
      },
      {
        slot: 3, unlockLevel: 30, icon: "🔥", name: "Tốc Độ Ánh Sáng", cd: 15.0,
        isSpecial: true, duration: 10,
        modifiers: { dmgTakenMult: 0.5, speedMult: 2.0 }, dodgeChance: 0.5, leaveAfterimage: true,
        execute(ctx) { ctx.activateSpecialBuff(this); }
      },
      {
        slot: 4, unlockLevel: 40, icon: "☄️", name: "Lưu Tinh", cd: 28.0,
        isUltimate: true, duration: 6.0,
        execute(ctx) {
          ctx.fish.ultFinisher = { type: "birdMeteor", timer: 6.0, dmg: ctx.skillDmg * 2.5 };
          ctx.addToast("☄️ LƯU TINH HỦY DIỆT! Bấm Cắn để lao xuyên hết tầm nhìn!");
          ctx.addFloatingText(ctx.fish.x, ctx.fish.y - 52, "☄️ LƯU TINH HỦY DIỆT!", "#f472b6", 1.35);
        }
      }
    ]
  },

  kingfish: {
    id: "kingfish", name: "Cá Của Vua", icon: "👑", cost: 100,
    visual: { color: "#c92a2a", midColor: "#f59f00", bellyColor: "#fff3bf", accent: "#ffe066", finGlow: "#ffd43b" },
    stats: { dmgMult: 1.15, speedMult: 1.15, dmgTakenMult: 0.85, healOnFood: 5, healOnKill: 5 },
    desc: "Giá 100 Coin/ván. Hồi 5HP, Áp Chế Tuyệt Đối & Skill Cuối Hải Vương Phán Quyết giáng sét toàn màn hình.",
    skills: [
      {
        slot: 0, unlockLevel: 1, icon: "👑", name: "Hoàng Uy", cd: 5.5,
        execute(ctx) {
          ctx.addFloatingText(ctx.fish.x, ctx.fish.y - 40, "👑 HOÀNG UY CHẤN ĐỘNG!", "#ffd43b");
          ctx.spawnVisualRing({ x: ctx.fish.x, y: ctx.fish.y, radius: 200, life: 0.35, maxLife: 0.35, color: "#fbbf24" });
          ctx.dealAoEDamage(ctx.fish.x, ctx.fish.y, 200, ctx.skillDmg * 2.1);
        }
      },
      {
        slot: 1, unlockLevel: 10, icon: "🐉", name: "Long Ngâm", cd: 8.5,
        execute(ctx) {
          ctx.addFloatingText(ctx.fish.x, ctx.fish.y - 40, "🐉 LONG NGÂM!", "#fbbf24");
          const fx = ctx.fish.x + Math.cos(ctx.fish.angle) * 140;
          const fy = ctx.fish.y + Math.sin(ctx.fish.angle) * 140;
          ctx.spawnVisualRing({ x: fx, y: fy, radius: 180, life: 0.4, maxLife: 0.4, color: "#f97316" });
          ctx.dealAoEDamage(fx, fy, 180, ctx.skillDmg * 1.7, { stunTimer: 1.2 });
        }
      },
      {
        slot: 2, unlockLevel: 20, icon: "⚔️", name: "Cận Vệ", cd: 14.0,
        execute(ctx) {
          ctx.fish.kingGuards = [
            { angleOffset: 0, timer: 8.0, hitCd: 0, dmg: ctx.skillDmg * 0.9 },
            { angleOffset: Math.PI, timer: 8.0, hitCd: 0, dmg: ctx.skillDmg * 0.9 }
          ];
          ctx.addFloatingText(ctx.fish.x, ctx.fish.y - 42, "👑 TRIỆU HỒI CẬN VỆ!", "#fde047");
        }
      },
      {
        slot: 3, unlockLevel: 30, icon: "🔥", name: "Áp Chế Tuyệt Đối", cd: 18.0,
        isSpecial: true, duration: 10,
        modifiers: { dmgTakenMult: 0.5 }, domainRadius: DOMAIN_RADIUS, domainDebuff: 0.4, domainBuffPerEnemy: 0.1,
        execute(ctx) { ctx.activateSpecialBuff(this); }
      },
      {
        slot: 4, unlockLevel: 40, icon: "⚡", name: "Hải Vương Phán", cd: 32.0,
        isUltimate: true, duration: 3.0,
        execute(ctx) {
          ctx.fish.ultFinisher = { type: "kingJudgement", timer: 3.0, tickCd: 0, dmgPerTick: ctx.skillDmg * 1.9, lifesteal: 0.25 };
          ctx.addToast("⚡ HẢI VƯƠNG PHÁN QUYẾT! Giáng Long Ấn hủy diệt & hút máu toàn màn hình!");
          ctx.addFloatingText(ctx.fish.x, ctx.fish.y - 54, "⚡ HẢI VƯƠNG PHÁN QUYẾT!", "#fde047", 1.4);
        }
      }
    ]
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
  speed:   { id: "speed",   name: "Siêu Tốc",    icon: "⚡", imgKey: "item-speed",   color: "#facc15", weight: 1, timed: true,  modifiers: { speedMult: 1.2 } },
  magnet:  { id: "magnet",  name: "Thu Hút",     icon: "🧲", imgKey: "item-magnet",  color: "#38bdf8", weight: 1, timed: true,  modifiers: { eatRangeMult: 1.2 } },
  exp:     { id: "exp",     name: "Kinh Nghiệm", icon: "✨", imgKey: "item-exp",     color: "#a855f7", weight: 1, timed: true,  modifiers: { expMult: 1.3 }, fallbackText: "EXP" },
  poison:  { id: "poison",  name: "Rải Độc",     icon: "☠️", imgKey: "item-poison",  color: "#22c55e", weight: 1, timed: true,  leavesPoison: true },
  luck:    { id: "luck",    name: "May Rủi",     icon: "🍀", imgKey: "item-luck",    color: "#4ade80", weight: 1, timed: false },
  aoma:    { id: "aoma",    name: "Ảo Ma",       icon: "❓", imgKey: "item-aoma",    color: "#e879f9", weight: 3, timed: false, fallbackText: "?" },
  ironman: { id: "ironman", name: "Iron Man",    icon: "🤖", imgKey: "item-ironman", color: "#ef4444", weight: 1, timed: true,  modifiers: { dmgTakenMult: 0.7 }, ccImmune: true }
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
export const getFishSpecialSkill = (id) => getFishConfig(id).skills[3];
export const getAllFishConfigs = () => Object.values(FISH_REGISTRY);
export const getBuffList = () => Object.values(BUFF_REGISTRY);
export const getBuffConfig = (id) => BUFF_REGISTRY[id];
export const getMapItemList = () => Object.values(MAP_ITEM_REGISTRY);
export const getMapItemConfig = (id) => MAP_ITEM_REGISTRY[id];
export const getEventList = () => Object.values(EVENT_REGISTRY);
export const getEventConfig = (id) => EVENT_REGISTRY[id] || null;