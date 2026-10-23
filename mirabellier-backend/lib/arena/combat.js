// Combat math, simulation, NPC, ELO, and fight execution
const {
  ELEMENT_EFFECTIVENESS, ELEMENTS, RARITY_CONFIG,
  FIGHT_COOLDOWN_MS, LEVEL_UP_GAINS, MAX_LEVEL,
  BASE_PROFILE, ARENA_EFFECT_DEFAULTS,
} = require("../arena-constants");
const { drawArenaCard, getArenaCharacterCatalog, ensureArenaCardPool } = require("../arena-characters");
const {
  nowIso, makeId, clamp, toInt, toPositiveInt, randomInt,
  getCurrentRecordedDate, toRecordedIso, xpToNext, rarityRank,
  isEloProvisional, calculateEloExchange, ELO_DEFAULT_RATING, ELO_MIN_RATING,
  ELO_MATCHMAKING_POOL_SIZE, ELO_MATCHMAKING_CANDIDATE_LIMIT,
  RECENT_OPPONENT_LIMIT, DAILY_OPPONENT_LIMIT_MULTIPLIER,
  DAILY_OPPONENT_LIMIT_MIN, DAILY_OPPONENT_LIMIT_MAX,
  toCombatName, getValueAtPath,
  CARD_IV_MAX, MAX_COMBINED_DAMAGE_MULTIPLIER,
} = require("./utils");
const {
  normalizeArenaEffects,
  pruneInactiveConsumables,
  serializeEffects,
} = require("./effects");

// NPC Templates (only used by combat module)
const NPC_TEMPLATES = [
  { id: "training-slime", displayName: "Training Slime", levelMax: 4, rarity: "C", ivRange: { min: 4, max: 14 }, statScale: 0.75, equipmentBonus: 0.05 },
  { id: "shadow-pupil", displayName: "Shadow Pupil", levelMax: 9, rarity: "R", ivRange: { min: 6, max: 16 }, statScale: 0.78, equipmentBonus: 0.12 },
  { id: "steel-paladin", displayName: "Steel Paladin", levelMax: 19, rarity: "R", ivRange: { min: 10, max: 22 }, statScale: 0.82, equipmentBonus: 0.2 },
  { id: "arcane-knight", displayName: "Arcane Knight", levelMax: 34, rarity: "SR", ivRange: { min: 14, max: 26 }, statScale: 0.87, equipmentBonus: 0.32 },
  { id: "dread-lord", displayName: "Dread Lord", levelMax: 49, rarity: "SR", ivRange: { min: 18, max: 30 }, statScale: 0.92, equipmentBonus: 0.45 },
  { id: "celestial-warden", displayName: "Celestial Warden", levelMax: 64, rarity: "SSR", ivRange: { min: 20, max: 31 }, statScale: 0.95, equipmentBonus: 0.58 },
  { id: "void-archon", displayName: "Void Archon", levelMax: 70, rarity: "UR", ivRange: { min: 22, max: 31 }, statScale: 0.98, equipmentBonus: 0.7 },
];
const {
  normalizeSelectedCard, cardIvStatBonus, metadataBonuses,
  createDrawnCard, insertCollectionCard,
  buildAffinitySummary, getAffinityStatBonus, getCardAffinity,
  attachCardAffinity, recordCardAffinityFight,
} = require("./cards");
const { computeEquipmentStats, weightedEquipmentBonus } = require("./equipment");
const { getSkillState } = require("./skill-tree");
const { ensureArenaProfile, mapArenaProfileRow, getArenaProfilePayload } = require("./profile");
const { createArenaNotification } = require("./notifications");
const { resolveActiveTitle } = require("./titles");
const { ArenaHttpError } = require("./utils");

// PvP is meant to be the efficient path: NPC fights are unrated *and* pay less,
// so a thin matchmaking pool no longer means risk-free full rewards.
const NPC_REWARD_SCALE = 0.75;

// Stat design (improve.md §9): effectHit now pays in every fight, and striking
// first is no longer a pure speed function.
const EFFECT_HIT_ACCURACY_PER_POINT = 0.0006; // attacker effectHit shaves defender evade chance
const EFFECT_HIT_TRUE_DAMAGE_PER_POINT = 0.15; // small flat true-damage trickle per hit
const TURN_ORDER_SPEED_JITTER = 18; // random band on the speed tiebreak (was 4)
const SECOND_ACTOR_DAMAGE_PCT = 10; // the fighter acting second gets +10% that exchange

// A real player picked as someone's opponent earns a flat coin stipend so
// defending is not pure ELO downside (see improve.md §4). Scales with the
// defender's level and pays more for a successful defence.
const DEFENDER_BASE_STIPEND = 10;
const DEFENDER_STIPEND_PER_LEVEL = 2;
const DEFENDER_WIN_STIPEND_MULTIPLIER = 1.5;


/**
 * Calculates a fighter's round power — the primary metric compared each combat round.
 *
 * @param {Object} input
 * @param {number} input.power       - Fighter's power stat.
 * @param {number} input.guard       - Fighter's guard stat.
 * @param {number} input.speed       - Fighter's speed stat.
 * @param {number} input.equipmentBonus - Weighted equipment bonus.
 * @param {string} input.rarity      - Card rarity (C|R|SR|SSR|UR).
 * @param {number} [input.level=1]   - Fighter level.
 * @param {Object} [input.card]      - The selected card object (used for MAL metadata).
 * @param {Function} [input.randomFn=Math.random] - Seeded RNG.
 * @returns {{ value: number, breakdown: { rarityPower: number, malScoreBonus: number, popularityBonus: number, noise: number } }}
 */
function calculateRoundPower(input) {
  const {
    power,
    guard,
    speed,
    equipmentBonus,
    rarity,
    level = 1,
    card,
    randomFn = Math.random,
  } = input;

  const rarityPower = Number(RARITY_CONFIG[rarity]?.powerBonus || 0) * (1 + (level ?? 1) * 0.02);
  const { malScoreBonus, popularityBonus } = metadataBonuses(card);
  const noise = randomInt(-10, 10, randomFn);

  return {
    value:
      power * 2.0 +
      guard * 1.7 +
      speed * 1.5 +
      equipmentBonus +
      rarityPower +
      malScoreBonus +
      popularityBonus +
      noise,
    breakdown: {
      rarityPower,
      malScoreBonus,
      popularityBonus,
      noise,
    },
  };
}

/**
 * Resolves the winner of a single combat round.
 * Higher power wins; tied power is broken by higher speed; tied speed is a coin flip.
 *
 * @param {Object} input
 * @param {number} input.playerPower
 * @param {number} input.opponentPower
 * @param {number} input.playerSpeed
 * @param {number} input.opponentSpeed
 * @param {Function} [input.randomFn] - Seeded RNG.
 * @returns {"player"|"opponent"}
 */
function resolveRoundWinner(input) {
  const { playerPower, opponentPower, playerSpeed, opponentSpeed, randomFn } = input;
  if (playerPower > opponentPower) return "player";
  if (opponentPower > playerPower) return "opponent";
  if (playerSpeed > opponentSpeed) return "player";
  if (opponentSpeed > playerSpeed) return "opponent";
  return (randomFn || Math.random)() >= 0.5 ? "player" : "opponent";
}

/**
 * Applies pending level-ups to a profile. Consumes XP and increments
 * level + stats until XP falls below the next threshold or max level is reached.
 *
 * @param {Object} profile - Arena profile (mutated in place).
 * @returns {number} Number of levels gained.
 */
function applyLevelUps(profile) {
  let leveledUp = 0;
  let nextThreshold = xpToNext(profile.level);

  while (profile.xp >= nextThreshold && profile.level < MAX_LEVEL) {
    profile.xp -= nextThreshold;
    profile.level += 1;
    profile.hp += LEVEL_UP_GAINS.hp;
    profile.power += LEVEL_UP_GAINS.power;
    profile.guard += LEVEL_UP_GAINS.guard;
    profile.speed += LEVEL_UP_GAINS.speed;
    profile.effectHit += LEVEL_UP_GAINS.effectHit;
    leveledUp += 1;
    nextThreshold = xpToNext(profile.level);
  }

  return leveledUp;
}

/**
 * Converts overflow XP to coins for max-level players.
 *
 * @param {Object} profile      - Arena profile (mutated in place: XP zeroed, coins added).
 * @param {number} [coinRate=1] - Coins per overflow XP point.
 * @returns {number} Coins earned from overflow conversion.
 */
function convertMaxLevelOverflowXp(profile, coinRate = 1) {
  if (!profile || toInt(profile.level, 1) < MAX_LEVEL) return 0;
  const overflowXp = Math.max(toInt(profile.xp, 0), 0);
  if (overflowXp <= 0) {
    profile.xp = 0;
    return 0;
  }

  const coins = overflowXp * Math.max(toInt(coinRate, 1), 0);
  profile.xp = 0;
  profile.coins += coins;
  profile.lifetimeCoinsEarned += coins;
  return coins;
}

/**
 * Streak-based XP multiplier. Mirrors `calculateStreakCoinMultiplier` in shape
 * so the two streak systems are read the same way: +2% XP per win on the
 * streak, capped at +25% (improve.md §10). Was a flat additive `log2` bonus
 * that topped out at +7 XP — invisible against a ~200 XP win.
 *
 * @param {number} currentWinStreak
 * @returns {number} Multiplier (1.0 + bonus).
 */
function calculateStreakXpMultiplier(currentWinStreak) {
  return 1 + Math.min(Math.max(toInt(currentWinStreak, 0), 0) * 0.02, 0.25);
}

/**
 * Calculates XP earned for a win.
 *
 * @param {number} opponentLevel
 * @param {number} roundsWon        - Number of rounds the player won.
 * @param {number} currentWinStreak
 * @returns {number} Total XP for the win.
 */
function calculateWinXp(opponentLevel, roundsWon, currentWinStreak) {
  // Opponent-level term raised 2.5 -> 4 so a top-end win pays ~296 XP; with the
  // flattened `xpToNext` curve that lands the 1->70 grind near ~3.7k best-case
  // fights, down from ~14k (improve.md §10).
  const base = 10 + Math.floor(opponentLevel * 4) + toInt(roundsWon, 0) * 2;
  return Math.floor(base * calculateStreakXpMultiplier(currentWinStreak));
}

/**
 * Calculates XP earned for a loss (35% of win XP, minimum 1).
 *
 * @param {number} opponentLevel
 * @param {number} roundsWon
 * @param {number} currentWinStreak
 * @returns {number} Total XP for the loss.
 */
function calculateLossXp(opponentLevel, roundsWon, currentWinStreak) {
  return Math.max(
    1,
    Math.floor(calculateWinXp(opponentLevel, roundsWon, currentWinStreak) * 0.35),
  );
}

/**
 * Calculates the streak-based coin multiplier (capped at +30%).
 *
 * @param {number} currentWinStreak
 * @returns {number} Multiplier (1.0 + bonus).
 */
function calculateStreakCoinMultiplier(currentWinStreak) {
  return 1 + Math.min(Math.max(toInt(currentWinStreak, 0), 0) * 0.02, 0.3);
}

/**
 * Calculates coins earned for a win, including streak multiplier.
 *
 * @param {number} opponentLevel
 * @param {number} rarityCoinReward - Bonus from card rarity.
 * @param {number} [currentWinStreak=0]
 * @returns {number} Total coins for the win.
 */
function calculateWinCoins(opponentLevel, rarityCoinReward, currentWinStreak = 0) {
  const level = Math.max(toInt(opponentLevel, 0), 0);
  // Slightly softer early, slightly richer late than the old flat `level * 5`;
  // the real early-game relief comes from level-scaled sinks (improve.md §6).
  const base = (
    18 +
    Math.floor(level * 3.5) +
    Math.floor(level ** 1.15) +
    toInt(rarityCoinReward, 0)
  );
  return Math.floor(base * calculateStreakCoinMultiplier(currentWinStreak));
}

function buildNpcProgressionBonuses(level, equipmentBonus = 0) {
  const npcLevel = clamp(toPositiveInt(level, 1), 1, MAX_LEVEL);
  const equipmentScale = Math.max(0, Number(equipmentBonus) || 0);
  const skillScale = npcLevel / MAX_LEVEL;
  return {
    equipmentStats: {
      hp: Math.floor(npcLevel * 3.5 * equipmentScale),
      power: Math.floor(npcLevel * 1.1 * equipmentScale),
      guard: Math.floor(npcLevel * 1.1 * equipmentScale),
      speed: Math.floor(npcLevel * 0.65 * equipmentScale),
      effectHit: Math.floor(npcLevel * 0.55 * equipmentScale),
    },
    equipmentPctStats: {
      // Bumped for the §8 equipment rework (slot % mains + set bonuses give
      // geared players noticeably more dmgPct/defendPct than before).
      hpPct: Math.floor(12 * equipmentScale),
      dmgPct: Math.floor(22 * equipmentScale),
      defendPct: Math.floor(18 * equipmentScale),
      critChancePct: Math.floor(14 * equipmentScale),
      critDmgPct: Math.floor(35 * equipmentScale),
    },
    skillStats: {
      hp: Math.floor(npcLevel * 1.4 * skillScale),
      power: Math.floor(npcLevel * 0.45 * skillScale),
      guard: Math.floor(npcLevel * 0.45 * skillScale),
      speed: Math.floor(npcLevel * 0.25 * skillScale),
      effectHit: Math.floor(npcLevel * 0.2 * skillScale),
    },
  };
}

