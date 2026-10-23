const { ARENA_EFFECT_DEFAULTS } = require("../arena-constants");
const {
  clamp, toInt, toPositiveInt, EFFECT_DURATION_LIMITS,
  MAX_ACTIVE_CONSUMABLE_EFFECTS,
} = require("./utils");

const ACTIVE_CONSUMABLE_EFFECT_FIELDS = {
  damage_boost: ["damageBoostPct", "damageBoostFightsRemaining"],
  speed_boost: ["speedBoostPct", "speedBoostFightsRemaining"],
  death_save: ["deathSaveCharges"],
  stat_steroid: ["statSteroidPct", "statSteroidFightsRemaining"],
  match_rarity: ["matchRarityCharges"],
  vampiric_heal: ["vampiricHealPct", "vampiricHealFightsRemaining"],
  crit_chance: ["critChanceBoostPct", "critChanceBoostFightsRemaining"],
  guard_boost: ["guardBoostPct", "guardBoostFightsRemaining"],
  first_attack_double: ["firstAttackDoubleCharges"],
  iv_boost: ["ivBoostCharges"],
  exp_boost: ["expBoostPct", "expBoostWinsRemaining"],
  self_revive: ["selfReviveHpThresholdPct", "selfReviveCharges"],
  shield_fight_start: ["fightStartShieldAmount", "fightStartShieldCharges"],
  evade_next_fight: ["evadeBoostPct", "evadeBoostFightsRemaining"],
  first_hit_true_damage: ["firstHitTrueDamageValue", "firstHitTrueDamageCharges"],
  bonus_vs_higher_rarity: [
    "higherRarityDamageBonusPct",
    "higherRarityDamageBonusPctCharges",
  ],
  double_passive_trigger: ["doublePassiveTriggerFightsRemaining"],
};

function clampEffectDuration(key, value) {
  return clamp(toPositiveInt(value), 0, EFFECT_DURATION_LIMITS[key] ?? Number.MAX_SAFE_INTEGER);
}

function normalizeActiveConsumables(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => ({
      itemId: typeof entry?.itemId === "string" ? entry.itemId : "",
      kind: typeof entry?.kind === "string" ? entry.kind : "",
      activatedAt: typeof entry?.activatedAt === "string" ? entry.activatedAt : "",
    }))
    .filter((entry) => entry.itemId && entry.kind && entry.activatedAt)
    .slice(-MAX_ACTIVE_CONSUMABLE_EFFECTS);
}

function pruneInactiveConsumables(effects) {
  if (!effects || typeof effects !== "object") return effects;
  if (!Array.isArray(effects.activeConsumables)) {
    effects.activeConsumables = [];
    return effects;
  }
  effects.activeConsumables = effects.activeConsumables.filter((entry) => {
    return hasActiveConsumableKind(effects, entry.kind);
  });
  return effects;
}

function getConsumableRemainingFields(kind) {
  const fields = ACTIVE_CONSUMABLE_EFFECT_FIELDS[kind] || [];
  const remainingFields = fields.filter((field) =>
    /(?:Charges|FightsRemaining|WinsRemaining)$/.test(field),
  );
  return remainingFields.length > 0 ? remainingFields : fields;
}

function hasActiveConsumableKind(effects, kind) {
  if (!effects || typeof effects !== "object") return false;
  return getConsumableRemainingFields(kind).some((field) =>
    toPositiveInt(effects[field], 0) > 0,
  );
}

