const RARITY_ORDER = ["C", "R", "SR", "SSR", "UR"];

const RARITY_CONFIG = {
  C: {
    id: "C",
    weight: 60,
    powerBonus: 0,
    coinReward: 0,
  },
  R: {
    id: "R",
    weight: 25,
    powerBonus: 3,
    coinReward: 3,
  },
  SR: {
    id: "SR",
    weight: 10,
    powerBonus: 7,
    coinReward: 7,
  },
  SSR: {
    id: "SSR",
    weight: 4,
    powerBonus: 12,
    coinReward: 12,
  },
  UR: {
    id: "UR",
    weight: 1,
    powerBonus: 18,
    coinReward: 18,
  },
};

const CATALOG_VERSION = "v3";

// The card "affinity" trait — six combat styles rather than elements, so the
// matchup chart reads from a fighting-game's logic (improve.md §9).
const ELEMENTS = ["Might", "Swift", "Skill", "Ruse", "Surge", "Ward"];

const ELEMENT_COLORS = {
  Might: "#e74c3c", // raw power
  Swift: "#1abc9c", // speed
  Skill: "#3498db", // technique
  Ruse: "#8e44ad", // misdirection
  Surge: "#f1c40f", // burst
  Ward: "#27ae60", // endurance
};

// Each style is strong (1.3) against two others, weak (0.7) against two, and even
// (1.0) with one — a random pairing is super-effective ~33% of the time instead
// of ~17%. Every "A beats B" pairs with "B loses to A":
//   Might  beats Skill (raw force breaks form), Surge (pressures before the burst)
//   Swift  beats Might (outspeeds), Ruse (no time to set up a trick)
//   Skill  beats Swift (reads and counters), Ward (finds the seam in the guard)
//   Ruse   beats Might (feints wrong-foot a bruiser), Surge (baits the big move)
//   Surge  beats Skill (output beats efficient trades), Ward (burst cracks defense)
//   Ward   beats Swift (outlasts the blitz), Ruse (won't take the bait)
//   even matchups: Might-Ward, Swift-Surge, Skill-Ruse
const ELEMENT_EFFECTIVENESS = {
  Might: { Might: 1,   Swift: 0.7, Skill: 1.3, Ruse: 0.7, Surge: 1.3, Ward: 1   },
  Swift: { Might: 1.3, Swift: 1,   Skill: 0.7, Ruse: 1.3, Surge: 1,   Ward: 0.7 },
  Skill: { Might: 0.7, Swift: 1.3, Skill: 1,   Ruse: 1,   Surge: 0.7, Ward: 1.3 },
  Ruse:  { Might: 1.3, Swift: 0.7, Skill: 1,   Ruse: 1,   Surge: 1.3, Ward: 0.7 },
  Surge: { Might: 0.7, Swift: 1,   Skill: 1.3, Ruse: 0.7, Surge: 1,   Ward: 1.3 },
  Ward:  { Might: 1,   Swift: 1.3, Skill: 0.7, Ruse: 1.3, Surge: 0.7, Ward: 1   },
};
// Combat consumables are tactical windows, not permanent loadout slots. These
// durations are the single source of truth for how long one crafted consumable
// lasts. EFFECT_DURATION_LIMITS (lib/arena/_constants.js) caps how much can be
// banked by re-crafting, so topping up stays a recurring decision.
const ECONOMY_BOOST_FIGHT_DURATION = 20; // exp / coin gain boosts
const DEFENSIVE_BOOST_FIGHT_DURATION = 8; // fight-start shields, evade, guard
const OFFENSIVE_BOOST_FIGHT_DURATION = 12; // damage, speed, crit, lifesteal, all-stat
const RARITY_BOOST_FIGHT_DURATION = 3; // rarity-matchup and IV boosts
const ONE_SHOT_SAVE_CHARGES = 2; // KO saves and first-strike gimmicks