function assertFightCooldown(profile, options = {}) {
  const { effects, allowGateKey = false } = options;
  const parsed = Date.parse(profile.lastFightAt || "");
  if (!Number.isFinite(parsed)) return { bypassedWithGateKey: false };
  const elapsed = Date.now() - parsed;
  if (elapsed >= FIGHT_COOLDOWN_MS) return { bypassedWithGateKey: false };

  if (
    allowGateKey &&
    effects &&
    toPositiveInt(effects.gateKeyCharges, 0) > 0
  ) {
    effects.gateKeyCharges -= 1;
    return { bypassedWithGateKey: true };
  }

  throw new ArenaHttpError(
    429,
    "Fight cooldown active. Please wait a few seconds before fighting again.",
    "ARENA_FIGHT_COOLDOWN",
    { retryAfterMs: FIGHT_COOLDOWN_MS - elapsed },
  );
}

/**
 * Loads a full combat snapshot for a profile including equipment, skill tree,
 * card stats, affinity bonuses, and computed total stats.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {Object} profile               - Arena profile row.
 * @param {Object} [options]
 * @param {Object} [options.overrideCard] - Override the profile's selected card.
 * @returns {{ profile: Object, equipped: Object, activePassives: Object[], equipmentStats: Object, equipmentPctStats: Object, skillStats: Object, affinityStats: Object, affinity: Object, equipmentBonus: number, selectedCard: Object|null, rarity: string, baseStats: Object, totalStats: Object }}
 */
function loadCombatSnapshot(db, profile, options = {}) {
  // Always re-fetch the latest profile from DB to avoid stale data
  const latestProfile = profile.isNpc ? profile : ensureArenaProfile(db, profile.userId);
  const computedEquipment = computeEquipmentStats(db, latestProfile.userId);
  const npcBonuses = latestProfile.isNpc
    ? buildNpcProgressionBonuses(
        latestProfile.level,
        latestProfile.npcEquipmentBonus,
      )
    : null;
  const equipped = computedEquipment.equipped;
  const equipmentStats = npcBonuses?.equipmentStats || computedEquipment.stats;
  const equipmentPctStats = npcBonuses?.equipmentPctStats || computedEquipment.pct;
  const skillState = latestProfile.isNpc
    ? {
        stats: npcBonuses?.skillStats || {
          hp: 0,
          power: 0,
          guard: 0,
          speed: 0,
          effectHit: 0,
        },
        passives: [],
      }
    : getSkillState(db, latestProfile);
  const activePassives = [...skillState.passives].sort((a, b) => b.priority - a.priority);
  const selectedCard = normalizeSelectedCard(options.overrideCard || latestProfile.selectedCard);
  const affinity = selectedCard && !latestProfile.isNpc
    ? getCardAffinity(db, latestProfile.userId, selectedCard.malId)
    : buildAffinitySummary();
  const affinityStats = affinity.statBonus || getAffinityStatBonus(0);
  const selectedCardWithAffinity = selectedCard ? attachCardAffinity(selectedCard, affinity) : null;
  const cardStats = selectedCardWithAffinity
    ? cardIvStatBonus(selectedCardWithAffinity)
    : { hp: 0, power: 0, guard: 0, speed: 0, effectHit: 0 };

  return {
    profile: latestProfile,
    equipped,
    activePassives,
    equipmentStats,
    equipmentPctStats,
    skillStats: skillState.stats,
    affinityStats,
    affinity,
    equipmentBonus: weightedEquipmentBonus(equipmentStats),
    selectedCard: selectedCardWithAffinity,
    rarity: selectedCard?.rarity || "C",
    baseStats: {
      hp: latestProfile.hp + cardStats.hp + skillState.stats.hp + affinityStats.hp,
      power: latestProfile.power + cardStats.power + skillState.stats.power + affinityStats.power,
      guard: latestProfile.guard + cardStats.guard + skillState.stats.guard + affinityStats.guard,
      speed: latestProfile.speed + cardStats.speed + skillState.stats.speed + affinityStats.speed,
      effectHit: latestProfile.effectHit + cardStats.effectHit + skillState.stats.effectHit + affinityStats.effectHit,
    },
    totalStats: {
      hp: latestProfile.hp + equipmentStats.hp + cardStats.hp + skillState.stats.hp + affinityStats.hp,
      power:
        latestProfile.power +
        equipmentStats.power +
        cardStats.power +
        skillState.stats.power +
        affinityStats.power,
      guard:
        latestProfile.guard +
        equipmentStats.guard +
        cardStats.guard +
        skillState.stats.guard +
        affinityStats.guard,
      speed:
        latestProfile.speed +
        equipmentStats.speed +
        cardStats.speed +
        skillState.stats.speed +
        affinityStats.speed,
      effectHit:
        latestProfile.effectHit +
        equipmentStats.effectHit +
        cardStats.effectHit +
        skillState.stats.effectHit +
        affinityStats.effectHit,
    },
  };
}

function resolveFightOpponentProfile(db, opponentSelection) {
  if (opponentSelection.isNpc) {
    return opponentSelection.profile;
  }
  return ensureArenaProfile(db, opponentSelection.profile.userId);
}

function buildFightStatBreakdown(snapshot) {
  const profile = snapshot.profile;
  const cardStats = snapshot.selectedCard
    ? cardIvStatBonus(snapshot.selectedCard)
    : { hp: 0, power: 0, guard: 0, speed: 0, effectHit: 0 };

  return {
    base: {
      hp: profile.hp,
      power: profile.power,
      guard: profile.guard,
      speed: profile.speed,
      effectHit: profile.effectHit,
    },
    equipment: { ...snapshot.equipmentStats },
    card: cardStats,
    skill: { ...snapshot.skillStats },
    affinity: { ...(snapshot.affinityStats || getAffinityStatBonus(0)) },
    total: { ...snapshot.totalStats },
  };
}

function buildPublicFightOpponentSnapshot(opponentSelection, opponentSnapshot) {
  const profile = opponentSnapshot.profile;

  return {
    userId: profile.userId,
    displayName: opponentSelection.displayName,
    title: opponentSelection.isNpc ? null : resolveActiveTitle(profile.activeTitleId),
    isNpc: opponentSelection.isNpc,
    level: profile.level,
    eloRating: opponentSelection.isNpc ? null : profile.eloRating,
    eloMatches: opponentSelection.isNpc ? 0 : profile.eloMatches,
    eloProvisional: opponentSelection.isNpc
      ? false
      : isEloProvisional(profile.eloMatches),
    stats: { ...opponentSnapshot.totalStats },
    statBreakdown: buildFightStatBreakdown(opponentSnapshot),
    equipment: opponentSnapshot.equipped,
    equipmentPct: { ...(opponentSnapshot.equipmentPctStats || {}) },
    effects: normalizeArenaEffects(profile.effects || {}),
    activePassives: Array.isArray(opponentSnapshot.activePassives)
      ? opponentSnapshot.activePassives
      : [],
    selectedCard: opponentSnapshot.selectedCard,
  };
}

function loadFightOpponent(db, opponentSelection) {
  const profile = resolveFightOpponentProfile(db, opponentSelection);
  const snapshot = loadCombatSnapshot(db, profile);
  return {
    profile,
    snapshot,
    publicSnapshot: buildPublicFightOpponentSnapshot(opponentSelection, snapshot),
  };
}

function consumeWinBoosts(effects, xpGain, coinGain) {
  let nextXp = xpGain;
  let nextCoins = coinGain;

  if (effects.expBoostWinsRemaining > 0 && effects.expBoostPct > 0) {
    nextXp = Math.floor(nextXp * (1 + effects.expBoostPct / 100));
  }

  if (effects.coinBoostWinsRemaining > 0 && effects.coinBoostPct > 0) {
    nextCoins = Math.floor(nextCoins * (1 + effects.coinBoostPct / 100));
  }

  return {
    xpGain: Math.max(toInt(nextXp, 0), 0),
    coinGain: Math.max(toInt(nextCoins, 0), 0),
  };
}

function consumeFightBoostDurations(effects) {
  if (effects.expBoostWinsRemaining > 0) {
    effects.expBoostWinsRemaining -= 1;
    if (effects.expBoostWinsRemaining === 0) effects.expBoostPct = 0;
  }
  if (effects.coinBoostWinsRemaining > 0) {
    effects.coinBoostWinsRemaining -= 1;
    if (effects.coinBoostWinsRemaining === 0) effects.coinBoostPct = 0;
  }
  if (effects.drawBonusChanceWinsRemaining > 0) {
    effects.drawBonusChanceWinsRemaining -= 1;
    if (effects.drawBonusChanceWinsRemaining === 0) effects.drawBonusChancePct = 0;
  }
}

function tryGrantBonusDraw(db, userId, effects) {
  if (!effects.drawBonusChancePct || effects.drawBonusChancePct <= 0) return null;
  if (Math.random() * 100 >= effects.drawBonusChancePct) return null;
  const catalog = getArenaCharacterCatalog();
  const index = Math.floor(Math.random() * catalog.characters.length);
  const malCard = { ...catalog.characters[index] };
  const drawnCard = createDrawnCard(malCard);
  insertCollectionCard(db, userId, drawnCard);
  return drawnCard;
}

function applyFightEffectUsage(effects, effectUsage) {
  const next = normalizeArenaEffects(effects);

  if (effectUsage.usedFightStartShield && next.fightStartShieldCharges > 0) {
    next.fightStartShieldCharges -= 1;
    if (next.fightStartShieldCharges === 0) {
      next.fightStartShieldAmount = 0;
    }
  }
  if (effectUsage.usedEvadeBoost && next.evadeBoostFightsRemaining > 0) {
    next.evadeBoostFightsRemaining -= 1;
    if (next.evadeBoostFightsRemaining === 0) {
      next.evadeBoostPct = 0;
    }
  }
  if (effectUsage.usedFirstHitTrueDamage && next.firstHitTrueDamageCharges > 0) {
    next.firstHitTrueDamageCharges -= 1;
    if (next.firstHitTrueDamageCharges === 0) {
      next.firstHitTrueDamageValue = 0;
    }
  }
  if (effectUsage.usedHigherRarityBonus && next.higherRarityDamageBonusPctCharges > 0) {
    next.higherRarityDamageBonusPctCharges -= 1;
    if (next.higherRarityDamageBonusPctCharges === 0) {
      next.higherRarityDamageBonusPct = 0;
    }
  }
  if (effectUsage.usedDoublePassiveTrigger && next.doublePassiveTriggerFightsRemaining > 0) {
    next.doublePassiveTriggerFightsRemaining -= 1;
  }
  if (effectUsage.usedDamageBoost && next.damageBoostFightsRemaining > 0) {
    next.damageBoostFightsRemaining -= 1;
    if (next.damageBoostFightsRemaining === 0) {
      next.damageBoostPct = 0;
    }
  }
  if (effectUsage.usedSpeedBoost && next.speedBoostFightsRemaining > 0) {
    next.speedBoostFightsRemaining -= 1;
    if (next.speedBoostFightsRemaining === 0) {
      next.speedBoostPct = 0;
    }
  }
  if (effectUsage.usedDeathSave && next.deathSaveCharges > 0) {
    next.deathSaveCharges -= 1;
  }
  if (effectUsage.usedStatSteroid && next.statSteroidFightsRemaining > 0) {
    next.statSteroidFightsRemaining -= 1;
    if (next.statSteroidFightsRemaining === 0) {
      next.statSteroidPct = 0;
    }
  }
  if (effectUsage.usedMatchRarity && next.matchRarityCharges > 0) {
    next.matchRarityCharges -= 1;
  }
  if (effectUsage.usedVampiricHeal && next.vampiricHealFightsRemaining > 0) {
    next.vampiricHealFightsRemaining -= 1;
    if (next.vampiricHealFightsRemaining === 0) {
      next.vampiricHealPct = 0;
    }
  }
  if (effectUsage.usedCritChanceBoost && next.critChanceBoostFightsRemaining > 0) {
    next.critChanceBoostFightsRemaining -= 1;
    if (next.critChanceBoostFightsRemaining === 0) {
      next.critChanceBoostPct = 0;
    }
  }
  if (effectUsage.usedIvBoost && next.ivBoostCharges > 0) {
    next.ivBoostCharges -= 1;
  }
  if (effectUsage.usedGuardBoost && next.guardBoostFightsRemaining > 0) {
    next.guardBoostFightsRemaining -= 1;
    if (next.guardBoostFightsRemaining === 0) {
      next.guardBoostPct = 0;
    }
  }
  if (effectUsage.usedFirstAttackDouble && next.firstAttackDoubleCharges > 0) {
    next.firstAttackDoubleCharges -= 1;
  }
  if (effectUsage.usedSelfRevive && next.selfReviveCharges > 0) {
    next.selfReviveCharges -= 1;
    if (next.selfReviveCharges === 0) {
      next.selfReviveHpThresholdPct = 0;
    }
  }
  if (effectUsage.usedGateKeyBypass && next.gateKeyCharges > 0) {
    next.gateKeyCharges -= 1;
  }

  return pruneInactiveConsumables(next);
}