function normalizeArenaEffects(value) {
  let parsed = {};

  if (value && typeof value === "object") {
    parsed = value;
  } else if (typeof value === "string" && value.trim()) {
    try {
      const decoded = JSON.parse(value);
      if (decoded && typeof decoded === "object") {
        parsed = decoded;
      }
    } catch {
      parsed = {};
    }
  }

  const normalized = {
    expBoostPct: clamp(toPositiveInt(parsed.expBoostPct), 0, 200),
    expBoostWinsRemaining: clampEffectDuration(
      "expBoostWinsRemaining",
      parsed.expBoostWinsRemaining,
    ),
    coinBoostPct: clamp(toPositiveInt(parsed.coinBoostPct), 0, 200),
    coinBoostWinsRemaining: clampEffectDuration(
      "coinBoostWinsRemaining",
      parsed.coinBoostWinsRemaining,
    ),
    drawBonusChancePct: clamp(toPositiveInt(parsed.drawBonusChancePct), 0, 100),
    drawBonusChanceWinsRemaining: clampEffectDuration(
      "drawBonusChanceWinsRemaining",
      parsed.drawBonusChanceWinsRemaining,
    ),
    rerollKeepHigherCharges: clampEffectDuration(
      "rerollKeepHigherCharges",
      parsed.rerollKeepHigherCharges ?? parsed.refocusCharges,
    ),
    streakShieldCharges: clampEffectDuration(
      "streakShieldCharges",
      parsed.streakShieldCharges,
    ),
    upgradeLowestRarityCharges: clampEffectDuration(
      "upgradeLowestRarityCharges",
      parsed.upgradeLowestRarityCharges,
    ),
    guaranteeSsrPlusCharges: clampEffectDuration(
      "guaranteeSsrPlusCharges",
      parsed.guaranteeSsrPlusCharges,
    ),
    ascensionLastPurchasedAt:
      typeof parsed.ascensionLastPurchasedAt === "string" &&
      parsed.ascensionLastPurchasedAt
        ? parsed.ascensionLastPurchasedAt
        : null,
    ascensionCount: clamp(toPositiveInt(parsed.ascensionCount), 0, 9999),
    fightStartShieldCharges: clampEffectDuration(
      "fightStartShieldCharges",
      parsed.fightStartShieldCharges,
    ),
    fightStartShieldAmount: clamp(toPositiveInt(parsed.fightStartShieldAmount), 0, 9999),
    evadeBoostPct: clamp(toPositiveInt(parsed.evadeBoostPct), 0, 95),
    evadeBoostFightsRemaining: clampEffectDuration(
      "evadeBoostFightsRemaining",
      parsed.evadeBoostFightsRemaining,
    ),
    firstHitTrueDamageCharges: clampEffectDuration(
      "firstHitTrueDamageCharges",
      parsed.firstHitTrueDamageCharges,
    ),
    firstHitTrueDamageValue: clamp(toPositiveInt(parsed.firstHitTrueDamageValue), 0, 9999),
    higherRarityDamageBonusPctCharges: clampEffectDuration(
      "higherRarityDamageBonusPctCharges",
      parsed.higherRarityDamageBonusPctCharges,
    ),
    higherRarityDamageBonusPct: clamp(
      toPositiveInt(parsed.higherRarityDamageBonusPct),
      0,
      300,
    ),
    gateKeyCharges: clampEffectDuration("gateKeyCharges", parsed.gateKeyCharges),
    doublePassiveTriggerFightsRemaining: clampEffectDuration(
      "doublePassiveTriggerFightsRemaining",
      parsed.doublePassiveTriggerFightsRemaining,
    ),
    damageBoostPct: clamp(toPositiveInt(parsed.damageBoostPct), 0, 200),
    damageBoostFightsRemaining: clampEffectDuration("damageBoostFightsRemaining", parsed.damageBoostFightsRemaining),
    speedBoostPct: clamp(toPositiveInt(parsed.speedBoostPct), 0, 200),
    speedBoostFightsRemaining: clampEffectDuration("speedBoostFightsRemaining", parsed.speedBoostFightsRemaining),
    deathSaveCharges: clampEffectDuration("deathSaveCharges", parsed.deathSaveCharges),
    statSteroidPct: clamp(toPositiveInt(parsed.statSteroidPct), 0, 200),
    statSteroidFightsRemaining: clampEffectDuration("statSteroidFightsRemaining", parsed.statSteroidFightsRemaining),
    matchRarityCharges: clampEffectDuration("matchRarityCharges", parsed.matchRarityCharges),
    vampiricHealPct: clamp(toPositiveInt(parsed.vampiricHealPct), 0, 100),
    vampiricHealFightsRemaining: clampEffectDuration("vampiricHealFightsRemaining", parsed.vampiricHealFightsRemaining),
    critChanceBoostPct: clamp(toPositiveInt(parsed.critChanceBoostPct), 0, 200),
    critChanceBoostFightsRemaining: clampEffectDuration("critChanceBoostFightsRemaining", parsed.critChanceBoostFightsRemaining),
    guardBoostPct: clamp(toPositiveInt(parsed.guardBoostPct), 0, 200),
    guardBoostFightsRemaining: clampEffectDuration("guardBoostFightsRemaining", parsed.guardBoostFightsRemaining),
    firstAttackDoubleCharges: clampEffectDuration("firstAttackDoubleCharges", parsed.firstAttackDoubleCharges),
    ivBoostCharges: clampEffectDuration("ivBoostCharges", parsed.ivBoostCharges),
    selfReviveHpThresholdPct: clamp(toPositiveInt(parsed.selfReviveHpThresholdPct), 0, 95),
    selfReviveCharges: clampEffectDuration("selfReviveCharges", parsed.selfReviveCharges),
    activeConsumables: normalizeActiveConsumables(parsed.activeConsumables),
  };

  return pruneInactiveConsumables(normalized);
}

function serializeEffects(effects) {
  return JSON.stringify(normalizeArenaEffects(effects));
}

module.exports = {
  ACTIVE_CONSUMABLE_EFFECT_FIELDS,
  hasActiveConsumableKind,
  normalizeArenaEffects,
  pruneInactiveConsumables,
  serializeEffects,
};