// Each slot owns a distinct main stat that its own sub-stats can never roll, so
// the slot has a real identity instead of the main stat being a fifth random
// sub-stat (improve.md §8). Enhancement scales the main stat by a percentage of
// its rolled value (ENHANCEMENT_MAIN_STAT_SCALE_PER_LEVEL), not a flat +1.
const ROLLABLE_EQUIPMENT = [
  {
    id: "weapon_roll",
    name: "Blade",
    slot: "weapon",
    price: 1000,
    acquisition: "buy",
    type: "gear",
    mainStat: { type: "dmgPct", min: 6, max: 14 },
  },
  {
    id: "armour_roll",
    name: "Armour",
    slot: "armor",
    price: 1000,
    acquisition: "buy",
    type: "gear",
    mainStat: { type: "defendPct", min: 8, max: 18 },
  },
  {
    id: "charm_roll",
    name: "Charm",
    slot: "charm",
    price: 1000,
    acquisition: "buy",
    type: "gear",
    mainStat: {
      type: "random",
      options: [
        { type: "critRate", min: 5, max: 25 },
        { type: "critDmg", min: 10, max: 60 },
      ],
    },
  },
];

// Enhanced main stat = round(rolled * (1 + enhancementLevel * SCALE)). At +15
// that is 2.5x the rolled value, so the ~200k-coin grind is a real upgrade.
const ENHANCEMENT_MAIN_STAT_SCALE_PER_LEVEL = 0.1;

// Every 3rd enhancement level (3/6/9/12/15) also permanently boosts one random
// sub-stat by ~30% of that line's range midpoint. Stored separately from the
// rolled value so a reroll of that line resets only its own boost.
const ENHANCEMENT_SUBSTAT_BOOST_INTERVAL = 3;
const ENHANCEMENT_SUBSTAT_BOOST_FRACTION = 0.3;

// 2/3-piece equipment set bonuses. `bonus3` fully replaces `bonus2` (not additive
// on top of it). Values are percentage points added to the matching pct stat.
const EQUIPMENT_SETS = [
  {
    id: "berserker",
    name: "Berserker",
    bonus2: { dmgPct: 6 },
    bonus3: { dmgPct: 12, critChancePct: 6 },
  },
  {
    id: "sentinel",
    name: "Sentinel",
    bonus2: { defendPct: 6 },
    bonus3: { defendPct: 12, hpPct: 8 },
  },
  {
    id: "trickster",
    name: "Trickster",
    bonus2: { critChancePct: 5 },
    bonus3: { critChancePct: 10, critDmgPct: 15 },
  },
];
const EQUIPMENT_SET_IDS = EQUIPMENT_SETS.map((s) => s.id);
const EQUIPMENT_SET_BY_ID = new Map(EQUIPMENT_SETS.map((s) => [s.id, s]));

const SUB_STAT_POOL = {
  pool: [
    "hp", "power", "guard", "speed", "effectHit", "hpPct", "dmgPct", "defendPct", "critRate", "critDmg",
  ],
  ranges: {
    hp: [30, 50],
    power: [1, 10],
    guard: [1, 10],
    speed: [1, 10],
    effectHit: [1, 10],
    hpPct: [3, 10],
    dmgPct: [10, 20],
    defendPct: [10, 25],
    critRate: [8, 20],
    critDmg: [15, 50],
  },
  count: 4,
};