/**
 * Settle everything that happens to a real-player defender when they are picked
 * as someone's opponent (see improve.md §3 and §4):
 *  - spend the combat-consumable charges/durations that fired while defending,
 *    mirroring `applyFightEffectUsage` for the attacker;
 *  - record the defensive win/loss;
 *  - pay a flat coin stipend so defending is not pure ELO downside;
 *  - drop an inbox notification (display only, no claim step).
 * NPC opponents have no stored profile and are never passed here.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {string} defenderUserId
 * @param {Object}  options
 * @param {boolean} [options.defenderWon=false]
 * @param {Object}  [options.oppEffectUsage]   - `oppEffectUsage` from `simulateFight`.
 * @param {string}  [options.attackerUserId]   - for the notification body.
 * @param {string}  [options.timestamp]        - ISO string for `updatedAt`.
 * @returns {{ stipend: number, defenderWon: boolean }}
 */
function settleDefenderFight(db, defenderUserId, options = {}) {
  const {
    defenderWon = false,
    oppEffectUsage = null,
    attackerUserId = null,
    timestamp,
  } = options;
  if (!defenderUserId) return { stipend: 0, defenderWon };
  const now = timestamp || nowIso();

  const defender = ensureArenaProfile(db, defenderUserId);

  // 1. Spend the effects that fired while defending.
  if (oppEffectUsage && Object.values(oppEffectUsage).some(Boolean)) {
    const nextEffects = applyFightEffectUsage(
      normalizeArenaEffects(defender.effects),
      oppEffectUsage,
    );
    db.prepare(
      `UPDATE arena_profiles SET effectsJson = ? WHERE userId = ?`,
    ).run(serializeEffects(nextEffects), defenderUserId);
  }

  // 2. Defensive record + 3. flat coin stipend.
  const stipend = Math.floor(
    (DEFENDER_BASE_STIPEND + defender.level * DEFENDER_STIPEND_PER_LEVEL) *
      (defenderWon ? DEFENDER_WIN_STIPEND_MULTIPLIER : 1),
  );
  const recordSql = defenderWon
    ? `UPDATE arena_profiles
       SET defensiveWins = defensiveWins + 1,
           coins = coins + ?, lifetimeCoinsEarned = lifetimeCoinsEarned + ?, updatedAt = ?
       WHERE userId = ?`
    : `UPDATE arena_profiles
       SET defensiveLosses = defensiveLosses + 1,
           coins = coins + ?, lifetimeCoinsEarned = lifetimeCoinsEarned + ?, updatedAt = ?
       WHERE userId = ?`;
  db.prepare(recordSql).run(stipend, stipend, now, defenderUserId);

  // 4. Inbox notification (display only).
  const attackerName = attackerUserId
    ? db.prepare(`SELECT username FROM users WHERE id = ?`).get(attackerUserId)?.username || null
    : null;
  createArenaNotification(
    db,
    defenderUserId,
    "defense_reward",
    defenderWon ? "You defended your Arena rank" : "You were beaten in the Arena",
    `${attackerName || "A challenger"} fought you. You earned ${stipend} coins for defending.`,
    "/arena/leaderboard",
    JSON.stringify({
      coins: stipend,
      result: defenderWon ? "win" : "loss",
      attackerUserId: attackerUserId || null,
      attackerName,
    }),
  );

  return { stipend, defenderWon };
}

function getWonRoundRarityCoinReward(simulation) {
  if (!simulation?.playerWon) return 0;
  const base = Number(RARITY_CONFIG[simulation.playerRarity]?.coinReward || 0);
  const bonusPct = Number(simulation?.passiveRewardBonus?.rarityCoinPct || 0);
  return Math.max(0, Math.floor(base * (1 + bonusPct / 100)));
}

function rollFightMaterialRewards() {
  return [];
}

/**
 * Computes max HP from base stats and an optional HP% multiplier.
 *
 * @param {{ hp?: number, guard?: number, power?: number, speed?: number }} stats
 * @param {number} [hpPct=0] - HP percentage bonus (e.g. 15 = +15%).
 * @returns {number} Maximum HP (minimum 30).
 */
function computeMaxHp(stats, hpPct = 0) {
  const hpBase = toInt(stats?.hp, 1);
  const guardBonus = Math.floor(toInt(stats?.guard, 0) * 1.0);
  const utilityBonus = Math.floor(
    (toInt(stats?.power, 0) + toInt(stats?.speed, 0)) * 0.8,
  );
  const base = Math.max(30, hpBase + guardBonus + utilityBonus);
  return Math.max(30, Math.floor(base * (1 + hpPct / 100)));
}

/**
 * Computes the effective element multiplier after applying effect-hit scaling
 * and optional reduction.
 *
 * @param {number} baseElementMult      - Base element-effectiveness multiplier (>1 for super-effective).
 * @param {{ effectHit?: number }} attackerStats
 * @param {{ effectHit?: number }} defenderStats
 * @param {number} [reductionPct=0]     - Percentage reduction from passives.
 * @returns {number} Effective multiplier, clamped to [1.0, 1.8] before reduction.
 */
function computeElementMultiplier(baseElementMult, attackerStats, defenderStats, reductionPct = 0) {
  const base = Number(baseElementMult || 1);
  if (base <= 1.0) return base;

  const raw = clamp(
    base + toInt(attackerStats?.effectHit, 0) * 0.02 - toInt(defenderStats?.effectHit, 0) * 0.01,
    1.0,
    1.8,
  );
  const reduction = toInt(reductionPct, 0);
  if (reduction <= 0) return raw;
  return Math.max(1.0, raw * (1 - reduction / 100));
}

/**
 * Computes the shield-pierce percentage from the attacker's effectHit stat.
 *
 * @param {{ effectHit?: number }} attackerStats
 * @returns {number} Pierce percentage (effectHit / 10, minimum 0).
 */
function computeShieldPiercePct(attackerStats) {
  return Math.max(0, Math.floor(toInt(attackerStats?.effectHit, 0) / 10));
}

/**
 * Computes the HP restored by a revive effect.
 *
 * @param {number} maxHp  - Combatant's maximum HP.
 * @param {number} hpPct  - Revive HP percentage (e.g. 30 = 30% of max HP).
 * @returns {number} Revived HP, clamped to [1, maxHp].
 */
function computeReviveHp(maxHp, hpPct) {
  const normalizedMaxHp = toPositiveInt(maxHp, 1);
  const revivePct = toPositiveInt(hpPct, 0);
  return clamp(Math.ceil(normalizedMaxHp * (revivePct / 100)), 1, normalizedMaxHp);
}

/**
 * Computes evasion chance for a single attack.
 *
 * @param {{ speed?: number }} attackerStats
 * @param {{ speed?: number }} defenderStats
 * @param {number} [extraDefenderEvasionPct=0] - Additional evasion from consumables/passives.
 * @returns {number} Evasion probability clamped to [0.02, 0.44].
 */
function computeEvasionChance(attackerStats, defenderStats, extraDefenderEvasionPct = 0) {
  const attackerSpeed = toInt(attackerStats?.speed, 0);
  const defenderSpeed = toInt(defenderStats?.speed, 0);
  const speedGap = defenderSpeed - attackerSpeed;
  const speedEvasion = speedGap * 0.00159;
  // Attacker's effectHit is a hit rating — it shaves the defender's evade chance
  // in every fight, not only element matchups (improve.md §9).
  const accuracy = toInt(attackerStats?.effectHit, 0) * EFFECT_HIT_ACCURACY_PER_POINT;

  return clamp(
    0.03 + speedEvasion - accuracy + Number(extraDefenderEvasionPct || 0) / 100,
    0.02,
    0.44,
  );
}

/**
 * Simulates a single attack outcome including evasion, damage calculation,
 * critical hits, element effectiveness, and true damage.
 *
 * @param {Object} input
 * @param {{ power?: number, speed?: number, effectHit?: number }} input.attackerStats
 * @param {{ guard?: number, speed?: number, effectHit?: number }} input.defenderStats
 * @param {string}  input.attackerRarity
 * @param {number}  [input.attackerLevel=1]
 * @param {string}  input.defenderRarity
 * @param {number}  [input.defenderLevel=1]
 * @param {number}  [input.bonusCritChancePct=0]
 * @param {number}  [input.attackerDamageFlat=0]
 * @param {number}  [input.attackerDamagePct=0]
 * @param {number}  [input.attackerTrueDamage=0]
 * @param {number}  [input.defenderDamageReductionPct=0]
 * @param {number}  [input.defenderDamageReductionFlat=0]
 * @param {number}  [input.extraDefenderEvasionPct=0]
 * @param {number}  [input.baseCritMultiplier=1.0]
 * @param {number}  [input.elementMult=1]
 * @param {Function} [input.randomFn=Math.random]
 * @returns {{ avoided: boolean, critical: boolean, damage: number, damageBase?: number, trueDamage: number, baseCritMultiplier: number }}
 */
function calculateAttackOutcome(input) {
  const {
    attackerStats,
    defenderStats,
    attackerRarity,
    attackerLevel = 1,
    defenderRarity,
    defenderLevel = 1,
    bonusCritChancePct = 0,
    attackerDamageFlat = 0,
    attackerDamagePct = 0,
    attackerTrueDamage = 0,
    defenderDamageReductionPct = 0,
    defenderDamageReductionFlat = 0,
    extraDefenderEvasionPct = 0,
    baseCritMultiplier = 1.0,
    elementMult = 1,
    randomFn = Math.random,
  } = input;

  const evasionChance = computeEvasionChance(
    attackerStats,
    defenderStats,
    extraDefenderEvasionPct,
  );
  if (randomFn() < evasionChance) {
    return {
      avoided: true,
      critical: false,
      damage: 0,
      baseCritMultiplier: 0,
    };
  }

  const rarityPower = Number(RARITY_CONFIG[attackerRarity]?.powerBonus || 0) * (1 + (attackerLevel ?? 1) * 0.02);
  const attackRoll =
    toInt(attackerStats?.power, 0) * 1.8 +
    toInt(attackerStats?.speed, 0) * 0.7 +
    rarityPower +
    randomInt(-6, 12, randomFn);
  const defenseRoll =
    toInt(defenderStats?.guard, 0) * 1.6 +
    toInt(defenderStats?.speed, 0) * 0.35 +
    (Number(RARITY_CONFIG[defenderRarity]?.powerBonus || 0)) * (1 + (defenderLevel ?? 1) * 0.02) +
    randomInt(-4, 8, randomFn);

  let damage = Math.max(1, Math.floor(attackRoll - defenseRoll * 0.55));
  damage += toInt(attackerDamageFlat, 0);
  const damageBase = Math.max(1, damage);
  damage = Math.floor(damage * (1 + Number(attackerDamagePct || 0) / 100));

  const critChance = clamp(
    0.05 + Number(bonusCritChancePct || 0) / 100,
    0.05,
    0.95,
  );
  // Element advantage no longer suppresses crit chance.
  void elementMult;
  const critical = randomFn() < critChance;
  if (critical) {
    damage = Math.max(1, Math.floor(damage * Math.max(baseCritMultiplier, 0)));
  }

  const defDivisor = 1 + Number(defenderDamageReductionPct || 0) / 100;
  damage = Math.floor(damage / defDivisor);
  damage -= toInt(defenderDamageReductionFlat, 0);
  damage = Math.max(1, damage);
  // effectHit adds a small always-on true-damage trickle (improve.md §9).
  const trueDamage =
    Math.max(toInt(attackerTrueDamage, 0), 0) +
    Math.floor(toInt(attackerStats?.effectHit, 0) * EFFECT_HIT_TRUE_DAMAGE_PER_POINT);

  return {
    avoided: false,
    critical,
    damage,
    damageBase,
    trueDamage,
    baseCritMultiplier,
  };
}

