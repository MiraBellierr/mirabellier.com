const {
  BASE_PROFILE, CATALOG_VERSION, DAILY_CARD_DRAW_LIMIT,
  ARENA_EFFECT_DEFAULTS, MAX_LEVEL, LEVEL_UP_GAINS,
} = require("../arena-constants");
const {
  nowIso, makeId, clamp, toInt, toPositiveInt,
  getCurrentRecordedDate, addDaysToRecordedDate, getNextCardDrawAt, xpToNext,
  isEloProvisional, ELO_MIN_RATING,
} = require("./utils");
const { createArenaNotification } = require("./notifications");
const { normalizeArenaEffects, serializeEffects } = require("./effects");
const {
  normalizeSelectedCard, serializeSelectedCard, cardIvStatBonus,
  attachCardAffinity, buildAffinitySummary, getAffinityStatBonus,
  getCardAffinity, getCardAffinityMap,
} = require("./cards");
const {
  computeEquipmentStats, weightedEquipmentBonus,
  getEquipmentPiecesRows, getEquipmentLoadouts, toPublicEquipmentPiece,
  getGearRollPrice, getRerollSubStatCost,
} = require("./equipment");
const { getSkillState } = require("./skill-tree");
const { resolveActiveTitle } = require("./titles");
const { ArenaHttpError } = require("./utils");

// ---- Inventory helpers (colocated here to avoid circular dep with shop.js) ----
function getInventoryRows(db, userId) {
  return db
    .prepare(
      `SELECT id, userId, itemId, quantity, createdAt, updatedAt
       FROM arena_inventory
       WHERE userId = ?
       ORDER BY createdAt ASC`,
    )
    .all(userId);
}

function getInventoryMap(db, userId) {
  const rows = getInventoryRows(db, userId);
  const inventory = new Map();
  rows.forEach((row) => {
    const quantity = Math.max(toInt(row.quantity, 0), 0);
    if (quantity > 0) {
      inventory.set(row.itemId, {
        id: row.id,
        itemId: row.itemId,
        quantity,
        createdAt: row.createdAt || null,
        updatedAt: row.updatedAt || null,
      });
    }
  });
  return inventory;
}

function buildMaterialInventory(inventoryMap) {
  const { SHOP_ITEMS } = require("../arena-constants");
  const materials = {};
  inventoryMap.forEach((entry, itemId) => {
    const item = new Map(SHOP_ITEMS.map((i) => [i.id, i])).get(itemId);
    if (!item || item.type !== "material") return;
    materials[itemId] = entry.quantity;
  });
  return materials;
}
// ---- End inventory helpers ----


function deriveAscensionCount(level, hp, power, guard, speed, effectHit) {
  // Each ascension gives +1 to all five stats.  Back-fill for profiles
  // that used Solar Cauldron before ascensionCount existed.
  const candidates = [
    hp - (BASE_PROFILE.hp + (level - 1) * LEVEL_UP_GAINS.hp),
    power - (BASE_PROFILE.power + (level - 1) * LEVEL_UP_GAINS.power),
    guard - (BASE_PROFILE.guard + (level - 1) * LEVEL_UP_GAINS.guard),
    speed - (BASE_PROFILE.speed + (level - 1) * LEVEL_UP_GAINS.speed),
    effectHit - (BASE_PROFILE.effectHit + (level - 1) * LEVEL_UP_GAINS.effectHit),
  ];
  return clamp(Math.min(...candidates), 0, 9999);
}