const TIER_CONFIG = [
  {
    tier: "Rookie",
    consumables: [
      {
        id: "red_tonic",
        name: "Red Tonic",
        sprite: { sheet: "game.png", row: 8, col: 0, size: 32 },
        consumableEffect: {
          kind: "shield_fight_start",
          amount: 60,
          charges: DEFENSIVE_BOOST_FIGHT_DURATION,
        },
      },
      {
        id: "green_draft",
        name: "Berserker's Brew",
        sprite: { sheet: "game.png", row: 8, col: 2, size: 32 },
        consumableEffect: {
          kind: "damage_boost",
          pct: 20,
          fights: OFFENSIVE_BOOST_FIGHT_DURATION,
        },
      },
      {
        id: "amber_draft",
        name: "Scout's Whistle",
        sprite: { sheet: "game.png", row: 8, col: 3, size: 32 },
        consumableEffect: {
          kind: "speed_boost",
          pct: 12,
          fights: OFFENSIVE_BOOST_FIGHT_DURATION,
        },
      },
    ],
  },
  {
    tier: "Bronze",
    consumables: [
      {
        id: "frost_elixir",
        name: "Frost Elixir",
        sprite: { sheet: "game.png", row: 8, col: 5, size: 32 },
        consumableEffect: {
          kind: "evade_next_fight",
          pct: 10,
          fights: DEFENSIVE_BOOST_FIGHT_DURATION,
        },
      },
      {
        id: "viridian_elixir",
        name: "Viridian Elixir",
        sprite: { sheet: "game.png", row: 8, col: 6, size: 32 },
        consumableEffect: {
          kind: "iv_boost",
          total: 5,
          charges: RARITY_BOOST_FIGHT_DURATION,
        },
      },
      {
        id: "fuse_bomb",
        name: "Fuse Bomb",
        sprite: { sheet: "game.png", row: 9, col: 11, size: 32 },
        consumableEffect: { kind: "first_hit_true_damage", value: 100, charges: ONE_SHOT_SAVE_CHARGES },
      },
      {
        id: "exp_tome",
        name: "Sage's Tome",
        sprite: { sheet: "game.png", row: 8, col: 5, size: 32 },
        consumableEffect: {
          kind: "exp_boost",
          pct: 100,
          fights: ECONOMY_BOOST_FIGHT_DURATION,
        },
      },
    ],
  },
  {
    tier: "Silver",
    consumables: [
      {
        id: "sun_elixir",
        name: "Phoenix Feather",
        sprite: { sheet: "game.png", row: 8, col: 7, size: 32 },
        consumableEffect: {
          kind: "death_save",
          charges: ONE_SHOT_SAVE_CHARGES,
        },
      },
      {
        id: "star_tonic",
        name: "Titan Draught",
        sprite: { sheet: "game.png", row: 8, col: 8, size: 32 },
        consumableEffect: {
          kind: "stat_steroid",
          pct: 15,
          fights: OFFENSIVE_BOOST_FIGHT_DURATION,
        },
      },
      {
        id: "lantern_oil",
        name: "Lantern Oil",
        sprite: { sheet: "game.png", row: 9, col: 8, size: 32 },
        consumableEffect: { kind: "bonus_vs_higher_rarity", pct: 50, charges: RARITY_BOOST_FIGHT_DURATION },
      },
    ],
  },
  {
    tier: "Gold",
    consumables: [
      {
        id: "seeker_lens",
        name: "Seeker Lens",
        sprite: { sheet: "game.png", row: 9, col: 7, size: 32 },
        consumableEffect: { kind: "crit_chance", pct: 20, fights: OFFENSIVE_BOOST_FIGHT_DURATION },
      },
      {
        id: "oath_ribbon",
        name: "Oath Ribbon",
        sprite: { sheet: "game.png", row: 10, col: 10, size: 32 },
        consumableEffect: { kind: "guard_boost", pct: 15, fights: DEFENSIVE_BOOST_FIGHT_DURATION },
      },
      {
        id: "treasure_cache",
        name: "Arcane Mirror",
        sprite: { sheet: "game.png", row: 10, col: 11, size: 32 },
        consumableEffect: { kind: "match_rarity", charges: RARITY_BOOST_FIGHT_DURATION },
      },
    ],
  },
  {
    tier: "Mythic",
    consumables: [
      {
        id: "prism_draught",
        name: "Prism Draught",
        sprite: { sheet: "game.png", row: 8, col: 14, size: 32 },
        consumableEffect: {
          kind: "first_attack_double",
          charges: ONE_SHOT_SAVE_CHARGES,
        },
      },
      {
        id: "sacred_candles",
        name: "Sacred Candles",
        sprite: { sheet: "game.png", row: 9, col: 10, size: 32 },
        consumableEffect: { kind: "shield_fight_start", amount: 80, charges: DEFENSIVE_BOOST_FIGHT_DURATION },
      },
      {
        id: "gate_key",
        name: "Vampiric Fang",
        sprite: { sheet: "game.png", row: 10, col: 9, size: 32 },
        consumableEffect: { kind: "vampiric_heal", pct: 20, fights: OFFENSIVE_BOOST_FIGHT_DURATION },
      },
    ],
  },
  {
    tier: "Cosmic",
    consumables: [
      {
        id: "solar_cauldron",
        name: "Solar Cauldron",
        sprite: { sheet: "game.png", row: 17, col: 8, size: 32 },
        // Ascension is a permanent stat purchase, not a duration consumable, so it
        // keeps its own high price instead of the cheap Cosmic tier default.
        price: 120000,
        consumableEffect: { kind: "ascension", cooldownDays: 7 },
      },
      {
        id: "void_cauldron",
        name: "Void Cauldron",
        sprite: { sheet: "game.png", row: 17, col: 9, size: 32 },
        consumableEffect: { kind: "double_passive_trigger", fights: OFFENSIVE_BOOST_FIGHT_DURATION },
      },
      {
        id: "chrono_vial",
        name: "Chrono Vial",
        sprite: { sheet: "game.png", row: 17, col: 4, size: 32 },
        consumableEffect: { kind: "self_revive", hpPct: 50, charges: ONE_SHOT_SAVE_CHARGES },
      },
    ],
  },
];