function evaluatePassiveWhen(conditions, context) {
  if (!Array.isArray(conditions) || conditions.length === 0) return true;
  return conditions.every((condition) => {
    const left = getValueAtPath(context, condition.left);
    const right = condition.right;
    switch (condition.op) {
      case "==":
        return left === right;
      case "!=":
        return left !== right;
      case ">":
        return Number(left) > Number(right);
      case ">=":
        return Number(left) >= Number(right);
      case "<":
        return Number(left) < Number(right);
      case "<=":
        return Number(left) <= Number(right);
      default:
        return false;
    }
  });
}

function canFirePassiveAction(runtimeState, actionKey, maxTriggersPerFight) {
  const maxTriggers = toPositiveInt(maxTriggersPerFight, 0);
  if (maxTriggers <= 0) return true;
  const current = runtimeState.actionUses[actionKey] || 0;
  if (current >= maxTriggers) return false;
  runtimeState.actionUses[actionKey] = current + 1;
  return true;
}

/**
 * Builds a clean passive runtime state bag for one combatant.
 *
 * @returns {{ shield: number, evasionPct: number, cancelCriticalCharges: number, reduceElementEffectivenessPct: number, tempGuard: { amount: number, remainingHits: number }, actionUses: Record<string,number>, rewardBonusPct: { xp: number, coins: number }, rarityCoinBonusPct: number }}
 */
function buildPassiveRuntime() {
  return {
    shield: 0,
    evasionPct: 0,
    cancelCriticalCharges: 0,
    reduceElementEffectivenessPct: 0,
    tempGuard: {
      amount: 0,
      remainingHits: 0,
    },
    actionUses: {},
    rewardBonusPct: {
      xp: 0,
      coins: 0,
    },
    rarityCoinBonusPct: 0,
  };
}

/**
 * Consumes one hit of temp guard from the runtime state and returns the guard amount.
 *
 * @param {Object} runtime - Passive runtime state (mutated: tempGuard decremented).
 * @returns {number} Active guard amount (0 if none).
 */
function consumeTempGuard(runtime) {
  const activeGuard =
    runtime.tempGuard.remainingHits > 0 ? runtime.tempGuard.amount : 0;
  if (activeGuard <= 0) return 0;

  runtime.tempGuard.remainingHits -= 1;
  if (runtime.tempGuard.remainingHits === 0) {
    runtime.tempGuard.amount = 0;
  }
  return activeGuard;
}

/**
 * Runs all passives matching a given trigger and returns a bag of combat modifiers.
 *
 * @param {Object} input
 * @param {string} input.trigger           - Passive trigger name (e.g. "onAttack", "onDefend").
 * @param {Object[]} input.passives         - Sorted passive definitions.
 * @param {Object} input.selfStats          - Own total stats.
 * @param {Object} input.opponentStats      - Opponent total stats.
 * @param {Object} input.selfRuntime        - Own runtime state.
 * @param {Object} input.opponentRuntime    - Opponent runtime state.
 * @param {Object} input.context            - Evaluation context for `when` conditions.
 * @param {Function} [input.randomFn=Math.random]
 * @param {number} [input.passiveChanceMultiplier=1] - Multiplier on passive trigger chance.
 * @returns {{ attackDamageFlat: number, attackDamagePct: number, bonusCritChancePct: number, damageReductionPct: number, damageReductionFlat: number, reflectFlatDamage: number, counterDamagePct: number, extraStrikeChancePct: number, extraStrikeDamagePct: number, healFlat: number }}
 */
function runPassivesForTrigger(input) {
  const {
    trigger,
    passives,
    selfStats,
    opponentStats,
    selfRuntime,
    opponentRuntime,
    context,
    randomFn = Math.random,
    passiveChanceMultiplier = 1,
  } = input;

  const mods = {
    attackDamageFlat: 0,
    attackDamagePct: 0,
    bonusCritChancePct: 0,
    damageReductionPct: 0,
    damageReductionFlat: 0,
    reflectFlatDamage: 0,
    counterDamagePct: 0,
    extraStrikeChancePct: 0,
    extraStrikeDamagePct: 0,
    healFlat: 0,
  };

  passives.forEach((passive) => {
    if (!passive || passive.trigger !== trigger) return;
    if (!evaluatePassiveWhen(passive.when, context)) return;

    const actions = Array.isArray(passive.actions) ? passive.actions : [];
    actions.forEach((action, actionIndex) => {
      const actionKey = `${passive.key}:${trigger}:${actionIndex}`;
      if (
        !canFirePassiveAction(selfRuntime, actionKey, action?.maxTriggersPerFight)
      ) {
        return;
      }

      const type = String(action?.type || "");
      const chancePct = clamp(
        toPositiveInt(action?.chancePct, 100) * Number(passiveChanceMultiplier || 1),
        0,
        100,
      );
      if (chancePct < 100 && randomFn() * 100 >= chancePct) {
        return;
      }

      const value = Number(action?.value || 0);

      if (type === "addFlatDamage") {
        mods.attackDamageFlat += value;
      } else if (type === "scaleDamagePct") {
        mods.attackDamagePct += value;
      } else if (type === "scaleBySpeedPct") {
        mods.attackDamageFlat += Math.floor(toInt(selfStats.speed, 0) * (value / 100));
      } else if (type === "bonusCritChancePct") {
        mods.bonusCritChancePct += value;
      } else if (type === "reduceIncomingDamagePct") {
        mods.damageReductionPct += value;
      } else if (type === "reduceIncomingDamageFlat") {
        mods.damageReductionFlat += value;
      } else if (type === "applyShield") {
        selfRuntime.shield += toInt(value, 0);
      } else if (type === "healFlat") {
        mods.healFlat += Math.max(toInt(value, 0), 0);
      } else if (type === "rewardBonusPct") {
        const target = String(action?.target || "");
        if (target === "xp" || target === "coins") {
          selfRuntime.rewardBonusPct[target] += value;
        }
      } else if (type === "rarityCoinBonusPct") {
        selfRuntime.rarityCoinBonusPct += value;
      } else if (type === "reflectFlatDamage") {
        mods.reflectFlatDamage += value;
      } else if (type === "counterDamagePct") {
        mods.counterDamagePct += value;
      } else if (type === "addEvasionPct") {
        selfRuntime.evasionPct += value;
      } else if (type === "grantTempGuard") {
        selfRuntime.tempGuard.amount = Math.max(
          selfRuntime.tempGuard.amount,
          toInt(value, 0),
        );
        selfRuntime.tempGuard.remainingHits = Math.max(
          selfRuntime.tempGuard.remainingHits,
          toPositiveInt(action?.turns, 1),
        );
      } else if (type === "cancelCritical") {
        selfRuntime.cancelCriticalCharges += Math.max(toInt(value, 1), 1);
      } else if (type === "reduceElementEffectivenessPct") {
        selfRuntime.reduceElementEffectivenessPct += value;
      } else if (type === "extraStrikePct") {
        mods.extraStrikeChancePct = 100;
        mods.extraStrikeDamagePct = Math.max(mods.extraStrikeDamagePct, value);
      }
    });
  });

  return mods;
}

/**
 * Selects an ELO-appropriate real-player opponent for the given user.
 * Falls back to null if no eligible opponent is found.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {string} userId
 * @param {Function} [randomFn=Math.random]
 * @returns {Object|null} Opponent profile row, or null.
 */
function chooseEloOpponent(db, userId, randomFn = Math.random) {
  const player = ensureArenaProfile(db, userId);
  const today = getCurrentRecordedDate();
  const dailyOpponentLimit = getDailyOpponentLimit(db);

  const recentOpponentRows = db
    .prepare(
      `SELECT opponentUserId
       FROM arena_fights
       WHERE userId = ? AND opponentUserId NOT LIKE 'npc:%'
       ORDER BY createdAt DESC
       LIMIT ?`,
    )
    .all(userId, RECENT_OPPONENT_LIMIT);
  const recentOpponentIds = new Set(
    recentOpponentRows
      .map((row) => row.opponentUserId)
      .filter(Boolean),
  );

  const candidates = db
    .prepare(
      `SELECT p.*
       FROM arena_profiles p
       JOIN users u ON u.id = p.userId
       WHERE p.userId <> ?
         AND p.selectedCardJson IS NOT NULL
         AND (
           substr(COALESCE(p.lastOpponentDate, ''), 1, 10) <> ?
           OR p.dailyOpponentCount < ?
         )
        ORDER BY ABS(p.eloRating - ?) ASC,
                 p.eloMatches DESC,
                 p.eloRating DESC
        LIMIT ?`,
    )
    .all(userId, today, dailyOpponentLimit, player.eloRating, ELO_MATCHMAKING_CANDIDATE_LIMIT)
    .map(mapArenaProfileRow)
    .filter(Boolean);

  const freshCandidates = candidates.filter(
    (candidate) => !recentOpponentIds.has(candidate.userId),
  );
  const pool = (freshCandidates.length > 0 ? freshCandidates : candidates).slice(
    0,
    ELO_MATCHMAKING_POOL_SIZE,
  );

  if (pool.length === 0) return null;

  const idx = Math.floor(randomFn() * pool.length);
  return pool[idx];
}

function getDailyOpponentLimit(db) {
  const row = db.prepare("SELECT COUNT(*) AS total FROM arena_profiles").get();
  const profileCount = Math.max(toInt(row?.total, 0), 0);
  return clamp(
    Math.ceil(profileCount * DAILY_OPPONENT_LIMIT_MULTIPLIER),
    DAILY_OPPONENT_LIMIT_MIN,
    DAILY_OPPONENT_LIMIT_MAX,
  );
}

function applyEloResult(db, attackerUserId, opponentUserId, attackerWon) {
  const attacker = ensureArenaProfile(db, attackerUserId);
  const opponent = ensureArenaProfile(db, opponentUserId);
  const winner = attackerWon ? attacker : opponent;
  const loser = attackerWon ? opponent : attacker;
  const exchange = calculateEloExchange(winner, loser);
  const winnerMatches = winner.eloMatches + 1;
  const loserMatches = loser.eloMatches + 1;
  const winnerPeak = Math.max(winner.peakElo, exchange.winnerAfter);
  const loserPeak = Math.max(loser.peakElo, exchange.loserAfter);
  const updatedAt = nowIso();

  db.prepare(
    `UPDATE arena_profiles
     SET eloRating = ?, eloMatches = ?, peakElo = ?, updatedAt = ?
     WHERE userId = ?`,
  ).run(
    exchange.winnerAfter,
    winnerMatches,
    winnerPeak,
    updatedAt,
    winner.userId,
  );
  db.prepare(
    `UPDATE arena_profiles
     SET eloRating = ?, eloMatches = ?, peakElo = ?, updatedAt = ?
     WHERE userId = ?`,
  ).run(
    exchange.loserAfter,
    loserMatches,
    loserPeak,
    updatedAt,
    loser.userId,
  );

  const attackerBefore = attackerWon
    ? exchange.winnerBefore
    : exchange.loserBefore;
  const attackerAfter = attackerWon
    ? exchange.winnerAfter
    : exchange.loserAfter;
  const opponentBefore = attackerWon
    ? exchange.loserBefore
    : exchange.winnerBefore;
  const opponentAfter = attackerWon
    ? exchange.loserAfter
    : exchange.winnerAfter;

  return {
    rated: true,
    kFactor: exchange.kFactor,
    playerBefore: attackerBefore,
    playerAfter: attackerAfter,
    playerDelta: attackerAfter - attackerBefore,
    opponentBefore,
    opponentAfter,
    opponentDelta: opponentAfter - opponentBefore,
  };
}

function incrementDailyOpponentCount(db, userId) {
  if (!userId) return;
  const now = toRecordedIso();
  const today = now.slice(0, 10);
  db.prepare(
    `UPDATE arena_profiles
     SET dailyOpponentCount = CASE
       WHEN substr(COALESCE(lastOpponentDate, ''), 1, 10) = ? THEN dailyOpponentCount + 1
       ELSE 1
     END,
     lastOpponentDate = ?
     WHERE userId = ?`,
  ).run(today, now, userId);
}

function resetDailyOpponentCount(db, userId) {
  if (!userId) return;
  db.prepare(
    `UPDATE arena_profiles
     SET dailyOpponentCount = 0, lastOpponentDate = NULL
     WHERE userId = ?`,
  ).run(userId);
}

function getNpcTemplateForLevel(npcLevel) {
  for (const t of NPC_TEMPLATES) {
    if (npcLevel <= t.levelMax) return t;
  }
  return NPC_TEMPLATES[NPC_TEMPLATES.length - 1];
}

/**
 * Builds an NPC opponent scaled to the player's level.
 * NPCs use a pseudo-random MAL card, templated stats, and no real equipment/skill-tree.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {number} [playerLevel=1] - Player's current level (NPC level matches this, capped at 70).
 * @returns {Promise<Object>} NPC profile object with `isNpc: true`.
 */
