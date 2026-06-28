import { useEffect, useState } from "react";
import type {
  ArenaConsumableRule,
  ArenaPassiveAction,
  ArenaPassiveRule,
  ArenaProfile,
  ArenaShopItem,
  ArenaShopResponse,
} from "@/lib/arena";
import { ArenaApiError } from "@/lib/arena";

const spriteModules = import.meta.glob("/src/assets/sprites/*.png", {
  import: "default",
}) as Record<string, () => Promise<string>>;
const spriteUrlCache = new Map<string, string | null>();
const spriteLoadPromiseCache = new Map<string, Promise<string | null>>();

const ITEM_SPRITE_NAME_BY_ID: Record<string, string> = {
  rustblade_weapon: "bronze_sword",
  twigbow_weapon: "short_crossbow",
  patchwork_helm: "gray_helmet",
  copper_ring: "gold_ring",
  red_tonic: "red_potion_small",
  green_draft: "green_potion_small",
  amber_draft: "amber_potion_small",
  riversteel_saber: "curved_saber",
  guard_cap: "iron_helmet",
  iron_cuirass: "blue_chestplate",
  azure_ring: "blue_ring",
  frost_elixir: "cyan_elixir_small",
  viridian_elixir: "lime_elixir_small",
  fuse_bomb: "round_bomb",
  dawnfang_blade: "crimson_blade",
  knight_helm: "silver_helmet",
  laurel_pendant: "gold_necklace",
  verdant_core: "green_orb",
  sun_elixir: "orange_elixir_small",
  star_tonic: "star_elixir_small",
  lantern_oil: "lantern",
  twinlight_blades: "lightning_swords",
  waraxe_howl: "battle_axe",
  sky_hood: "blue_tunic",
  violet_core: "purple_orb",
  seeker_lens: "magnifying_glass",
  oath_ribbon: "ribbon_medal",
  treasure_cache: "golden_chest",
  reaper_glaive: "ghost_scythe",
  wyrm_hood: "demon_helmet",
  titan_greaves: "black_boots",
  crimson_core: "red_orb",
  prism_draught: "pink_flask",
  sacred_candles: "candle_lit",
  gate_key: "curved_bone",
  apex_sigil: "gold_sparkles",
  orbit_scepter: "white_magic_staff",
  aegis_crown: "feather_crown",
  azure_core: "blue_orb",
  void_core: "dark_orb",
  solar_cauldron: "purple_cauldron",
  void_cauldron: "dark_cauldron",
  chrono_vial: "hourglass",
  weapon_roll: "steel_sword",
  armour_roll: "tower_shield",
  charm_roll: "crimson_coil_charm",
  exp_tome: "tan_book",
};

function getSpriteLoader(spriteName: string) {
  return spriteModules[`/src/assets/sprites/${spriteName}.png`] || null;
}

async function loadSpriteUrlByName(spriteName: string) {
  if (spriteUrlCache.has(spriteName)) {
    return spriteUrlCache.get(spriteName) ?? null;
  }

  const existingPromise = spriteLoadPromiseCache.get(spriteName);
  if (existingPromise) {
    return existingPromise;
  }

  const loader = getSpriteLoader(spriteName);
  if (!loader) {
    spriteUrlCache.set(spriteName, null);
    return null;
  }

  const loadingPromise = loader()
    .then((loadedUrl) => {
      const url = loadedUrl || null;
      spriteUrlCache.set(spriteName, url);
      spriteLoadPromiseCache.delete(spriteName);
      return url;
    })
    .catch(() => {
      spriteUrlCache.set(spriteName, null);
      spriteLoadPromiseCache.delete(spriteName);
      return null;
    });

  spriteLoadPromiseCache.set(spriteName, loadingPromise);
  return loadingPromise;
}