const CARD_ITEM_CONFIG = [
  {
    id: "apex_sigil",
    name: "Apex Sigil",
    unlockLevel: 1,
    price: 120000,
    type: "card",
    acquisition: "buy",
    consumableEffect: {
      kind: "max_iv_card_stat_bonus",
      stats: { power: 3, guard: 1, speed: 1, effectHit: 1 },
    },
    sprite: { sheet: "game.png", row: 10, col: 8, size: 32 },
  },
];

// Purely-cosmetic titles a player can buy with coins and display on their
// profile, the leaderboard, and as their fight opponent name. No stats, no
// gameplay effect — an endgame coin sink for capped players (improve.md §6).
// Prices escalate hard so it stays relevant well past the point other sinks dry up.
const TITLE_CATALOG = [
  { id: "brawler", name: "the Brawler", price: 25000 },
  { id: "duelist", name: "the Duelist", price: 75000 },
  { id: "gladiator", name: "the Gladiator", price: 200000 },
  { id: "champion", name: "Arena Champion", price: 600000 },
  { id: "warlord", name: "the Warlord", price: 2000000 },
  { id: "mythbreaker", name: "the Mythbreaker", price: 6000000 },
  { id: "immortal", name: "the Immortal", price: 15000000 },
];

const TITLE_BY_ID = new Map(TITLE_CATALOG.map((entry) => [entry.id, entry]));

const SHOP_TIERS = TIER_CONFIG.map((entry) => entry.tier);

// Player level required to buy a consumable of each tier. This is the
// progression ladder: coins alone do not unlock endgame power, so a freshly
// funded low-level alt cannot run a Cosmic loadout. `buyShopItem` (shop.js)
// gates on these.
const TIER_UNLOCK_LEVELS = {
  Rookie: 1,
  Bronze: 8,
  Silver: 16,
  Gold: 28,
  Mythic: 42,
  Cosmic: 58,
};

// Coin price of a consumable by tier. Consumables are a plain coin purchase —
// there is no recipe or material input — so this is just the shop price, keyed
// by tier name so a new tier without a price fails loudly at module load
// instead of silently selling for free. Tuned so one purchase is worth a
// handful of wins once its (short) duration is spent: a recurring coin sink,
// not a one-time unlock. An item may override with its own `price` field.
const CONSUMABLE_TIER_PRICES = {
  Rookie: 200,
  Bronze: 600,
  Silver: 1600,
  Gold: 3000,
  Mythic: 6000,
  Cosmic: 12000,
};

SHOP_TIERS.forEach((tier) => {
  if (typeof CONSUMABLE_TIER_PRICES[tier] !== "number") {
    throw new Error(
      `arena-constants: missing CONSUMABLE_TIER_PRICES entry for tier "${tier}"`,
    );
  }
});

function normalizeConsumableItem(tierConfig, item) {
  return {
    id: item.id,
    name: item.name,
    tier: tierConfig.tier,
    unlockLevel: TIER_UNLOCK_LEVELS[tierConfig.tier] ?? 1,
    price: typeof item.price === "number"
      ? item.price
      : CONSUMABLE_TIER_PRICES[tierConfig.tier],
    type: "consumable",
    acquisition: "buy",
    consumableEffect: item.consumableEffect || null,
    sprite: item.sprite,
  };
}