async function buildNpcOpponent(db, playerLevel = 1) {
  const npcLevel = Math.max(1, Math.min(playerLevel, 70));
  const template = getNpcTemplateForLevel(npcLevel);

  const malCard = await drawArenaCard(db);
  const npcCard = createDrawnCard(malCard, {
    rarity: template.rarity,
    ivMin: template.ivRange.min,
    ivMax: template.ivRange.max,
  });

  const levelDelta = npcLevel - 1;
  const baseStats = {
    hp: BASE_PROFILE.hp + LEVEL_UP_GAINS.hp * levelDelta,
    power: BASE_PROFILE.power + LEVEL_UP_GAINS.power * levelDelta,
    guard: BASE_PROFILE.guard + LEVEL_UP_GAINS.guard * levelDelta,
    speed: BASE_PROFILE.speed + LEVEL_UP_GAINS.speed * levelDelta,
    effectHit: BASE_PROFILE.effectHit + LEVEL_UP_GAINS.effectHit * levelDelta,
  };

  return {
    userId: `npc:${template.id}`,
    level: npcLevel,
    xp: 0,
    coins: 0,
    wins: 0,
    losses: 0,
    winStreak: 0,
    hp: Math.floor(baseStats.hp * template.statScale),
    power: Math.floor(baseStats.power * template.statScale),
    guard: Math.floor(baseStats.guard * template.statScale),
    speed: Math.floor(baseStats.speed * template.statScale),
    effectHit: Math.floor(baseStats.effectHit * template.statScale),
    lifetimeCoinsEarned: 0,
    eloRating: 600 + Math.floor(Math.random() * 400) + (npcLevel - 1) * 10,
    eloMatches: 0,
    peakElo: ELO_DEFAULT_RATING,
    selectedCard: npcCard,
    lastCardDrawDate: getCurrentRecordedDate(),
    effects: normalizeArenaEffects(ARENA_EFFECT_DEFAULTS),
    lastFightAt: null,
    createdAt: null,
    updatedAt: null,
    isNpc: true,
    displayName: template.displayName,
    npcEquipmentBonus: template.equipmentBonus,
  };
}

async function selectOpponentForFight(db, userId) {
  const player = ensureArenaProfile(db, userId);

  // Levels 1-4 only fight NPCs
  if (player.level < 5) {
    const npc = await buildNpcOpponent(db, player.level);
    return { profile: npc, isNpc: true, displayName: npc.displayName };
  }

  const realOpponent = chooseEloOpponent(db, userId);

  if (realOpponent) {
    const user = db
      .prepare("SELECT username FROM users WHERE id = ?")
      .get(realOpponent.userId);
    return {
      profile: realOpponent,
      isNpc: false,
      displayName: user?.username || "Anonymous Challenger",
    };
  }

  // Fall back to NPC if no real opponent available
  const npc = await buildNpcOpponent(db, player.level);
  return { profile: npc, isNpc: true, displayName: npc.displayName };
}

/**
 * Simulates a full arena fight — turn-by-turn combat between two combatants
 * with passives, consumables, elemental effectiveness, and ELO outcome.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {Object} input
 * @param {Object} input.player             - Player combat snapshot (from loadCombatSnapshot).
 * @param {Object} input.opponent           - Opponent combat snapshot.
 * @param {Object} [input.playerEffects]    - Raw player consumable effects.
 * @param {Object} [input.opponentEffects]  - Raw opponent consumable effects.
 * @param {Function} [input.randomFn=Math.random]
 * @returns {Promise<{ rounds: Object[], battle: Object, playerRoundsWon: number, opponentRoundsWon: number, xpRoundsWon: number, playerRarity: string, playerCard: Object|null, playerWon: boolean, passiveRewardBonus: Object, eloResult: Object|null, effectUsage: Object, oppEffectUsage: Object, playerMaxLevelOverflowCoins: number }>}
 */