function useArenaSpriteUrl(spriteName: string | null) {
  const [spriteUrl, setSpriteUrl] = useState<string | null>(() => {
    if (!spriteName) {
      return null;
    }
    return spriteUrlCache.get(spriteName) ?? null;
  });

  useEffect(() => {
    let isCancelled = false;

    if (!spriteName) {
      setSpriteUrl(null);
      return () => {
        isCancelled = true;
      };
    }

    if (spriteUrlCache.has(spriteName)) {
      setSpriteUrl(spriteUrlCache.get(spriteName) ?? null);
      return () => {
        isCancelled = true;
      };
    }

    setSpriteUrl(null);
    void loadSpriteUrlByName(spriteName).then((loadedUrl) => {
      if (!isCancelled) {
        setSpriteUrl(loadedUrl);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [spriteName]);

  return spriteUrl;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

export function normalizeArenaError(error: unknown) {
  if (error instanceof ArenaApiError) {
    if (error.cooldownEndsAt) {
      const parsed = Date.parse(error.cooldownEndsAt);
      if (Number.isFinite(parsed)) {
        return `${error.message} (Cooldown ends ${new Date(parsed).toLocaleString()})`;
      }
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Arena request failed.";
}

export function formatStats(stats: ArenaShopItem["stats"] | undefined) {
  if (!stats || typeof stats !== "object") return "";
  const entries: string[] = [];
  if (Number(stats.hp || 0) !== 0) entries.push(`HP +${Number(stats.hp || 0)}`);
  if (Number(stats.power || 0) !== 0) entries.push(`P +${Number(stats.power || 0)}`);
  if (Number(stats.guard || 0) !== 0) entries.push(`G +${Number(stats.guard || 0)}`);
  if (Number(stats.speed || 0) !== 0) entries.push(`S +${Number(stats.speed || 0)}`);
  if (Number(stats.effectHit || 0) !== 0) entries.push(`EH +${Number(stats.effectHit || 0)}`);
  return entries.join(" | ");
}

function describePassiveAction(action: ArenaPassiveAction) {
  if (!action || typeof action !== "object") return "";
  const entry = action as Record<string, unknown>;
  const type = typeof entry.type === "string" ? entry.type : "";
  if (type === "addFlatDamage") return `+${toNumber(entry.value)} flat damage`;
  if (type === "scaleDamagePct") return `+${toNumber(entry.value)}% damage`;
  if (type === "reduceIncomingDamagePct") return `-${toNumber(entry.value)}% incoming damage`;
  if (type === "applyShield") return `Gain shield ${toNumber(entry.value)}`;
  if (type === "healFlat") return `Heal ${toNumber(entry.value)} HP`;
  if (type === "rewardBonusPct") return `+${toNumber(entry.value)}% ${String(entry.target || "")}`;
  if (type === "rarityStepUp") return `Upgrade rarity by ${toNumber(entry.steps)} step(s)`;
  if (type === "reduceIncomingDamageFlat") return `-${toNumber(entry.value)} incoming damage`;
  if (type === "bonusCritChancePct") return `+${toNumber(entry.value)}% crit chance`;
  if (type === "grantTempGuard") return `+${toNumber(entry.value)} guard for ${toNumber(entry.turns, 1)} turn(s)`;
  if (type === "reflectFlatDamage") return `Reflect ${toNumber(entry.value)} damage`;
  if (type === "addEvasionPct") return `+${toNumber(entry.value)}% evade`;
  if (type === "rarityCoinBonusPct") return `+${toNumber(entry.value)}% rarity coin reward`;
  if (type === "extraStrikePct") {
    return `${toNumber(entry.chancePct)}% chance extra strike (${toNumber(entry.value)}% dmg)`;
  }
  if (type === "cancelCritical") return "Convert first crit taken into normal hit";
  if (type === "reduceElementEffectivenessPct") return `Reduce enemy super-effective damage by ${toNumber(entry.value)}%`;
  if (type === "scaleBySpeedPct") return `Bonus damage = ${toNumber(entry.value)}% of speed`;
  if (type === "counterDamagePct") {
    return `${toNumber(entry.chancePct)}% chance counter for ${toNumber(entry.value)}% dmg`;
  }
  return type || "Passive effect";
}

export function describePassive(passive: ArenaPassiveRule | null | undefined) {
  if (!passive) return "";
  const triggerMap: Record<string, string> = {
    onFightStart: "Fight Start",
    onAttack: "On Attack",
    onDamageTaken: "On Damage Taken",
    onDamageDealt: "On Damage Dealt",
    onWin: "On Win",
    onLose: "On Lose",
  };
  const trigger = triggerMap[passive.trigger] || passive.trigger;
  const actionText = Array.isArray(passive.actions)
    ? passive.actions.map((action) => describePassiveAction(action)).filter(Boolean).join(", ")
    : "";
  return actionText ? `${trigger}: ${actionText}` : trigger;
}

export function describeConsumableEffect(effect: ArenaConsumableRule | null | undefined) {
  if (!effect || typeof effect !== "object") return "";
  const kind = typeof effect.kind === "string" ? effect.kind : "";
  if (kind === "damage_boost") {
    return `+${toNumber(effect.pct)}% damage for ${toNumber(effect.fights, 1)} fight(s)`;
  }
  if (kind === "speed_boost") {
    return `+${toNumber(effect.pct)}% speed for ${toNumber(effect.fights, 1)} fight(s)`;
  }
  if (kind === "death_save") {
    return `Survive KO with 1 HP (${toNumber(effect.charges, 1)} charge)`;
  }
  if (kind === "stat_steroid") {
    return `+${toNumber(effect.pct)}% all combat stats for ${toNumber(effect.fights, 1)} fight(s)`;
  }
  if (kind === "match_rarity") {
    const mCharges = toNumber(effect.charges, 1);
    return mCharges > 1
      ? `Match opponent's rarity if higher (${mCharges} charge${mCharges > 1 ? "s" : ""})`
      : "Match opponent's rarity if higher";
  }
  if (kind === "vampiric_heal") {
    return `Heal ${toNumber(effect.pct)}% of damage dealt for ${toNumber(effect.fights, 1)} fight(s)`;
  }
  if (kind === "crit_chance") {
    return `+${toNumber(effect.pct)}% crit strike chance for ${toNumber(effect.fights, 1)} fight(s)`;
  }
  if (kind === "guard_boost") {
    return `+${toNumber(effect.pct)}% guard for ${toNumber(effect.fights, 1)} fight(s)`;
  }
  if (kind === "first_attack_double") {
    const fCharges = toNumber(effect.charges, 1);
    return fCharges > 1
      ? `First attack deals double damage (${fCharges} charge${fCharges > 1 ? "s" : ""})`
      : "First attack deals double damage";
  }
  if (kind === "iv_boost") {
    const iCharges = toNumber(effect.charges, 1);
    return iCharges > 1
      ? `+${toNumber(effect.total)} total IV to selected card (${iCharges} charge${iCharges > 1 ? "s" : ""})`
      : `+${toNumber(effect.total)} total IV to selected card`;
  }
  if (kind === "max_iv_card_stat_bonus") {
    const stats = effect.stats && typeof effect.stats === "object"
      ? effect.stats as Record<string, unknown>
      : {};
    return [
      `Max-IV selected card gains +${toNumber(stats.power)} Power IV`,
      `+${toNumber(stats.guard)} Guard IV`,
      `+${toNumber(stats.speed)} Speed IV`,
      `+${toNumber(stats.effectHit)} Effect Hit IV`,
    ].join(", ");
  }
  if (kind === "exp_boost") {
    return `+${toNumber(effect.pct)}% EXP gain for ${toNumber(effect.fights, 1)} fight(s)`;
  }
  if (kind === "self_revive") {
    return `Restore full HP when below ${toNumber(effect.hpPct)}% HP (${toNumber(effect.charges, 1)} charge)`;
  }
  if (kind === "streak_shield") return `Ignore ${toNumber(effect.charges, 1)} loss streak reset(s)`;
  if (kind === "shield_fight_start") {
    return `Fight start shield +${toNumber(effect.amount)} for ${toNumber(effect.charges, 1)} fight(s)`;
  }
  if (kind === "evade_next_fight") {
    return `+${toNumber(effect.pct)}% evade for next ${toNumber(effect.fights, 1)} fight(s)`;
  }
  if (kind === "first_hit_true_damage") {
    return `First successful hit deals +${toNumber(effect.value)} true damage (${toNumber(effect.charges, 1)} charge)`;
  }
  if (kind === "bonus_vs_higher_rarity") {
    return `+${toNumber(effect.pct)}% damage vs higher rarity (${toNumber(effect.charges, 1)} charge)`;
  }
  if (kind === "double_passive_trigger") {
    return `Double passive trigger chance for ${toNumber(effect.fights, 1)} fight(s)`;
  }
  if (kind === "restore_consumable_charge") return `Restore ${toNumber(effect.charges, 1)} consumable charge`;
  if (kind === "ascension") {
    return `+1 permanent all stats (${toNumber(effect.cooldownDays, 7)} day cooldown)`;
  }
  return kind || "Consumable effect";
}

export function getConsumableChargeValue(effect: ArenaConsumableRule | null | undefined) {
  if (!effect || typeof effect !== "object") return 0;
  const kind = typeof effect.kind === "string" ? effect.kind : "";
  switch (kind) {
    case "damage_boost":
    case "speed_boost":
    case "stat_steroid":
    case "double_passive_trigger":
    case "evade_next_fight":
    case "vampiric_heal":
    case "crit_chance":
    case "guard_boost":
    case "exp_boost":
      return toNumber(effect.fights, 0);
    case "death_save":
    case "match_rarity":
    case "streak_shield":
    case "shield_fight_start":
    case "first_hit_true_damage":
    case "bonus_vs_higher_rarity":
    case "first_attack_double":
    case "iv_boost":
    case "self_revive":
    case "restore_consumable_charge":
      return toNumber(effect.charges, 0);
    default:
      return 0;
  }
}

export function getEffectFieldForKind(kind: string) {
  switch (kind) {
    case "damage_boost":          return { field: "damageBoostFightsRemaining" as const, max: 500 };
    case "speed_boost":           return { field: "speedBoostFightsRemaining" as const, max: 500 };
    case "stat_steroid":          return { field: "statSteroidFightsRemaining" as const, max: 1000 };
    case "evade_next_fight":      return { field: "evadeBoostFightsRemaining" as const, max: 500 };
    case "vampiric_heal":         return { field: "vampiricHealFightsRemaining" as const, max: 1000 };
    case "crit_chance":           return { field: "critChanceBoostFightsRemaining" as const, max: 500 };
    case "guard_boost":           return { field: "guardBoostFightsRemaining" as const, max: 500 };
    case "exp_boost":             return { field: "expBoostWinsRemaining" as const, max: 500 };
    case "double_passive_trigger": return { field: "doublePassiveTriggerFightsRemaining" as const, max: 1000 };
    case "death_save":            return { field: "deathSaveCharges" as const, max: 1000 };
    case "match_rarity":          return { field: "matchRarityCharges" as const, max: 1500 };
    case "streak_shield":         return { field: "streakShieldCharges" as const, max: 6 };
    case "shield_fight_start":    return { field: "fightStartShieldCharges" as const, max: 2000 };
    case "first_hit_true_damage": return { field: "firstHitTrueDamageCharges" as const, max: 500 };
    case "bonus_vs_higher_rarity": return { field: "higherRarityDamageBonusPctCharges" as const, max: 1000 };
    case "first_attack_double":   return { field: "firstAttackDoubleCharges" as const, max: 1000 };
    case "iv_boost":              return { field: "ivBoostCharges" as const, max: 500 };
    case "self_revive":           return { field: "selfReviveCharges" as const, max: 1000 };
    case "restore_consumable_charge": return null;
    default: return null;
  }
}

export function formatActiveEffects(source: ArenaShopResponse | ArenaProfile) {
  const effects = "profile" in source ? source.profile.effects : source.effects;
  const rows: string[] = [];
  if (effects.expBoostWinsRemaining > 0 && effects.expBoostPct > 0) {
    rows.push(`EXP boost +${effects.expBoostPct}% (${effects.expBoostWinsRemaining} fight)`);
  }
  if (effects.coinBoostWinsRemaining > 0 && effects.coinBoostPct > 0) {
    rows.push(`Coin boost +${effects.coinBoostPct}% (${effects.coinBoostWinsRemaining} fight)`);
  }
  if (effects.drawBonusChanceWinsRemaining > 0 && effects.drawBonusChancePct > 0) {
    rows.push(
      `Draw bonus +${effects.drawBonusChancePct}% (${effects.drawBonusChanceWinsRemaining} fight)`,
    );
  }
  if (effects.rerollKeepHigherCharges > 0) rows.push(`Reroll keep higher x${effects.rerollKeepHigherCharges}`);
  if (effects.streakShieldCharges > 0) rows.push(`Streak shield x${effects.streakShieldCharges}`);
  if (effects.upgradeLowestRarityCharges > 0) {
    rows.push(`Upgrade lowest rarity (${effects.upgradeLowestRarityCharges} fight)`);
  }
  if (effects.guaranteeSsrPlusCharges > 0) rows.push(`Guarantee SSR+ (${effects.guaranteeSsrPlusCharges} fight)`);
  if (effects.fightStartShieldCharges > 0) {
    rows.push(`Fight start shield +${effects.fightStartShieldAmount} (${effects.fightStartShieldCharges} fight)`);
  }
  if (effects.evadeBoostFightsRemaining > 0 && effects.evadeBoostPct > 0) {
    rows.push(`Evade boost +${effects.evadeBoostPct}% (${effects.evadeBoostFightsRemaining} fight)`);
  }
  if (effects.firstHitTrueDamageCharges > 0 && effects.firstHitTrueDamageValue > 0) {
    rows.push(`First hit true damage +${effects.firstHitTrueDamageValue} x${effects.firstHitTrueDamageCharges}`);
  }
  if (effects.higherRarityDamageBonusPctCharges > 0 && effects.higherRarityDamageBonusPct > 0) {
    rows.push(`Higher rarity bonus +${effects.higherRarityDamageBonusPct}% x${effects.higherRarityDamageBonusPctCharges}`);
  }
  if (effects.damageBoostFightsRemaining > 0 && effects.damageBoostPct > 0) {
    rows.push(`Damage boost +${effects.damageBoostPct}% (${effects.damageBoostFightsRemaining} fight)`);
  }
  if (effects.speedBoostFightsRemaining > 0 && effects.speedBoostPct > 0) {
    rows.push(`Speed boost +${effects.speedBoostPct}% (${effects.speedBoostFightsRemaining} fight)`);
  }
  if (effects.deathSaveCharges > 0) rows.push(`Death save x${effects.deathSaveCharges}`);
  if (effects.statSteroidFightsRemaining > 0 && effects.statSteroidPct > 0) {
    rows.push(`Stat steroid +${effects.statSteroidPct}% (${effects.statSteroidFightsRemaining} fight)`);
  }
  if (effects.matchRarityCharges > 0) rows.push(`Match rarity x${effects.matchRarityCharges}`);
  if (effects.vampiricHealFightsRemaining > 0 && effects.vampiricHealPct > 0) {
    rows.push(`Vampiric heal +${effects.vampiricHealPct}% (${effects.vampiricHealFightsRemaining} fight)`);
  }
  if (effects.critChanceBoostFightsRemaining > 0 && effects.critChanceBoostPct > 0) {
    rows.push(`Crit boost +${effects.critChanceBoostPct}% (${effects.critChanceBoostFightsRemaining} fight)`);
  }
  if (effects.guardBoostFightsRemaining > 0 && effects.guardBoostPct > 0) {
    rows.push(`Guard boost +${effects.guardBoostPct}% (${effects.guardBoostFightsRemaining} fight)`);
  }
  if (effects.firstAttackDoubleCharges > 0) rows.push(`First attack double x${effects.firstAttackDoubleCharges}`);
  if (effects.selfReviveCharges > 0 && effects.selfReviveHpThresholdPct > 0) {
    rows.push(`Self revive at ${effects.selfReviveHpThresholdPct}% HP x${effects.selfReviveCharges}`);
  }
  if (effects.doublePassiveTriggerFightsRemaining > 0) {
    rows.push(`Double passive trigger (${effects.doublePassiveTriggerFightsRemaining} fight)`);
  }
  return rows;
}

export function ArenaItemSprite({
  item,
  className = "",
}: {
  item: ArenaShopItem;
  className?: string;
}) {
  const spriteName = ITEM_SPRITE_NAME_BY_ID[item.id] || null;
  const spriteUrl = useArenaSpriteUrl(spriteName);
  const hasSprite = !!(spriteName && getSpriteLoader(spriteName));
  const isSpriteLoading =
    !!spriteName && hasSprite && !spriteUrl && !spriteUrlCache.has(spriteName);

  if (isSpriteLoading) {
    return (
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-[10px] text-blue-500 ${className}`}
      >
        ...
      </div>
    );
  }

  if (!hasSprite || !spriteUrl) {
    return (
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-[10px] text-blue-500 ${className}`}
      >
        no art
      </div>
    );
  }

  return (
    <img
      src={spriteUrl}
      alt={item.name}
      className={`h-8 w-8 rounded-md border border-blue-200 object-contain ${className}`}
      loading="lazy"
      decoding="async"
      draggable={false}
      style={{ imageRendering: "pixelated" }}
    />
  );
}