const SHOP_ITEMS = [
  ...ROLLABLE_EQUIPMENT.map((item) => ({
    id: item.id,
    name: item.name,
    tier: null,
    unlockLevel: 1,
    price: item.price,
    type: item.type,
    slot: item.slot,
    acquisition: item.acquisition,
    mainStat: item.mainStat,
    sprite: null,
  })),
  ...TIER_CONFIG.flatMap((tierConfig) => [
    ...tierConfig.consumables.map((item) => normalizeConsumableItem(tierConfig, item)),
  ]),
  ...CARD_ITEM_CONFIG.map((item) => ({
    id: item.id,
    name: item.name,
    tier: null,
    unlockLevel: item.unlockLevel,
    price: item.price,
    type: item.type,
    acquisition: item.acquisition,
    consumableEffect: item.consumableEffect,
    sprite: item.sprite,
  })),
];

const BASE_PROFILE = {
  level: 1,
  xp: 0,
  coins: 0,
  wins: 0,
  losses: 0,
  winStreak: 0,
  hp: 120,
  power: 12,
  guard: 12,
  speed: 10,
  effectHit: 3,
  lifetimeCoinsEarned: 0,
  eloRating: 1000,
  eloMatches: 0,
  peakElo: 1000,
  defensiveWins: 0,
  defensiveLosses: 0,
  loginStreak: 0,
};

const LEVEL_UP_GAINS = {
  hp: 8,
  power: 2,
  guard: 2,
  speed: 1,
  effectHit: 1,
};

const MAX_LEVEL = 70;

const MAX_DAILY_OPPONENT_COUNT = 30;

const FIGHT_COOLDOWN_MS = 5000;
const DEFAULT_MAL_POOL_REFRESH_MINUTES = 120;
const DAILY_CARD_DRAW_LIMIT = 10;

const ARENA_EFFECT_DEFAULTS = {
  expBoostPct: 0,
  expBoostWinsRemaining: 0,
  coinBoostPct: 0,
  coinBoostWinsRemaining: 0,
  rerollKeepHigherCharges: 0,
  streakShieldCharges: 0,
  upgradeLowestRarityCharges: 0,
  guaranteeSsrPlusCharges: 0,
  ascensionLastPurchasedAt: null,
  ascensionCount: 0,
  fightStartShieldCharges: 0,
  fightStartShieldAmount: 0,
  evadeBoostPct: 0,
  evadeBoostFightsRemaining: 0,
  firstHitTrueDamageCharges: 0,
  firstHitTrueDamageValue: 0,
  higherRarityDamageBonusPctCharges: 0,
  higherRarityDamageBonusPct: 0,
  gateKeyCharges: 0,
  doublePassiveTriggerFightsRemaining: 0,
  activeConsumables: [],
};

module.exports = {
  ARENA_EFFECT_DEFAULTS,
  BASE_PROFILE,
  CATALOG_VERSION,
  CONSUMABLE_TIER_PRICES,
  DAILY_CARD_DRAW_LIMIT,
  DEFAULT_MAL_POOL_REFRESH_MINUTES,
  ECONOMY_BOOST_FIGHT_DURATION,
  DEFENSIVE_BOOST_FIGHT_DURATION,
  OFFENSIVE_BOOST_FIGHT_DURATION,
  RARITY_BOOST_FIGHT_DURATION,
  ONE_SHOT_SAVE_CHARGES,
  ELEMENT_COLORS,
  ELEMENT_EFFECTIVENESS,
  ELEMENTS,
  FIGHT_COOLDOWN_MS,
  LEVEL_UP_GAINS,
  MAX_LEVEL,
  MAX_DAILY_OPPONENT_COUNT,
  RARITY_CONFIG,
  RARITY_ORDER,
  ROLLABLE_EQUIPMENT,
  ENHANCEMENT_MAIN_STAT_SCALE_PER_LEVEL,
  ENHANCEMENT_SUBSTAT_BOOST_INTERVAL,
  ENHANCEMENT_SUBSTAT_BOOST_FRACTION,
  EQUIPMENT_SETS,
  EQUIPMENT_SET_IDS,
  EQUIPMENT_SET_BY_ID,
  SHOP_ITEMS,
  SHOP_TIERS,
  SUB_STAT_POOL,
  TIER_UNLOCK_LEVELS,
  TITLE_CATALOG,
  TITLE_BY_ID,
};