async function simulateFight(db, input) {
  const { player, opponent, playerEffects: rawEffects, opponentEffects: rawOppEffects, randomFn = Math.random } = input;
  const playerEffects = normalizeArenaEffects(rawEffects || {});
  const opponentEffects = normalizeArenaEffects(rawOppEffects || {});

  if (!player.selectedCard) {
    throw new ArenaHttpError(
      409,
      "Draw a card to start fighting.",
      "ARENA_CARD_REQUIRED",
    );
  }

  if (!opponent.selectedCard) {
    throw new ArenaHttpError(
      409,
      "No valid opponent card available.",
      "ARENA_OPPONENT_CARD_MISSING",
    );
  }

  let playerCard = player.selectedCard;
  let playerRarity = player.rarity;
  const playerTotalStats = { ...player.totalStats };
  let opponentCard = opponent.selectedCard;
  let opponentRarity = opponent.rarity;
  const playerName = toCombatName(playerCard.title, "Player");
  const opponentName = toCombatName(opponentCard.title, "Opponent");

  const playerElement = ELEMENTS.includes(playerCard.element) ? playerCard.element : null;
  const opponentElement = ELEMENTS.includes(opponentCard.element) ? opponentCard.element : null;

  function getElementEffectiveness(attackerElement, defenderElement) {
    if (!attackerElement || !defenderElement) return null;
    if (!ELEMENT_EFFECTIVENESS[attackerElement] || !ELEMENT_EFFECTIVENESS[attackerElement][defenderElement]) return null;
    const mult = ELEMENT_EFFECTIVENESS[attackerElement][defenderElement];
    if (mult > 1.0) return "super-effective";
    if (mult < 1.0) return "not-very-effective";
    return null;
  }

  const playerVsOpponentEffectiveness = getElementEffectiveness(playerElement, opponentElement);
  const opponentVsPlayerEffectiveness = getElementEffectiveness(opponentElement, playerElement);

  const effectUsage = {
    usedRerollKeepHigher: false,
    usedUpgradeLowest: false,
    usedGuaranteeSsrPlus: false,
    usedFightStartShield: false,
    usedEvadeBoost: false,
    usedFirstHitTrueDamage: false,
    usedHigherRarityBonus: false,
    usedDoublePassiveTrigger: false,
    usedDamageBoost: false,
    usedSpeedBoost: false,
    usedDeathSave: false,
    usedStatSteroid: false,
    usedMatchRarity: false,
    usedVampiricHeal: false,
    usedCritChanceBoost: false,
    usedGuardBoost: false,
    usedFirstAttackDouble: false,
    usedSelfRevive: false,
    usedIvBoost: false,
  };

  const oppEffectUsage = {
    usedFightStartShield: false,
    usedEvadeBoost: false,
    usedFirstHitTrueDamage: false,
    usedHigherRarityBonus: false,
    usedDoublePassiveTrigger: false,
    usedDamageBoost: false,
    usedSpeedBoost: false,
    usedDeathSave: false,
    usedStatSteroid: false,
    usedMatchRarity: false,
    usedVampiricHeal: false,
    usedCritChanceBoost: false,
    usedGuardBoost: false,
    usedFirstAttackDouble: false,
    usedSelfRevive: false,
    usedIvBoost: false,
  };

  // ---- New consumable effects applied at fight start ----

  if (playerEffects.damageBoostFightsRemaining > 0 && playerEffects.damageBoostPct > 0) {
    effectUsage.usedDamageBoost = true;
  }

  if (playerEffects.speedBoostFightsRemaining > 0 && playerEffects.speedBoostPct > 0) {
    playerTotalStats.speed = Math.floor(playerTotalStats.speed * (1 + playerEffects.speedBoostPct / 100));
    effectUsage.usedSpeedBoost = true;
  }

  if (playerEffects.statSteroidFightsRemaining > 0 && playerEffects.statSteroidPct > 0) {
    const pct = 1 + playerEffects.statSteroidPct / 100;
    playerTotalStats.power = Math.floor(playerTotalStats.power * pct);
    playerTotalStats.guard = Math.floor(playerTotalStats.guard * pct);
    playerTotalStats.speed = Math.floor(playerTotalStats.speed * pct);
    playerTotalStats.effectHit = Math.floor(playerTotalStats.effectHit * pct);
    effectUsage.usedStatSteroid = true;
  }

  if (playerEffects.guardBoostFightsRemaining > 0 && playerEffects.guardBoostPct > 0) {
    playerTotalStats.guard = Math.floor(playerTotalStats.guard * (1 + playerEffects.guardBoostPct / 100));
    effectUsage.usedGuardBoost = true;
  }

  if (playerEffects.critChanceBoostFightsRemaining > 0 && playerEffects.critChanceBoostPct > 0) {
    effectUsage.usedCritChanceBoost = true;
  }

  if (playerEffects.ivBoostCharges > 0) {
    const boostedCard = { ...playerCard, iv: { ...playerCard.iv } };
    const ivStats = ["power", "guard", "speed", "effectHit"];
    const totalBoost = 5;
    for (let i = 0; i < totalBoost; i++) {
      const stat = ivStats[Math.floor(randomFn() * ivStats.length)];
      boostedCard.iv[stat] = Math.min((boostedCard.iv[stat] || 0) + 1, CARD_IV_MAX);
    }
    boostedCard.iv.total = ivStats.reduce((s, k) => s + (boostedCard.iv[k] || 0), 0);

    const origCardStats = cardIvStatBonus(playerCard);
    const boostedCardStats = cardIvStatBonus(boostedCard);
    const statDelta = (key) => (boostedCardStats[key] || 0) - (origCardStats[key] || 0);

    playerTotalStats.hp += statDelta("hp");
    playerTotalStats.power += statDelta("power");
    playerTotalStats.guard += statDelta("guard");
    playerTotalStats.speed += statDelta("speed");
    playerTotalStats.effectHit += statDelta("effectHit");

    playerCard = boostedCard;
    effectUsage.usedIvBoost = true;
  }

  if (playerEffects.matchRarityCharges > 0) {
    const oppRank = rarityRank(opponentRarity);
    const playerRank = rarityRank(playerRarity);
    if (oppRank > playerRank) {
      playerRarity = opponentRarity;
    }
    effectUsage.usedMatchRarity = true;
  }

  if (playerEffects.vampiricHealFightsRemaining > 0 && playerEffects.vampiricHealPct > 0) {
    effectUsage.usedVampiricHeal = true;
  }

  // ---- End new consumable effects ----

  // ---- Opponent consumable effects applied at fight start ----

  if (opponentEffects.damageBoostFightsRemaining > 0 && opponentEffects.damageBoostPct > 0) {
    oppEffectUsage.usedDamageBoost = true;
  }

  if (opponentEffects.speedBoostFightsRemaining > 0 && opponentEffects.speedBoostPct > 0) {
    opponent.totalStats.speed = Math.floor(opponent.totalStats.speed * (1 + opponentEffects.speedBoostPct / 100));
    oppEffectUsage.usedSpeedBoost = true;
  }

  if (opponentEffects.statSteroidFightsRemaining > 0 && opponentEffects.statSteroidPct > 0) {
    const pct = 1 + opponentEffects.statSteroidPct / 100;
    opponent.totalStats.power = Math.floor(opponent.totalStats.power * pct);
    opponent.totalStats.guard = Math.floor(opponent.totalStats.guard * pct);
    opponent.totalStats.speed = Math.floor(opponent.totalStats.speed * pct);
    opponent.totalStats.effectHit = Math.floor(opponent.totalStats.effectHit * pct);
    oppEffectUsage.usedStatSteroid = true;
  }

  if (opponentEffects.guardBoostFightsRemaining > 0 && opponentEffects.guardBoostPct > 0) {
    opponent.totalStats.guard = Math.floor(opponent.totalStats.guard * (1 + opponentEffects.guardBoostPct / 100));
    oppEffectUsage.usedGuardBoost = true;
  }

  if (opponentEffects.critChanceBoostFightsRemaining > 0 && opponentEffects.critChanceBoostPct > 0) {
    oppEffectUsage.usedCritChanceBoost = true;
  }

  if (opponentEffects.ivBoostCharges > 0) {
    const boostedCard = { ...opponentCard, iv: { ...opponentCard.iv } };
    const ivStats = ["power", "guard", "speed", "effectHit"];
    const totalBoost = 5;
    for (let i = 0; i < totalBoost; i++) {
      const stat = ivStats[Math.floor(randomFn() * ivStats.length)];
      boostedCard.iv[stat] = Math.min((boostedCard.iv[stat] || 0) + 1, CARD_IV_MAX);
    }
    boostedCard.iv.total = ivStats.reduce((s, k) => s + (boostedCard.iv[k] || 0), 0);

    const origCardStats = cardIvStatBonus(opponentCard);
    const boostedCardStats = cardIvStatBonus(boostedCard);
    const statDelta = (key) => (boostedCardStats[key] || 0) - (origCardStats[key] || 0);

    opponent.totalStats.hp += statDelta("hp");
    opponent.totalStats.power += statDelta("power");
    opponent.totalStats.guard += statDelta("guard");
    opponent.totalStats.speed += statDelta("speed");
    opponent.totalStats.effectHit += statDelta("effectHit");

    opponentCard = boostedCard;
    oppEffectUsage.usedIvBoost = true;
  }

  if (opponentEffects.matchRarityCharges > 0) {
    const playerRank = rarityRank(playerRarity);
    const oppRank = rarityRank(opponentRarity);
    if (playerRank > oppRank) {
      opponentRarity = playerRarity;
    }
    oppEffectUsage.usedMatchRarity = true;
  }

  if (opponentEffects.vampiricHealFightsRemaining > 0 && opponentEffects.vampiricHealPct > 0) {
    oppEffectUsage.usedVampiricHeal = true;
  }

  // ---- End opponent consumable effects ----

  const playerRuntime = buildPassiveRuntime();
  const opponentRuntime = buildPassiveRuntime();
  const playerPassives = Array.isArray(player.activePassives) ? player.activePassives : [];
  const opponentPassives = Array.isArray(opponent.activePassives)
    ? opponent.activePassives
    : [];
  const passiveChanceMultiplier = playerEffects.doublePassiveTriggerFightsRemaining > 0 ? 2 : 1;
  const opponentPassiveChanceMultiplier = opponentEffects.doublePassiveTriggerFightsRemaining > 0 ? 2 : 1;
  effectUsage.usedDoublePassiveTrigger =
    playerEffects.doublePassiveTriggerFightsRemaining > 0;
  oppEffectUsage.usedDoublePassiveTrigger =
    opponentEffects.doublePassiveTriggerFightsRemaining > 0;

  if (playerEffects.fightStartShieldCharges > 0 && playerEffects.fightStartShieldAmount > 0) {
    playerRuntime.shield += playerEffects.fightStartShieldAmount;
    effectUsage.usedFightStartShield = true;
  }

  if (opponentEffects.fightStartShieldCharges > 0 && opponentEffects.fightStartShieldAmount > 0) {
    opponentRuntime.shield += opponentEffects.fightStartShieldAmount;
    oppEffectUsage.usedFightStartShield = true;
  }

  if (playerEffects.evadeBoostFightsRemaining > 0 && playerEffects.evadeBoostPct > 0) {
    playerRuntime.evasionPct += playerEffects.evadeBoostPct;
    effectUsage.usedEvadeBoost = true;
  }

  if (opponentEffects.evadeBoostFightsRemaining > 0 && opponentEffects.evadeBoostPct > 0) {
    opponentRuntime.evasionPct += opponentEffects.evadeBoostPct;
    oppEffectUsage.usedEvadeBoost = true;
  }

  const playerHpPct = player.equipmentPctStats?.hpPct || 0;
  const opponentHpPct = opponent.equipmentPctStats?.hpPct || 0;
  const provisionalPlayerMaxHp = computeMaxHp(playerTotalStats, playerHpPct);
  const provisionalOpponentMaxHp = computeMaxHp(opponent.totalStats, opponentHpPct);
  const fightStartContextPlayer = {
    self: { hp: provisionalPlayerMaxHp, maxHp: provisionalPlayerMaxHp },
    opponent: { hp: provisionalOpponentMaxHp, maxHp: provisionalOpponentMaxHp },
    attack: { turn: 0, isFirstActor: false, critical: false },
  };
  runPassivesForTrigger({
    trigger: "onFightStart",
    passives: playerPassives,
    selfStats: playerTotalStats,
    opponentStats: opponent.totalStats,
    selfRuntime: playerRuntime,
    opponentRuntime,
    context: fightStartContextPlayer,
    randomFn,
    passiveChanceMultiplier,
  });
  runPassivesForTrigger({
    trigger: "onFightStart",
    passives: opponentPassives,
    selfStats: opponent.totalStats,
    opponentStats: playerTotalStats,
    selfRuntime: opponentRuntime,
    opponentRuntime: playerRuntime,
    context: {
      self: { hp: provisionalOpponentMaxHp, maxHp: provisionalOpponentMaxHp },
      opponent: { hp: provisionalPlayerMaxHp, maxHp: provisionalPlayerMaxHp },
      attack: { turn: 0, isFirstActor: false, critical: false },
    },
    randomFn,
    passiveChanceMultiplier: opponentPassiveChanceMultiplier,
  });

  const turns = [];
  const battleConsole = [];
  const maxPlayerHp = computeMaxHp(playerTotalStats, playerHpPct);
  const maxOpponentHp = computeMaxHp(opponent.totalStats, opponentHpPct);
  let playerHp = maxPlayerHp;
  let opponentHp = maxOpponentHp;
  let turnCounter = 0;

  const pushConsole = (line) => {
    battleConsole.push({
      line,
      playerHp,
      opponentHp,
      turn: turnCounter,
    });
  };

  if (playerRuntime.shield > 0) {
    pushConsole(`${playerName} starts with a shield of ${playerRuntime.shield}`);
  }
  if (opponentRuntime.shield > 0) {
    pushConsole(`${opponentName} starts with a shield of ${opponentRuntime.shield}`);
  }
  const initialShield = {
    player: playerRuntime.shield,
    opponent: opponentRuntime.shield,
  };

  const hasHigherRarityBonus =
    playerEffects.higherRarityDamageBonusPctCharges > 0 &&
    rarityRank(playerRarity) < rarityRank(opponentRarity);
  effectUsage.usedHigherRarityBonus = hasHigherRarityBonus;

  const hasOpponentHigherRarityBonus =
    opponentEffects.higherRarityDamageBonusPctCharges > 0 &&
    rarityRank(opponentRarity) < rarityRank(playerRarity);
  oppEffectUsage.usedHigherRarityBonus = hasOpponentHigherRarityBonus;

  let firstHitBombConsumed = false;
  let opponentFirstHitBombConsumed = false;
  // "First attack of the fight" = the first landed hit each side deals, not
  // literally turn 1 (which only the speed-roll winner ever reaches). improve.md §11.
  let playerHasLandedAttack = false;
  let opponentHasLandedAttack = false;

  const runAttack = (attackerSide, firstActor) => {
    if (playerHp <= 0 || opponentHp <= 0) return;
    turnCounter += 1;

    const attackerIsPlayer = attackerSide === "player";
    const attackerName = attackerIsPlayer ? playerName : opponentName;
    const defenderName = attackerIsPlayer ? opponentName : playerName;
    const attackerStats = attackerIsPlayer ? playerTotalStats : opponent.totalStats;
    const defenderStats = attackerIsPlayer ? opponent.totalStats : playerTotalStats;
    const attackerRarity = attackerIsPlayer ? playerRarity : opponentRarity;
    const defenderRarity = attackerIsPlayer ? opponentRarity : playerRarity;
    const attackerElement = attackerIsPlayer ? playerElement : opponentElement;
    const attackerRuntime = attackerIsPlayer ? playerRuntime : opponentRuntime;
    const defenderRuntime = attackerIsPlayer ? opponentRuntime : playerRuntime;
    const attackerPassives = attackerIsPlayer ? playerPassives : opponentPassives;
    const defenderPassives = attackerIsPlayer ? opponentPassives : playerPassives;
    const attackerHp = attackerIsPlayer ? playerHp : opponentHp;
    const defenderHp = attackerIsPlayer ? opponentHp : playerHp;
    const attackerMaxHp = attackerIsPlayer ? maxPlayerHp : maxOpponentHp;
    const defenderMaxHp = attackerIsPlayer ? maxOpponentHp : maxPlayerHp;

    pushConsole(`${attackerName} is attacking ${defenderName}`);

    const onAttackMods = runPassivesForTrigger({
      trigger: "onAttack",
      passives: attackerPassives,
      selfStats: attackerStats,
      opponentStats: defenderStats,
      selfRuntime: attackerRuntime,
      opponentRuntime: defenderRuntime,
      context: {
        self: {
          hp: attackerHp,
          maxHp: attackerMaxHp,
          hpPct: attackerMaxHp > 0 ? (attackerHp / attackerMaxHp) * 100 : 0,
          stats: attackerStats,
        },
        defender: {
          hp: defenderHp,
          maxHp: defenderMaxHp,
          hpPct: defenderMaxHp > 0 ? (defenderHp / defenderMaxHp) * 100 : 0,
          stats: defenderStats,
        },
        attack: {
          turn: turnCounter,
          isFirstActor: firstActor,
          critical: false,
          elementEffective: attackerIsPlayer ? playerVsOpponentEffectiveness : opponentVsPlayerEffectiveness,
        },
      },
      randomFn,
      passiveChanceMultiplier: attackerIsPlayer ? passiveChanceMultiplier : opponentPassiveChanceMultiplier,
    });

    const pendingTrueDamage =
      attackerIsPlayer
        ? (playerEffects.firstHitTrueDamageCharges > 0 && !firstHitBombConsumed
            ? playerEffects.firstHitTrueDamageValue
            : 0)
        : (opponentEffects.firstHitTrueDamageCharges > 0 && !opponentFirstHitBombConsumed
            ? opponentEffects.firstHitTrueDamageValue
            : 0);

    // Apply equipment percentage stats
    const attackerPct = attackerIsPlayer ? (player.equipmentPctStats || {}) : (opponent.equipmentPctStats || {});
    const defenderPct = attackerIsPlayer ? (opponent.equipmentPctStats || {}) : (player.equipmentPctStats || {});
    onAttackMods.attackDamagePct += attackerPct.dmgPct || 0;
    onAttackMods.bonusCritChancePct += attackerPct.critChancePct || 0;
    const equipmentCritDmgPct = attackerPct.critDmgPct || 0;
    const equipmentDefendPct = defenderPct.defendPct || 0;

    if (attackerIsPlayer && hasHigherRarityBonus) {
      onAttackMods.attackDamagePct += playerEffects.higherRarityDamageBonusPct;
    }
    if (!attackerIsPlayer && hasOpponentHigherRarityBonus) {
      onAttackMods.attackDamagePct += opponentEffects.higherRarityDamageBonusPct;
    }

    if (attackerIsPlayer && playerEffects.damageBoostFightsRemaining > 0 && playerEffects.damageBoostPct > 0) {
      onAttackMods.attackDamagePct += playerEffects.damageBoostPct;
      effectUsage.usedDamageBoost = true;
    }
    if (!attackerIsPlayer && opponentEffects.damageBoostFightsRemaining > 0 && opponentEffects.damageBoostPct > 0) {
      onAttackMods.attackDamagePct += opponentEffects.damageBoostPct;
      oppEffectUsage.usedDamageBoost = true;
    }

    if (attackerIsPlayer && playerEffects.critChanceBoostFightsRemaining > 0 && playerEffects.critChanceBoostPct > 0) {
      onAttackMods.bonusCritChancePct += playerEffects.critChanceBoostPct;
      effectUsage.usedCritChanceBoost = true;
    }
    if (!attackerIsPlayer && opponentEffects.critChanceBoostFightsRemaining > 0 && opponentEffects.critChanceBoostPct > 0) {
      onAttackMods.bonusCritChancePct += opponentEffects.critChanceBoostPct;
      oppEffectUsage.usedCritChanceBoost = true;
    }

    const activeTempGuard =
      defenderRuntime.tempGuard.remainingHits > 0
        ? defenderRuntime.tempGuard.amount
        : 0;
    const effectiveDefenderStats =
      activeTempGuard > 0
        ? {
            ...defenderStats,
            guard: toInt(defenderStats.guard, 0) + activeTempGuard,
          }
        : defenderStats;

    const elementMult = attackerIsPlayer
      ? (ELEMENT_EFFECTIVENESS[playerElement]?.[opponentElement] ?? 1)
      : (ELEMENT_EFFECTIVENESS[opponentElement]?.[playerElement] ?? 1);
    let effectiveElementMult = elementMult;
    if (elementMult > 1.0) {
      effectiveElementMult = computeElementMultiplier(
        elementMult,
        attackerStats,
        defenderStats,
        defenderRuntime?.reduceElementEffectivenessPct,
      );
    }

    const outcome = calculateAttackOutcome({
      attackerStats,
      defenderStats: effectiveDefenderStats,
      attackerRarity,
      attackerLevel: attackerIsPlayer ? player.level : opponent.level,
      defenderRarity,
      defenderLevel: attackerIsPlayer ? opponent.level : player.level,
      bonusCritChancePct: onAttackMods.bonusCritChancePct,
      attackerDamageFlat: onAttackMods.attackDamageFlat,
      // Acting second is a tempo disadvantage — compensate it with a flat
      // damage bump for that exchange (improve.md §9).
      attackerDamagePct:
        onAttackMods.attackDamagePct + (firstActor ? 0 : SECOND_ACTOR_DAMAGE_PCT),
      attackerTrueDamage: pendingTrueDamage,
      defenderDamageReductionPct: equipmentDefendPct,
      extraDefenderEvasionPct: defenderRuntime.evasionPct,
      baseCritMultiplier: 1.0 + equipmentCritDmgPct / 100,
      elementMult: effectiveElementMult,
      randomFn,
    });

    if (outcome.avoided) {
      consumeTempGuard(defenderRuntime);
      pushConsole(`${defenderName} avoided the attack`);
      turns.push({
        turn: turnCounter,
        attacker: attackerSide,
        attackerName,
        defender: attackerIsPlayer ? "opponent" : "player",
        defenderName,
        attackerRarity,
        avoided: true,
        critical: false,
        damage: 0,
        playerHp,
        opponentHp,
        playerShield: playerRuntime.shield,
        opponentShield: opponentRuntime.shield,
        elementEffective: attackerIsPlayer ? playerVsOpponentEffectiveness : opponentVsPlayerEffectiveness,
        elementAttacker: attackerElement,
      });
      return;
    }

    // Apply element effectiveness multiplier to damage
    outcome.damage = Math.max(1, Math.floor(outcome.damage * effectiveElementMult));

    let firstAttackDoubled = false;
    if (attackerIsPlayer && !playerHasLandedAttack) {
      playerHasLandedAttack = true;
      if (playerEffects.firstAttackDoubleCharges > 0) {
        outcome.damage *= 2;
        firstAttackDoubled = true;
        effectUsage.usedFirstAttackDouble = true;
      }
    }
    if (!attackerIsPlayer && !opponentHasLandedAttack) {
      opponentHasLandedAttack = true;
      if (opponentEffects.firstAttackDoubleCharges > 0) {
        outcome.damage *= 2;
        firstAttackDoubled = true;
        oppEffectUsage.usedFirstAttackDouble = true;
      }
    }

    if (pendingTrueDamage > 0) {
      if (attackerIsPlayer) {
        firstHitBombConsumed = true;
        effectUsage.usedFirstHitTrueDamage = true;
      } else {
        opponentFirstHitBombConsumed = true;
        oppEffectUsage.usedFirstHitTrueDamage = true;
      }
    }

    consumeTempGuard(defenderRuntime);

    const onDamageTakenMods = runPassivesForTrigger({
      trigger: "onDamageTaken",
      passives: defenderPassives,
      selfStats: defenderStats,
      opponentStats: attackerStats,
      selfRuntime: defenderRuntime,
      opponentRuntime: attackerRuntime,
      context: {
        self: {
          hp: defenderHp,
          maxHp: defenderMaxHp,
          hpPct: defenderMaxHp > 0 ? (defenderHp / defenderMaxHp) * 100 : 0,
          stats: defenderStats,
        },
        opponent: {
          hp: attackerHp,
          maxHp: attackerMaxHp,
          hpPct: attackerMaxHp > 0 ? (attackerHp / attackerMaxHp) * 100 : 0,
          stats: attackerStats,
        },
        attack: {
          turn: turnCounter,
          isFirstActor: firstActor,
          critical: outcome.critical,
        },
      },
      randomFn,
      passiveChanceMultiplier: attackerIsPlayer ? opponentPassiveChanceMultiplier : passiveChanceMultiplier,
    });

    if (outcome.critical && defenderRuntime.cancelCriticalCharges > 0) {
      defenderRuntime.cancelCriticalCharges -= 1;
      outcome.critical = false;
      outcome.damage = Math.max(1, Math.floor(outcome.damage / (outcome.baseCritMultiplier || 1.0)));
      pushConsole(`${defenderName} nullified a critical hit`);
    }

    let finalDamage = outcome.damage;
    const takenDivisor = 1 + Number(onDamageTakenMods.damageReductionPct || 0) / 100;
    finalDamage = Math.floor(finalDamage / takenDivisor);
    finalDamage -= toInt(onDamageTakenMods.damageReductionFlat, 0);
    finalDamage = Math.max(1, finalDamage);

    const onDamageDealtMods = runPassivesForTrigger({
      trigger: "onDamageDealt",
      passives: attackerPassives,
      selfStats: attackerStats,
      opponentStats: defenderStats,
      selfRuntime: attackerRuntime,
      opponentRuntime: defenderRuntime,
      context: {
        self: {
          hp: attackerHp,
          maxHp: attackerMaxHp,
          hpPct: attackerMaxHp > 0 ? (attackerHp / attackerMaxHp) * 100 : 0,
          stats: attackerStats,
        },
        defender: {
          hp: defenderHp,
          maxHp: defenderMaxHp,
          hpPct: defenderMaxHp > 0 ? (defenderHp / defenderMaxHp) * 100 : 0,
          stats: defenderStats,
        },
        attack: {
          turn: turnCounter,
          isFirstActor: firstActor,
          critical: outcome.critical,
        },
      },
      randomFn,
      passiveChanceMultiplier: attackerIsPlayer ? passiveChanceMultiplier : opponentPassiveChanceMultiplier,
    });

    finalDamage += toInt(onDamageDealtMods.attackDamageFlat, 0);
    finalDamage = Math.floor(
      finalDamage * (1 + Number(onDamageDealtMods.attackDamagePct || 0) / 100),
    );

    if (onDamageDealtMods.extraStrikeChancePct > 0) {
      const bonusStrike = Math.max(
        1,
        Math.floor(finalDamage * (Number(onDamageDealtMods.extraStrikeDamagePct || 0) / 100)),
      );
      finalDamage += bonusStrike;
      pushConsole(`${attackerName} triggered an extra strike for ${bonusStrike} HP`);
    }

    finalDamage = Math.min(
      finalDamage,
      Math.max(1, Math.floor((outcome.damageBase || 1) * MAX_COMBINED_DAMAGE_MULTIPLIER)),
    );

    finalDamage += Math.max(toInt(outcome.trueDamage, 0), 0);

    let piercedShieldDamage = 0;
    if (defenderRuntime.shield > 0 && finalDamage > 0) {
      const shieldPiercePct = computeShieldPiercePct(attackerStats);
      piercedShieldDamage = Math.floor(finalDamage * (shieldPiercePct / 100));
      finalDamage -= piercedShieldDamage;
      if (piercedShieldDamage > 0) {
        pushConsole(`${attackerName} pierced ${piercedShieldDamage} HP through the shield`);
      }
    }

    if (defenderRuntime.shield > 0) {
      const absorbed = Math.min(defenderRuntime.shield, finalDamage);
      defenderRuntime.shield -= absorbed;
      finalDamage -= absorbed;
      if (absorbed > 0) {
        pushConsole(`${defenderName}'s shield absorbed ${absorbed} HP`);
      }
    }
    finalDamage += piercedShieldDamage;

    finalDamage = Math.max(0, finalDamage);

    if (attackerIsPlayer) {
      opponentHp = Math.max(0, opponentHp - finalDamage);
      // Player's vampiric heal (attacker heals)
      if (playerEffects.vampiricHealFightsRemaining > 0 && playerEffects.vampiricHealPct > 0 && finalDamage > 0) {
        const heal = Math.floor(finalDamage * (playerEffects.vampiricHealPct / 100));
        if (heal > 0) {
          playerHp = Math.min(maxPlayerHp, playerHp + heal);
          pushConsole(`${playerName} healed ${heal} HP`);
        }
        effectUsage.usedVampiricHeal = true;
      }
      // Opponent's death save and self-revive (defender saves)
      if (opponentHp <= 0 && opponentEffects.deathSaveCharges > 0 && !oppEffectUsage.usedDeathSave) {
        opponentHp = 1;
        oppEffectUsage.usedDeathSave = true;
        pushConsole(`${opponentName} survived KO with 1 HP (Phoenix Feather)`);
      }
      if (opponentHp <= 0 && opponentEffects.selfReviveCharges > 0 && opponentEffects.selfReviveHpThresholdPct > 0 && !oppEffectUsage.usedSelfRevive) {
        opponentHp = computeReviveHp(maxOpponentHp, opponentEffects.selfReviveHpThresholdPct);
        oppEffectUsage.usedSelfRevive = true;
        pushConsole(`${opponentName} revived to ${opponentHp} HP (Chrono Vial)`);
      }
    } else {
      playerHp = Math.max(0, playerHp - finalDamage);
      // Opponent's vampiric heal (attacker heals)
      if (opponentEffects.vampiricHealFightsRemaining > 0 && opponentEffects.vampiricHealPct > 0 && finalDamage > 0) {
        const heal = Math.floor(finalDamage * (opponentEffects.vampiricHealPct / 100));
        if (heal > 0) {
          opponentHp = Math.min(maxOpponentHp, opponentHp + heal);
          pushConsole(`${opponentName} healed ${heal} HP`);
        }
        oppEffectUsage.usedVampiricHeal = true;
      }
      // Player's death save and self-revive (defender saves)
      if (playerHp <= 0 && playerEffects.deathSaveCharges > 0 && !effectUsage.usedDeathSave) {
        playerHp = 1;
        effectUsage.usedDeathSave = true;
        pushConsole(`${playerName} survived KO with 1 HP (Phoenix Feather)`);
      }
      if (playerHp <= 0 && playerEffects.selfReviveCharges > 0 && playerEffects.selfReviveHpThresholdPct > 0 && !effectUsage.usedSelfRevive) {
        playerHp = computeReviveHp(maxPlayerHp, playerEffects.selfReviveHpThresholdPct);
        effectUsage.usedSelfRevive = true;
        pushConsole(`${playerName} revived to ${playerHp} HP (Chrono Vial)`);
      }
    }

    const healAmount = Math.max(toInt(onDamageTakenMods.healFlat, 0), 0);
    if (healAmount > 0) {
      if (attackerIsPlayer && opponentHp > 0) {
        const before = opponentHp;
        opponentHp = Math.min(maxOpponentHp, opponentHp + healAmount);
        if (opponentHp > before) {
          pushConsole(`${defenderName} recovered ${opponentHp - before} HP`);
        }
      } else if (!attackerIsPlayer && playerHp > 0) {
        const before = playerHp;
        playerHp = Math.min(maxPlayerHp, playerHp + healAmount);
        if (playerHp > before) {
          pushConsole(`${defenderName} recovered ${playerHp - before} HP`);
        }
      }
    }

    if (finalDamage > 0) {
      pushConsole(`${attackerName} dealt ${finalDamage} damage${outcome.critical ? " (CRIT)" : ""}`);
    } else {
      pushConsole(`${attackerName} dealt 0 damage`);
    }

    const reflect = Math.max(toInt(onDamageTakenMods.reflectFlatDamage, 0), 0);
    if (reflect > 0) {
      if (attackerIsPlayer) {
        playerHp = Math.max(0, playerHp - reflect);
      } else {
        opponentHp = Math.max(0, opponentHp - reflect);
      }
      pushConsole(`${defenderName} reflected ${reflect} HP`);
    }

    const counterPct = Math.max(Number(onDamageTakenMods.counterDamagePct || 0), 0);
    if (counterPct > 0 && finalDamage > 0) {
      const counterDamage = Math.max(1, Math.floor(finalDamage * (counterPct / 100)));
      if (attackerIsPlayer) {
        playerHp = Math.max(0, playerHp - counterDamage);
      } else {
        opponentHp = Math.max(0, opponentHp - counterDamage);
      }
      pushConsole(`${defenderName} countered for ${counterDamage} HP`);
    }

    turns.push({
      turn: turnCounter,
      attacker: attackerSide,
      attackerName,
      defender: attackerIsPlayer ? "opponent" : "player",
      defenderName,
      attackerRarity,
      avoided: false,
      critical: outcome.critical,
      damage: finalDamage,
      playerHp,
      opponentHp,
      playerShield: playerRuntime.shield,
      opponentShield: opponentRuntime.shield,
      elementEffective: attackerIsPlayer ? playerVsOpponentEffectiveness : opponentVsPlayerEffectiveness,
      elementAttacker: attackerElement,
    });
  };

  const maxTurns = 60;
  while (playerHp > 0 && opponentHp > 0 && turnCounter < maxTurns) {
    const playerActsFirst =
      playerTotalStats.speed + randomInt(0, TURN_ORDER_SPEED_JITTER, randomFn) >=
      opponent.totalStats.speed + randomInt(0, TURN_ORDER_SPEED_JITTER, randomFn);

    if (playerActsFirst) {
      runAttack("player", true);
      if (opponentHp <= 0) break;
      runAttack("opponent", false);
    } else {
      runAttack("opponent", true);
      if (playerHp <= 0) break;
      runAttack("player", false);
    }
  }

  let playerWon = false;
  if (playerHp <= 0 && opponentHp <= 0) {
    playerWon =
      resolveRoundWinner({
        playerPower: playerTotalStats.power,
        opponentPower: opponent.totalStats.power,
        playerSpeed: playerTotalStats.speed,
        opponentSpeed: opponent.totalStats.speed,
        randomFn,
      }) === "player";
    if (playerWon) {
      playerHp = Math.max(playerHp, 1);
      opponentHp = 0;
    } else {
      opponentHp = Math.max(opponentHp, 1);
      playerHp = 0;
    }
  } else if (opponentHp <= 0) {
    playerWon = true;
  } else if (playerHp <= 0) {
    playerWon = false;
  } else {
    const playerHpPctRemaining = maxPlayerHp > 0 ? playerHp / maxPlayerHp : 0;
    const opponentHpPctRemaining = maxOpponentHp > 0 ? opponentHp / maxOpponentHp : 0;
    playerWon =
      resolveRoundWinner({
        playerPower: playerHpPctRemaining,
        opponentPower: opponentHpPctRemaining,
        playerSpeed: playerTotalStats.speed,
        opponentSpeed: opponent.totalStats.speed,
        randomFn,
      }) === "player";
    if (playerWon) {
      opponentHp = 0;
    } else {
      playerHp = 0;
    }
  }

  if (playerWon) {
    runPassivesForTrigger({
      trigger: "onWin",
      passives: playerPassives,
      selfStats: playerTotalStats,
      opponentStats: opponent.totalStats,
      selfRuntime: playerRuntime,
      opponentRuntime,
      context: {
        self: { hp: playerHp, maxHp: maxPlayerHp, hpPct: (playerHp / maxPlayerHp) * 100 },
        opponent: {
          hp: opponentHp,
          maxHp: maxOpponentHp,
          hpPct: (opponentHp / maxOpponentHp) * 100,
        },
        attack: { turn: turnCounter, isFirstActor: false, critical: false },
      },
      randomFn,
      passiveChanceMultiplier,
    });
  } else {
    runPassivesForTrigger({
      trigger: "onLose",
      passives: playerPassives,
      selfStats: playerTotalStats,
      opponentStats: opponent.totalStats,
      selfRuntime: playerRuntime,
      opponentRuntime,
      context: {
        self: { hp: playerHp, maxHp: maxPlayerHp, hpPct: (playerHp / maxPlayerHp) * 100 },
        opponent: {
          hp: opponentHp,
          maxHp: maxOpponentHp,
          hpPct: (opponentHp / maxOpponentHp) * 100,
        },
        attack: { turn: turnCounter, isFirstActor: false, critical: false },
      },
      randomFn,
      passiveChanceMultiplier,
    });
  }

  const xpRoundsWon = clamp(4 - Math.ceil(turnCounter / 6), 1, 3);
  const winnerName = playerWon ? playerName : opponentName;
  pushConsole(`${winnerName} wins the battle`);

  return {
    rounds: turns,
    battle: {
      maxHp: {
        player: maxPlayerHp,
        opponent: maxOpponentHp,
      },
      finalHp: {
        player: playerHp,
        opponent: opponentHp,
      },
      initialShield,
      turns,
      console: battleConsole,
    },
    playerRoundsWon: playerWon ? 1 : 0,
    opponentRoundsWon: playerWon ? 0 : 1,
    xpRoundsWon,
    playerRarity,
    playerCard: playerCard ? normalizeSelectedCard(playerCard) : null,
    playerWon,
    passiveRewardBonus: {
      xpPct: playerRuntime.rewardBonusPct.xp,
      coinsPct: playerRuntime.rewardBonusPct.coins,
      rarityCoinPct: playerRuntime.rarityCoinBonusPct,
    },
    effectUsage,
    oppEffectUsage,
  };
}

