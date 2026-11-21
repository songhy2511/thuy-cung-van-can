export const MAP_SIZE = 9600;
export const DOMAIN_RADIUS = 340;
export const BOSS_VISION_RADIUS = 620;
export const BOSS_RANGED_RANGE = 500;
export const BOSS_VORTEX_RADIUS = 230;
export const MAP_ITEM_DURATION = 15;
export const EVENT_INTERVAL_MS = 120000;

export const MAX_UPGRADE_LEVEL = 10;
export const MAX_SKILL_LEVEL = 5;
export const SKILL_UNLOCK_LEVELS = [1, 10, 20, 30, 40];
export const SKILL_KEYS = ["SPACE", "Q", "W", "E", "R"];

// Danh sách UID Admin (đã điền sẵn UID của bạn từ ảnh Firebase)
export const ADMIN_UIDS = [
  "uWcSrg5ZtmhBpBZ24Us13tr8dp82"
];

// Cấu hình mặc định (sẽ bị ghi đè tự động theo dữ liệu lưu trong Firebase config/global)
export const DEFAULT_SERVER_CONFIG = {
  foodCount: 3200,
  itemCount: 12,
  itemRespawnSec: 10,
  aomaWeight: 3,
  aiCount: 48,
  bossHpBase: 650,
  bossHpPerLevel: 75,
  bossDmgBase: 24,
  bossDmgPerLevel: 3.2,
  bossSpeed: 11.5,
  bossRespawnSec: 60,
  expGlobalMult: 1.0,
  reviveCost: 100,
  kingFishCost: 100,
  eventDurationSec: 30
};

// Object cấu hình sống (tự cập nhật thời gian thực cho toàn bộ game khi Admin chỉnh sửa)
export const LIVE_CONFIG = { ...DEFAULT_SERVER_CONFIG };

export function applyServerConfig(data) {
  Object.assign(LIVE_CONFIG, DEFAULT_SERVER_CONFIG, data || {});
}

export function calcExpNeedForLevel(level) {
  return Math.max(50, Math.round(50 * Math.pow(1.5, Math.max(0, level - 1))));
}

export const EVO_TIERS = [
  { tier: 1, name: "Cá Con Tập Sự", baseRadius: 22 },
  { tier: 2, name: "Chiến Ngư Thủy Cung", baseRadius: 31 },
  { tier: 3, name: "Thủy Quái Vạn Cân", baseRadius: 41 },
  { tier: 4, name: "Bá Chủ Biển Sâu", baseRadius: 52 },
  { tier: 5, name: "Thần Ngư Hải Vương", baseRadius: 65 }
];

export const BOSS_SPAWNS = [
  { id: "boss_0", name: "Boss Bắc Hải", x: 2500, y: 2500 },
  { id: "boss_1", name: "Boss Đông Hải", x: 7100, y: 3100 },
  { id: "boss_2", name: "Boss Nam Hải", x: 4800, y: 7100 }
];

export const UPGRADE_DEFS = [
  { key: "hp",         name: "Máu Khởi Đầu",    bonusText: "+20 HP / cấp",            baseCost: 100, stepCost: 80, maxLevel: MAX_UPGRADE_LEVEL },
  { key: "speed",      name: "Tốc Độ Bơi",      bonusText: "+2% Tốc độ / cấp",        baseCost: 100, stepCost: 80, maxLevel: MAX_UPGRADE_LEVEL },
  { key: "dmg",        name: "Sức Cắn",         bonusText: "+5 Sát thương / cấp",     baseCost: 100, stepCost: 80, maxLevel: MAX_UPGRADE_LEVEL },
  { key: "eatRange",   name: "Hút Thức Ăn",     bonusText: "+5% Tầm hút / cấp",       baseCost: 100, stepCost: 80, maxLevel: MAX_UPGRADE_LEVEL },
  { key: "defense",    name: "Giảm Sát Thương", bonusText: "+1% Giảm ST nhận / cấp",  baseCost: 100, stepCost: 80, maxLevel: MAX_UPGRADE_LEVEL },
  { key: "skillPower", name: "Sức Mạnh Skill",  bonusText: "+5% ST Kỹ năng / cấp",    baseCost: 120, stepCost: 90, maxLevel: MAX_UPGRADE_LEVEL }
];

export const QUEST_TEMPLATES = [
  { id: "eat50", title: "Ăn 50 mồi thủy cung", target: 50, reward: 60, statKey: "foodEaten" },
  { id: "kill3", title: "Nuốt chửng 5 cá đối thủ", target: 5, reward: 120, statKey: "fishKilled" },
  { id: "evo2", title: "Đạt cấp 10 (Tiến hóa Dạng 2)", target: 1, reward: 90, statKey: "reachedTier2" },
  { id: "boss1", title: "Hạ gục 1 Boss Thủy Cung", target: 1, reward: 250, statKey: "bossKilled" },
  { id: "play3", title: "Hoàn thành 3 trận đấu", target: 3, reward: 75, statKey: "gamesPlayed" }
];