function mapArenaProfileRow(row) {
  if (!row) return null;

  const level = Math.max(toInt(row.level, BASE_PROFILE.level), 1);
  const hp = Math.max(toInt(row.hp, BASE_PROFILE.hp), 1);
  const power = Math.max(toInt(row.power, BASE_PROFILE.power), 1);
  const guard = Math.max(toInt(row.guard, BASE_PROFILE.guard), 1);
  const speed = Math.max(toInt(row.speed, BASE_PROFILE.speed), 1);
  const effectHit = Math.max(toInt(row.effectHit, BASE_PROFILE.effectHit), 1);

  const effects = normalizeArenaEffects(row.effectsJson || ARENA_EFFECT_DEFAULTS);

  // Back-fill ascensionCount for profiles that used Solar Cauldron
  // before the field was introduced.
  if (!effects.ascensionCount && effects.ascensionLastPurchasedAt) {
    effects.ascensionCount = deriveAscensionCount(level, hp, power, guard, speed, effectHit);
  }

  return {
    userId: row.userId,
    level,
    xp: Math.max(toInt(row.xp, BASE_PROFILE.xp), 0),
    coins: Math.max(toInt(row.coins, BASE_PROFILE.coins), 0),
    wins: Math.max(toInt(row.wins, BASE_PROFILE.wins), 0),
    losses: Math.max(toInt(row.losses, BASE_PROFILE.losses), 0),
    winStreak: Math.max(toInt(row.winStreak, BASE_PROFILE.winStreak), 0),
    defensiveWins: Math.max(toInt(row.defensiveWins, 0), 0),
    defensiveLosses: Math.max(toInt(row.defensiveLosses, 0), 0),
    hp,
    power,
    guard,
    speed,
    effectHit,
    lifetimeCoinsEarned: Math.max(
      toInt(row.lifetimeCoinsEarned, BASE_PROFILE.lifetimeCoinsEarned),
      0,
    ),
    eloRating: Math.max(
      toInt(row.eloRating, BASE_PROFILE.eloRating),
      ELO_MIN_RATING,
    ),
    eloMatches: Math.max(
      toInt(row.eloMatches, BASE_PROFILE.eloMatches),
      0,
    ),
    peakElo: Math.max(
      toInt(row.peakElo, BASE_PROFILE.peakElo),
      ELO_MIN_RATING,
    ),
    selectedCard: normalizeSelectedCard(row.selectedCardJson),
    lastCardDrawDate:
      typeof row.lastCardDrawDate === "string" && row.lastCardDrawDate
        ? row.lastCardDrawDate
        : null,
    dailyCardDrawCount: Math.max(toInt(row.dailyCardDrawCount, 0), 0),
    catalogVersion:
      typeof row.catalogVersion === "string" && row.catalogVersion
        ? row.catalogVersion
        : "v1",
    effects,
    lastFightAt: row.lastFightAt || null,
    lastSkillResetAt: row.lastSkillResetAt || null,
    activeTitleId: row.activeTitleId || null,
    dailyOpponentCount: Math.max(toInt(row.dailyOpponentCount, 0), 0),
    lastOpponentDate: typeof row.lastOpponentDate === "string" && row.lastOpponentDate ? row.lastOpponentDate : null,
    tutorialComplete: toInt(row.tutorialComplete, 0),
    loginStreak: Math.max(toInt(row.loginStreak, 0), 0),
    lastLoginDate: typeof row.lastLoginDate === "string" && row.lastLoginDate ? row.lastLoginDate : null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

function createArenaProfile(db, userId) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO arena_profiles (
      userId,
      level,
      xp,
      coins,
      wins,
      losses,
      winStreak,
      hp,
      power,
      guard,
      speed,
      effectHit,
      lifetimeCoinsEarned,
      eloRating,
      eloMatches,
      peakElo,
      selectedCardJson,
      lastCardDrawDate,
      dailyCardDrawCount,
      catalogVersion,
      effectsJson,
      lastFightAt,
      tutorialComplete,
      createdAt,
      updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    userId,
    BASE_PROFILE.level,
    BASE_PROFILE.xp,
    BASE_PROFILE.coins,
    BASE_PROFILE.wins,
    BASE_PROFILE.losses,
    BASE_PROFILE.winStreak,
    BASE_PROFILE.hp,
    BASE_PROFILE.power,
    BASE_PROFILE.guard,
    BASE_PROFILE.speed,
    BASE_PROFILE.effectHit,
    BASE_PROFILE.lifetimeCoinsEarned,
    BASE_PROFILE.eloRating,
    BASE_PROFILE.eloMatches,
    BASE_PROFILE.peakElo,
    null,
    null,
    0,
    CATALOG_VERSION,
    serializeEffects(ARENA_EFFECT_DEFAULTS),
    null,
    0,
    now,
    now,
  );
}

function ensureArenaProfile(db, userId) {
  let row = db.prepare("SELECT * FROM arena_profiles WHERE userId = ?").get(userId);
  if (!row) {
    createArenaProfile(db, userId);
    row = db.prepare("SELECT * FROM arena_profiles WHERE userId = ?").get(userId);
  }

  return mapArenaProfileRow(row);
}

const DAILY_LOGIN_COIN_BASE = 10;
const DAILY_LOGIN_COIN_STEP = 5;
const DAILY_LOGIN_COIN_CAP = 50;

function canClaimDailyLogin(profile, date = getCurrentRecordedDate()) {
  return profile.lastLoginDate !== date;
}

function previewDailyLoginStreak(profile, date = getCurrentRecordedDate()) {
  return profile.lastLoginDate && addDaysToRecordedDate(profile.lastLoginDate, 1) === date
    ? profile.loginStreak + 1
    : 1;
}

function dailyLoginCoinsForStreak(streak) {
  return clamp(
    DAILY_LOGIN_COIN_BASE + (streak - 1) * DAILY_LOGIN_COIN_STEP,
    DAILY_LOGIN_COIN_BASE,
    DAILY_LOGIN_COIN_CAP,
  );
}

// Explicit claim (not auto-granted on every profile fetch, which would turn
// a read into a write) once per recorded day — same "have I already done
// this today" idiom as lastCardDrawDate. Streak continues only if the
// previous claim was exactly yesterday; any gap resets it to 1.
function claimDailyLoginBonus(db, userId) {
  const profile = ensureArenaProfile(db, userId);
  const today = getCurrentRecordedDate();
  if (!canClaimDailyLogin(profile, today)) {
    throw new ArenaHttpError(409, "Today's login bonus is already claimed.", "ARENA_DAILY_LOGIN_ALREADY_CLAIMED");
  }

  const streak = previewDailyLoginStreak(profile, today);
  const coins = dailyLoginCoinsForStreak(streak);

  db.prepare(
    `UPDATE arena_profiles
     SET coins = coins + ?, lifetimeCoinsEarned = lifetimeCoinsEarned + ?,
         loginStreak = ?, lastLoginDate = ?, updatedAt = ?
     WHERE userId = ?`,
  ).run(coins, coins, streak, today, nowIso(), userId);

  createArenaNotification(
    db,
    userId,
    "daily_login",
    `Day ${streak} login streak!`,
    `+${coins} coins for showing up today.`,
    "/arena",
  );

  return { streak, coins, coinsTotal: profile.coins + coins };
}

function getDailyCardDrawsUsed(profile, date = getCurrentRecordedDate()) {
  if (profile.lastCardDrawDate !== date) return 0;

  const explicitCount = Math.max(toInt(profile.dailyCardDrawCount, 0), 0);
  if (explicitCount > 0) {
    return clamp(explicitCount, 0, DAILY_CARD_DRAW_LIMIT);
  }

  // Backward compatibility for rows created before dailyCardDrawCount existed.
  return profile.selectedCard ? 1 : 0;
}

function canDrawDailyCard(profile) {
  return getDailyCardDrawsUsed(profile) < DAILY_CARD_DRAW_LIMIT;
}

function toPublicProfile(profile, equipmentStats, equippedItems, equipmentPctStats = {}, options = {}) {
  const totalFights = profile.wins + profile.losses;
  const nextXp = xpToNext(profile.level);
  const dailyDrawsUsed = getDailyCardDrawsUsed(profile);
  const canDrawCard = dailyDrawsUsed < DAILY_CARD_DRAW_LIMIT;
  const selectedCard = options.selectedCard || profile.selectedCard;
  const cardStats = selectedCard
    ? cardIvStatBonus(selectedCard)
    : { hp: 0, power: 0, guard: 0, speed: 0, effectHit: 0 };
  const skillStats = options.skillStats || {
    hp: 0,
    power: 0,
    guard: 0,
    speed: 0,
    effectHit: 0,
  };
  const affinityStats = options.affinityStats || {
    hp: 0,
    power: 0,
    guard: 0,
    speed: 0,
    effectHit: 0,
  };
  const hpBeforePct =
    profile.hp + equipmentStats.hp + cardStats.hp + skillStats.hp + affinityStats.hp;
  const hpPct = Math.max(toInt(equipmentPctStats?.hpPct, 0), 0);
  const totalHp = Math.floor(hpBeforePct * (1 + hpPct / 100));

  return {
    userId: profile.userId,
    level: profile.level,
    xp: profile.xp,
    xpToNext: nextXp,
    xpProgress: nextXp > 0 ? profile.xp / nextXp : 0,
    coins: profile.coins,
    wins: profile.wins,
    losses: profile.losses,
    totalFights,
    winRate: totalFights > 0 ? profile.wins / totalFights : 0,
    winStreak: profile.winStreak,
    defensiveWins: profile.defensiveWins || 0,
    defensiveLosses: profile.defensiveLosses || 0,
    title: resolveActiveTitle(profile.activeTitleId),
    eloRating: profile.eloRating,
    eloMatches: profile.eloMatches,
    peakElo: profile.peakElo,
    eloProvisional: isEloProvisional(profile.eloMatches),
    tutorialComplete: profile.tutorialComplete || 0,
    stats: {
      base: {
        hp: profile.hp,
        power: profile.power,
        guard: profile.guard,
        speed: profile.speed,
        effectHit: profile.effectHit,
      },
      equipment: equipmentStats,
      card: cardStats,
      skill: skillStats,
      affinity: affinityStats,
      total: {
        hp: totalHp,
        power:
          profile.power + equipmentStats.power + cardStats.power + skillStats.power + affinityStats.power,
        guard:
          profile.guard + equipmentStats.guard + cardStats.guard + skillStats.guard + affinityStats.guard,
        speed:
          profile.speed + equipmentStats.speed + cardStats.speed + skillStats.speed + affinityStats.speed,
        effectHit:
          profile.effectHit + equipmentStats.effectHit + cardStats.effectHit + skillStats.effectHit + affinityStats.effectHit,
      },
    },
    selectedCard,
    canDrawCard,
    catalogVersion: profile.catalogVersion || CATALOG_VERSION,
    dailyDrawLimit: DAILY_CARD_DRAW_LIMIT,
    dailyDrawsUsed,
    dailyDrawsRemaining: Math.max(DAILY_CARD_DRAW_LIMIT - dailyDrawsUsed, 0),
    nextCardDrawAt: canDrawCard ? null : getNextCardDrawAt(profile.lastCardDrawDate),
    lastCardDrawDate: profile.lastCardDrawDate,
    lifetimeCoinsEarned: profile.lifetimeCoinsEarned,
    gearRollPrice: getGearRollPrice(profile.level),
    rerollSubStatCost: getRerollSubStatCost(profile.level),
    effects: profile.effects,
    equipment: equippedItems,
    equipmentPct: equipmentPctStats || {},
    activePassives: Array.isArray(options.activePassives) ? options.activePassives : [],
    materialInventory: options.materialInventory || {},
    equipmentPieces: Array.isArray(options.equipmentPieces) ? options.equipmentPieces : [],
    lastFightAt: profile.lastFightAt,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    ...options,
  };
}

function parseFightRounds(roundsJson) {
  try {
    const parsed = JSON.parse(roundsJson || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Card snapshots are nullable — fights recorded before this column existed
// (or a rare parse failure) just come back with no card, and the frontend
// falls back to showing the fighter's name only.
function parseFightCard(cardJson) {
  if (!cardJson) return null;
  try {
    return JSON.parse(cardJson);
  } catch {
    return null;
  }
}

function readRecentFights(db, userId, limit = 10) {
  const rows = db
    .prepare(
      `SELECT id, opponentUserId, result, roundsJson, xpDelta, coinDelta, createdAt,
              playerCardJson, opponentCardJson
       FROM arena_fights
       WHERE userId = ?
       ORDER BY createdAt DESC
       LIMIT ?`,
    )
    .all(userId, clamp(toPositiveInt(limit, 10), 1, 25));

  return rows.map((row) => ({
    id: row.id,
    opponentUserId: row.opponentUserId,
    result: row.result,
    rounds: parseFightRounds(row.roundsJson),
    xpDelta: toInt(row.xpDelta, 0),
    coinDelta: toInt(row.coinDelta, 0),
    createdAt: row.createdAt || null,
    playerCard: parseFightCard(row.playerCardJson),
    opponentCard: parseFightCard(row.opponentCardJson),
  }));
}

// Public replay lookup for a single completed fight — see suggestion #17
// ("replay links"). `arena_fights.roundsJson` already stores everything a
// read-only replay needs (attacker/defender names, HP/shield per turn), so
// this needs no seed/determinism scheme, just the row that's already there.
function getArenaFightById(db, fightId) {
  const row = db
    .prepare(
      `SELECT f.id, f.userId, u.username, f.opponentUserId, f.result,
              f.roundsJson, f.xpDelta, f.coinDelta, f.createdAt,
              f.playerCardJson, f.opponentCardJson
       FROM arena_fights f
       LEFT JOIN users u ON u.id = f.userId
       WHERE f.id = ?`,
    )
    .get(fightId);
  if (!row) return null;

  return {
    id: row.id,
    userId: row.userId,
    username: row.username || "Unknown",
    opponentUserId: row.opponentUserId,
    result: row.result,
    rounds: parseFightRounds(row.roundsJson),
    xpDelta: toInt(row.xpDelta, 0),
    coinDelta: toInt(row.coinDelta, 0),
    createdAt: row.createdAt || null,
    playerCard: parseFightCard(row.playerCardJson),
    opponentCard: parseFightCard(row.opponentCardJson),
  };
}

function getArenaProfilePayload(db, userId) {
  const profile = ensureArenaProfile(db, userId);
  const inventoryMap = getInventoryMap(db, userId);
  const {
    equipped, stats: equipmentStats, pct: equipmentPctStats, sets: equipmentSets,
  } = computeEquipmentStats(db, userId);
  const skillState = getSkillState(db, profile);
  const activePassives = [...skillState.passives].sort((a, b) => b.priority - a.priority);
  const materialInventory = buildMaterialInventory(inventoryMap);
  const recentFights = readRecentFights(db, userId, 10);

  const equipmentPieces = getEquipmentPiecesRows(db, userId).map((row) =>
    toPublicEquipmentPiece(row, true, profile.level),
  );

  const equipmentLoadouts = getEquipmentLoadouts(db, userId);
  const selectedAffinity = profile.selectedCard
    ? getCardAffinity(db, userId, profile.selectedCard.malId)
    : null;

  return toPublicProfile(profile, equipmentStats, equipped, equipmentPctStats, {
    selectedCard: profile.selectedCard
      ? attachCardAffinity(profile.selectedCard, selectedAffinity)
      : null,
    loginStreak: profile.loginStreak,
    lastLoginDate: profile.lastLoginDate,
    canClaimDailyLogin: canClaimDailyLogin(profile),
    dailyLoginPreview: {
      streak: previewDailyLoginStreak(profile),
      coins: dailyLoginCoinsForStreak(previewDailyLoginStreak(profile)),
    },
    activePassives,
    skillStats: skillState.stats,
    affinityStats: selectedAffinity?.statBonus || getAffinityStatBonus(0),
    skillTree: {
      earnedPoints: skillState.earnedPoints,
      spentPoints: skillState.spentPoints,
      availablePoints: skillState.availablePoints,
      resetCost: skillState.resetCost,
    },
    materialInventory,
    recentFights,
    equipmentPieces,
    equipmentLoadouts,
    equipmentSets: equipmentSets || [],
  });
}

module.exports = {
  mapArenaProfileRow,
  createArenaProfile,
  ensureArenaProfile,
  getInventoryRows,
  getInventoryMap,
  buildMaterialInventory,
  getDailyCardDrawsUsed,
  canDrawDailyCard,
  canClaimDailyLogin,
  claimDailyLoginBonus,
  toPublicProfile,
  readRecentFights,
  getArenaFightById,
  getArenaProfilePayload,
};