async function runFight(db, userId) {
  await ensureArenaCardPool(db);

  const profile = ensureArenaProfile(db, userId);
  if (!profile.selectedCard) {
    throw new ArenaHttpError(
      409,
      "Draw a card to start.",
      "ARENA_CARD_REQUIRED",
    );
  }

  const preflightEffects = normalizeArenaEffects(profile.effects);
  assertFightCooldown(profile, { effects: preflightEffects, allowGateKey: true });

  const opponentSelection = await selectOpponentForFight(db, userId);
  const opponentState = loadFightOpponent(db, opponentSelection);
  const opponentProfile = opponentState.profile;

  const playerSnapshot = loadCombatSnapshot(db, profile);
  const opponentSnapshot = opponentState.snapshot;
  const opponentPreflightEffects = normalizeArenaEffects(opponentProfile.effects || {});
  const simulation = await simulateFight(db, {
    player: playerSnapshot,
    opponent: opponentSnapshot,
    playerEffects: preflightEffects,
    opponentEffects: opponentPreflightEffects,
  });

  const now = nowIso();
  const tx = db.transaction(() => {
    const current = ensureArenaProfile(db, userId);
    if (!current.selectedCard) {
      throw new ArenaHttpError(409, "Draw a card to start.", "ARENA_CARD_REQUIRED");
    }
    const effects = normalizeArenaEffects(current.effects);
    const cooldownResult = assertFightCooldown(current, {
      effects,
      allowGateKey: true,
    });

    const nextEffects = applyFightEffectUsage(effects, {
      ...simulation.effectUsage,
      usedGateKeyBypass: cooldownResult.bypassedWithGateKey,
    });
    const currentSnapshot = loadCombatSnapshot(db, current);
    const rarityCoinReward = getWonRoundRarityCoinReward(simulation);
    let baseXp = calculateWinXp(
      opponentSnapshot.profile.level,
      simulation.xpRoundsWon,
      current.winStreak,
    );
    baseXp = Math.floor(
      baseXp * (1 + Number(simulation?.passiveRewardBonus?.xpPct || 0) / 100),
    );
    let xpDelta = calculateLossXp(
      opponentSnapshot.profile.level,
      simulation.xpRoundsWon,
      current.winStreak,
    );
    let coinDelta = 0;

    if (simulation.playerWon) {
      let baseCoins = calculateWinCoins(
        opponentSnapshot.profile.level,
        rarityCoinReward,
        current.winStreak,
      );
      baseCoins = Math.floor(
        baseCoins * (1 + Number(simulation?.passiveRewardBonus?.coinsPct || 0) / 100),
      );
      const adjusted = consumeWinBoosts(nextEffects, baseXp, baseCoins);
      xpDelta = adjusted.xpGain;
      coinDelta = adjusted.coinGain;
      current.wins += 1;
      current.winStreak += 1;
      tryGrantBonusDraw(db, userId, nextEffects);
    } else {
      current.losses += 1;
      xpDelta = consumeWinBoosts(nextEffects, xpDelta, 0).xpGain;
      if (nextEffects.streakShieldCharges > 0) {
        nextEffects.streakShieldCharges -= 1;
      } else {
        current.winStreak = 0;
      }
    }

    // NPC fights pay less so PvP is the efficient path (they are also unrated).
    if (opponentSelection.isNpc) {
      xpDelta = Math.floor(xpDelta * NPC_REWARD_SCALE);
      coinDelta = Math.floor(coinDelta * NPC_REWARD_SCALE);
    }
    consumeFightBoostDurations(nextEffects);

    const materialDrops = [];

    current.xp += xpDelta;
    current.coins += coinDelta;
    current.lifetimeCoinsEarned += coinDelta;
    const levelsGained = applyLevelUps(current);
    const overflowCoinDelta = convertMaxLevelOverflowXp(current);
    coinDelta += overflowCoinDelta;

    const tutorialMilestone = current.tutorialComplete || 0;
    for (const milestone of [5, 8, 12, 16, 20]) {
      if (current.level >= milestone && tutorialMilestone < milestone) {
        current.coins += 2000;
        current.lifetimeCoinsEarned += 2000;
        current.tutorialComplete = milestone;
      }
    }

    current.effects = nextEffects;
    current.lastFightAt = now;
    current.updatedAt = now;

    db.prepare(
      `UPDATE arena_profiles
       SET level = ?,
           xp = ?,
           coins = ?,
           wins = ?,
           losses = ?,
           winStreak = ?,
           hp = ?,
           power = ?,
           guard = ?,
           speed = ?,
            effectHit = ?,
            lifetimeCoinsEarned = ?,
           effectsJson = ?,
           lastFightAt = ?,
           updatedAt = ?,
           tutorialComplete = ?
       WHERE userId = ?`,
    ).run(
      current.level,
      current.xp,
      current.coins,
      current.wins,
      current.losses,
      current.winStreak,
      current.hp,
      current.power,
      current.guard,
      current.speed,
      current.effectHit,
      current.lifetimeCoinsEarned,
      serializeEffects(current.effects),
      current.lastFightAt,
      current.updatedAt,
      current.tutorialComplete || 0,
      current.userId,
    );

    db.prepare(
      `INSERT INTO arena_fights (
        id,
        userId,
        opponentUserId,
        result,
        roundsJson,
        xpDelta,
        coinDelta,
        createdAt,
        playerCardJson,
        opponentCardJson
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      makeId("fight"),
      current.userId,
      opponentSnapshot.profile.userId,
      simulation.playerWon ? "win" : "loss",
      JSON.stringify(simulation.rounds),
      xpDelta,
      coinDelta,
      now,
      simulation.playerCard ? JSON.stringify(simulation.playerCard) : null,
      opponentSnapshot.selectedCard ? JSON.stringify(opponentSnapshot.selectedCard) : null,
    );

    const elo = opponentSelection.isNpc
      ? {
          rated: false,
          kFactor: 0,
          playerBefore: current.eloRating,
          playerAfter: current.eloRating,
          playerDelta: 0,
          opponentBefore: null,
          opponentAfter: null,
          opponentDelta: 0,
        }
      : applyEloResult(
          db,
          current.userId,
          opponentSnapshot.profile.userId,
          simulation.playerWon,
        );

    if (!opponentSelection.isNpc && opponentSnapshot.profile?.userId) {
      incrementDailyOpponentCount(db, opponentSnapshot.profile.userId);
      settleDefenderFight(db, opponentSnapshot.profile.userId, {
        defenderWon: !simulation.playerWon,
        oppEffectUsage: simulation.oppEffectUsage,
        attackerUserId: current.userId,
        timestamp: now,
      });
    }
    resetDailyOpponentCount(db, current.userId);

    recordCardAffinityFight(
      db,
      current.userId,
      simulation.playerCard || currentSnapshot.selectedCard,
      simulation.playerWon,
    );

    return {
      levelsGained,
      xpDelta,
      coinDelta,
      rarityCoinReward,
      materialDrops,
      elo,
      bypassedCooldownWithGateKey: cooldownResult.bypassedWithGateKey,
    };
  });

  const result = tx();
  const refreshed = getArenaProfilePayload(db, userId);

  return {
    result: simulation.playerWon ? "win" : "loss",
    opponent: opponentState.publicSnapshot,
    battle: simulation.battle,
    rounds: simulation.rounds,
    score: {
      player: simulation.playerRoundsWon,
      opponent: simulation.opponentRoundsWon,
    },
    rewards: {
      xp: result.xpDelta,
      coins: result.coinDelta,
      rarityCoinReward: result.rarityCoinReward,
      levelsGained: result.levelsGained,
      materialDrops: result.materialDrops,
      // How many "rounds won" the reward formula credited (fast fights score
      // higher, clamp 1–3) — lets clients show the quick-finish bonus and keeps
      // reward assertions independent of turn-count RNG.
      xpRoundsWon: simulation.xpRoundsWon,
      elo: result.elo,
    },
    effectUsage: {
      ...simulation.effectUsage,
      usedGateKeyBypass: result.bypassedCooldownWithGateKey,
    },
    profile: refreshed,
  };
}

module.exports = {
  calculateRoundPower,
  resolveRoundWinner,
  applyLevelUps,
  convertMaxLevelOverflowXp,
  calculateStreakXpMultiplier,
  calculateWinXp,
  calculateLossXp,
  calculateStreakCoinMultiplier,
  calculateWinCoins,
  assertFightCooldown,
  loadCombatSnapshot,
  resolveFightOpponentProfile,
  buildFightStatBreakdown,
  buildPublicFightOpponentSnapshot,
  loadFightOpponent,
  consumeWinBoosts,
  consumeFightBoostDurations,
  tryGrantBonusDraw,
  applyFightEffectUsage,
  settleDefenderFight,
  NPC_REWARD_SCALE,
  getWonRoundRarityCoinReward,
  rollFightMaterialRewards,
  computeMaxHp,
  computeElementMultiplier,
  computeShieldPiercePct,
  computeEvasionChance,
  calculateAttackOutcome,
  evaluatePassiveWhen,
  canFirePassiveAction,
  buildPassiveRuntime,
  consumeTempGuard,
  runPassivesForTrigger,
  chooseEloOpponent,
  getDailyOpponentLimit,
  applyEloResult,
  incrementDailyOpponentCount,
  resetDailyOpponentCount,
  getNpcTemplateForLevel,
  buildNpcOpponent,
  selectOpponentForFight,
  simulateFight,
  runFight,
};
