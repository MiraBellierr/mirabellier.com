import { useEffect, useState } from "react";
import type {
  ArenaConsumableRule,
  ArenaPassiveAction,
  ArenaPassiveRule,
  ArenaShopItem,
  ArenaShopResponse,
} from "@/lib/arena-api";
import { ArenaApiError } from "@/lib/arena-api";

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
  driftwood_shard: "wood_log",
  satchel_cloth: "brown_bag",
  timber_plank: "wood_plank",
  riversteel_saber: "curved_saber",
  guard_cap: "iron_helmet",
  iron_cuirass: "blue_chestplate",
  azure_ring: "blue_ring",
  frost_elixir: "cyan_elixir_small",
  viridian_elixir: "lime_elixir_small",
  fuse_bomb: "round_bomb",
  azure_ore: "blue_crystal_cluster",
  gold_ingot: "gold_bar",
  brown_dust: "brown_powder",
  dawnfang_blade: "crimson_blade",
  knight_helm: "silver_helmet",
  laurel_pendant: "gold_necklace",
  verdant_core: "green_orb",
  sun_elixir: "orange_elixir_small",
  star_tonic: "star_elixir_small",
  lantern_oil: "lantern",
  azure_powder: "blue_powder",
  verdant_powder: "green_powder",
  clear_crystal: "diamond",
  twinlight_blades: "lightning_swords",
  waraxe_howl: "battle_axe",
  sky_hood: "blue_tunic",
  violet_core: "purple_orb",
  seeker_lens: "magnifying_glass",
  oath_ribbon: "ribbon_medal",
  treasure_cache: "golden_chest",
  ember_dust: "orange_powder",
  scarlet_dust: "red_powder",
  gray_feather: "silver_feather",
  reaper_glaive: "ghost_scythe",
  wyrm_hood: "demon_helmet",
  titan_greaves: "black_boots",
  crimson_core: "red_orb",
  prism_draught: "pink_flask",
  sacred_candles: "candle_lit",
  gate_key: "silver_key",
  arcane_powder: "purple_powder",
  ivory_feather: "white_feather",
  rose_crystal: "red_gem",
  orbit_scepter: "white_magic_staff",
  aegis_crown: "feather_crown",
  azure_core: "blue_orb",
  void_core: "dark_orb",
  solar_cauldron: "purple_cauldron",
  void_cauldron: "dark_cauldron",
  chrono_vial: "hourglass",
  verdant_gem: "green_orb",
  pale_gem: "diamond",
  lunar_gem: "blue_orb",
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
  if (Number(stats.luck || 0) !== 0) entries.push(`L +${Number(stats.luck || 0)}`);
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
  if (type === "scaleLuckIntoPowerPct") return `Gain power from ${toNumber(entry.value)}% luck`;
  if (type === "cancelCritical") return "Convert first crit taken into normal hit";
  if (type === "scaleBySpeedPct") return `Bonus damage = ${toNumber(entry.value)}% of speed`;
  if (type === "counterDamagePct") {
    return `${toNumber(entry.chancePct)}% chance counter for ${toNumber(entry.value)}% dmg`;
  }
  if (type === "reduceOpponentLuckPct") return `Reduce opponent luck by ${toNumber(entry.value)}%`;
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
  if (kind === "exp_boost") {
    return `+${toNumber(effect.pct)}% EXP for ${toNumber(effect.fights ?? effect.wins, 1)} fight(s)`;
  }
  if (kind === "coin_boost") {
    return `+${toNumber(effect.pct)}% coins for ${toNumber(effect.fights ?? effect.wins, 1)} fight(s)`;
  }
  if (kind === "reroll_keep_higher") return "Reroll your own card once, keep higher rarity";
  if (kind === "streak_shield") return `Ignore ${toNumber(effect.charges, 1)} loss streak reset(s)`;
  if (kind === "upgrade_lowest_rarity") {
    return `Upgrade your lowest own round rarity +1 for ${toNumber(effect.charges, 1)} fight(s)`;
  }
  if (kind === "guarantee_ssr_plus") {
    return `Guarantee at least one SSR+ own round card for ${toNumber(effect.charges, 1)} fight(s)`;
  }
  if (kind === "shield_fight_start") {
    return `Fight start shield +${toNumber(effect.amount)} for ${toNumber(effect.charges, 1)} fight(s)`;
  }
  if (kind === "evade_next_fight") {
    return `+${toNumber(effect.pct)}% evade for next ${toNumber(effect.fights, 1)} fight(s)`;
  }
  if (kind === "first_hit_true_damage") {
    return `First successful hit deals +${toNumber(effect.value)} true damage`;
  }
  if (kind === "bonus_vs_higher_rarity") {
    return `+${toNumber(effect.pct)}% damage vs higher rarity (${toNumber(effect.charges, 1)} charge)`;
  }
  if (kind === "cooldown_bypass") return "Bypass fight cooldown once";
  if (kind === "double_passive_trigger") {
    return `Double passive trigger chance for ${toNumber(effect.fights, 1)} fight(s)`;
  }
  if (kind === "restore_consumable_charge") return `Restore ${toNumber(effect.charges, 1)} consumable charge`;
  if (kind === "ascension") {
    return `+1 permanent all stats (${toNumber(effect.cooldownDays, 7)} day cooldown)`;
  }
  return kind || "Consumable effect";
}

export function formatActiveEffects(shop: ArenaShopResponse) {
  const effects = shop.profile.effects;
  const rows: string[] = [];
  if (effects.expBoostWinsRemaining > 0 && effects.expBoostPct > 0) {
    rows.push(`EXP boost +${effects.expBoostPct}% (${effects.expBoostWinsRemaining} fight)`);
  }
  if (effects.coinBoostWinsRemaining > 0 && effects.coinBoostPct > 0) {
    rows.push(`Coin boost +${effects.coinBoostPct}% (${effects.coinBoostWinsRemaining} fight)`);
  }
  if (effects.rerollKeepHigherCharges > 0) rows.push(`Reroll keep higher x${effects.rerollKeepHigherCharges}`);
  if (effects.streakShieldCharges > 0) rows.push(`Streak shield x${effects.streakShieldCharges}`);
  if (effects.upgradeLowestRarityCharges > 0) {
    rows.push(`Upgrade lowest rarity x${effects.upgradeLowestRarityCharges}`);
  }
  if (effects.guaranteeSsrPlusCharges > 0) rows.push(`Guarantee SSR+ x${effects.guaranteeSsrPlusCharges}`);
  if (effects.fightStartShieldCharges > 0) {
    rows.push(`Fight start shield ${effects.fightStartShieldAmount} x${effects.fightStartShieldCharges}`);
  }
  if (effects.evadeBoostFightsRemaining > 0 && effects.evadeBoostPct > 0) {
    rows.push(`Evade boost +${effects.evadeBoostPct}% (${effects.evadeBoostFightsRemaining} fight)`);
  }
  if (effects.firstHitTrueDamageCharges > 0 && effects.firstHitTrueDamageValue > 0) {
    rows.push(`First hit true damage +${effects.firstHitTrueDamageValue} x${effects.firstHitTrueDamageCharges}`);
  }
  if (effects.higherRarityDamageBonusPctCharges > 0 && effects.higherRarityDamageBonusPct > 0) {
    rows.push(
      `Higher rarity bonus +${effects.higherRarityDamageBonusPct}% x${effects.higherRarityDamageBonusPctCharges}`,
    );
  }
  if (effects.gateKeyCharges > 0) rows.push(`Gate key cooldown bypass x${effects.gateKeyCharges}`);
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
