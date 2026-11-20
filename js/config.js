export const MAP_SIZE = 3200;
export const BASE_FOOD_COUNT = 240;
export const BOSS_RESPAWN_MS = 60000;   // 1 phút
export const EVENT_DURATION_MS = 30000; // Sự kiện kéo dài 30 giây
export const EVENT_INTERVAL_MS = 120000;// Mỗi 2 phút 1 lần
export const DOMAIN_RADIUS = 340;

// Thông số tầm nhìn & kỹ năng Boss
export const BOSS_VISION_RADIUS = 620;  // Tầm nhìn & Lĩnh vực "Sức mạnh tuyệt đối"
export const BOSS_RANGED_RANGE = 500;   // Tầm đánh tầm xa (ngoài vòng cận chiến)
export const BOSS_VORTEX_RADIUS = 230;  // Bán kính vòng xoáy "Chạy đâu cho thoát"

export const EVO_TIERS = [
  { tier: 1, name: "Cá Con Tập Sự", baseRadius: 22 },
  { tier: 2, name: "Chiến Ngư Thủy Cung", baseRadius: 31 },
  { tier: 3, name: "Thủy Quái Vạn Cân", baseRadius: 41 },
  { tier: 4, name: "Bá Chủ Biển Sâu", baseRadius: 52 },
  { tier: 5, name: "Thần Ngư Hải Vương", baseRadius: 65 }
];

export const BOSS_SPAWNS = [
  { id: "boss_0", name: "Boss Bắc Hải", x: 850, y: 850 },
  { id: "boss_1", name: "Boss Đông Hải", x: 2350, y: 1050 },
  { id: "boss_2", name: "Boss Nam Hải", x: 1600, y: 2350 }
];

export const UPGRADE_DEFS = [
  { key: "hp", name: "Máu Khởi Đầu", bonusText: "+20 HP / cấp", baseCost: 50, stepCost: 40 },
  { key: "speed", name: "Tốc Độ Bơi", bonusText: "+4% Tốc độ / cấp", baseCost: 50, stepCost: 40 },
  { key: "dmg", name: "Sức Cắn", bonusText: "+5 Sát thương / cấp", baseCost: 50, stepCost: 40 }
];

export const QUEST_TEMPLATES = [
  { id: "eat50", title: "Ăn 50 mồi thủy cung", target: 50, reward: 60, statKey: "foodEaten" },
  { id: "kill3", title: "Nuốt chửng 5 cá đối thủ", target: 5, reward: 120, statKey: "fishKilled" },
  { id: "evo2", title: "Đạt cấp 10 (Tiến hóa Dạng 2)", target: 1, reward: 90, statKey: "reachedTier2" },
  { id: "boss1", title: "Hạ gục 1 Boss Thủy Cung", target: 1, reward: 250, statKey: "bossKilled" },
  { id: "play3", title: "Hoàn thành 3 trận đấu", target: 3, reward: 75, statKey: "gamesPlayed" }
];