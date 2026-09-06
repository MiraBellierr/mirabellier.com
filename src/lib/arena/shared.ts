import { shouldSendBearerToken } from "@/lib/auth-session";
import { joinApi } from "@/lib/config";

export type ArenaMetric = "level" | "win_rate" | "rich" | "elo";

export type ArenaUpdate = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};
export type ArenaStatsBlock = {
  hp: number;
  power: number;
  guard: number;
  speed: number;
  effectHit: number;
};
export type ArenaStatBreakdown = {
  base: ArenaStatsBlock;
  equipment: ArenaStatsBlock;
  card: ArenaStatsBlock;
  skill: ArenaStatsBlock;
  affinity?: ArenaStatsBlock;
  total: ArenaStatsBlock;
};
export type ArenaPctStats = {
  hpPct: number;
  dmgPct: number;
  defendPct: number;
  critChancePct: number;
  critDmgPct: number;
};
export type ArenaSubStat = {
  type: string;
  value: number;
};
export type ArenaEquipmentPiece = {
  id: string;
  slot: "weapon" | "armor" | "charm";
  mainStatType: string;
  mainStatValue: number;
  enhancementLevel: number;
  enhancedMainStatValue: number;
  subStats: ArenaSubStat[];
  equipped: boolean;
  locked: boolean;
  /** Server-authoritative coin payout for scrapping this piece. */
  fodderRefund: number;
  createdAt: string | null;
};
export type ArenaSpriteRef = {
  sheet: "game.png";
  row: number;
  col: number;
  size: number;
};
export type ArenaPassiveCondition = {
  left: string;
  op: "==" | "!=" | ">" | ">=" | "<" | "<=";
  right: number | string | boolean;
};
export type ArenaPassiveAction =
  | { type: "addFlatDamage"; value: number; chancePct?: number; maxTriggersPerFight?: number }
export type ArenaPassiveRule = {
  key: string;
  trigger: "onFightStart" | "onAttack" | "onDamageTaken" | "onDamageDealt" | "onWin" | "onLose";
  priority: number;
  when?: ArenaPassiveCondition[];
  actions: ArenaPassiveAction[];
  source?: {
    type: "skill";
    nodeId: string;
    nodeName: string;
    branch: ArenaSkillBranchId;
  };
};
export type ArenaConsumableRule = {
  kind: string;
  [key: string]: unknown;
};
export type ArenaCardIv = {
  power: number;
  guard: number;
  speed: number;
  effectHit: number;
  total: number;
};
export type ArenaCard = {
  cardInstanceId?: string;
  malId: number;
  title: string;
  url: string;
  imageUrl: string;
  meanScore: number | null;
  popularity: number | null;
  favorites: number | null;
  nsfw: string | null;
  rarity: string;
  iv: ArenaCardIv;
  drawnAt: string | null;
  element?: string | null;
  isFavorite?: boolean;
  from?: string | null;
  rainbow?: boolean;
  cardItemStats?: ArenaStatsBlock;
  cardItemIds?: string[];
  ownedCount?: number;
  owned?: boolean;
  affinity?: ArenaCardAffinity;
};
export type ArenaCardAffinity = {
  fights: number;
  wins: number;
  level: number;
  nextThreshold: number | null;
  statBonus: ArenaStatsBlock;
};
export type ArenaProfile = {
  userId: string;
  level: number;
  xp: number;
  xpToNext: number;
  xpProgress: number;
  coins: number;
  wins: number;
  losses: number;
  totalFights: number;
  winRate: number;
  winStreak: number;
  eloRating: number;
  eloMatches: number;
  peakElo: number;
  eloProvisional: boolean;
  stats: {
    base: ArenaStatsBlock;
    equipment: ArenaStatsBlock;
    card: ArenaStatsBlock;
    skill: ArenaStatsBlock;
    affinity?: ArenaStatsBlock;
    total: ArenaStatsBlock;
  };
  selectedCard: ArenaCard | null;
  canDrawCard: boolean;
  dailyDrawLimit: number;
  dailyDrawsUsed: number;
  dailyDrawsRemaining: number;
  nextCardDrawAt: string | null;
  lastCardDrawDate: string | null;
  lifetimeCoinsEarned: number;
  effects: {
    expBoostPct: number;
    expBoostWinsRemaining: number;
    coinBoostPct: number;
    coinBoostWinsRemaining: number;
    drawBonusChancePct: number;
    drawBonusChanceWinsRemaining: number;
    rerollKeepHigherCharges: number;
    streakShieldCharges: number;
    upgradeLowestRarityCharges: number;
    guaranteeSsrPlusCharges: number;
    ascensionLastPurchasedAt: string | null;
    ascensionCount: number;
    fightStartShieldCharges: number;
    fightStartShieldAmount: number;
    evadeBoostPct: number;
    evadeBoostFightsRemaining: number;
    firstHitTrueDamageCharges: number;
    firstHitTrueDamageValue: number;
    higherRarityDamageBonusPctCharges: number;
    higherRarityDamageBonusPct: number;
    gateKeyCharges: number;
    doublePassiveTriggerFightsRemaining: number;
    damageBoostPct: number;
    damageBoostFightsRemaining: number;
    speedBoostPct: number;
    speedBoostFightsRemaining: number;
    deathSaveCharges: number;
    statSteroidPct: number;
    statSteroidFightsRemaining: number;
    matchRarityCharges: number;
    vampiricHealPct: number;
    vampiricHealFightsRemaining: number;
    critChanceBoostPct: number;
    critChanceBoostFightsRemaining: number;
    guardBoostPct: number;
    guardBoostFightsRemaining: number;
    firstAttackDoubleCharges: number;
    ivBoostCharges: number;
    selfReviveHpThresholdPct: number;
    selfReviveCharges: number;
    activeConsumables?: Array<{
      itemId: string;
      kind: string;
      activatedAt: string;
    }>;
  };
  equipment: {
    weapon: ArenaEquippedItem | null;
    armor: ArenaEquippedItem | null;
    charm: ArenaEquippedItem | null;
  };
  equipmentPct?: ArenaPctStats;
  equipmentPieces?: ArenaEquipmentPiece[];
  equipmentLoadouts?: ArenaEquipmentLoadout[];
  activePassives?: ArenaPassiveRule[];
  skillTree?: {
    earnedPoints: number;
    spentPoints: number;
    availablePoints: number;
    resetCost: number;
  };
  catalogVersion?: string;
  recentFights?: ArenaRecentFight[];
  lastFightAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  activeFight?: ArenaActiveFight | null;
  tutorialComplete: boolean;
};
export type ArenaEquipmentLoadout = {
  id: string;
  name: string;
  weaponPieceId: string | null;
  armorPieceId: string | null;
  charmPieceId: string | null;
  createdAt: string;
};
export type ArenaEquippedItem = {
  id: string;
  slot: "weapon" | "armor" | "charm";
  mainStatType: string;
  mainStatValue: number;
  enhancementLevel: number;
  enhancedMainStatValue: number;
  subStats: ArenaSubStat[];
  createdAt: string | null;
};
export type ArenaBattleTurn = {
  turn: number;
  attacker: "player" | "opponent";
  attackerName: string;
  defender: "player" | "opponent";
  defenderName: string;
  attackerRarity: string;
  avoided: boolean;
  critical: boolean;
  damage: number;
  playerHp: number;
  opponentHp: number;
  playerShield?: number;
  opponentShield?: number;
  elementEffective?: string | null;
  elementAttacker?: string | null;
};
export type ArenaBattleConsoleEvent = {
  line: string;
  playerHp: number;
  opponentHp: number;
};
export type ArenaEloResult = {
  rated: boolean;
  kFactor: number;
  playerBefore: number;
  playerAfter: number;
  playerDelta: number;
  opponentBefore: number | null;
  opponentAfter: number | null;
  opponentDelta: number;
};
export type ArenaBattleState = {
  maxHp: {
    player: number;
    opponent: number;
  };
  finalHp: {
    player: number;
    opponent: number;
  };
  turns: ArenaBattleTurn[];
  console: ArenaBattleConsoleEvent[];
};
export type ArenaRecentFight = {
  id: string;
  opponentUserId: string;
  result: "win" | "loss";
  rounds: ArenaBattleTurn[];
  xpDelta: number;
  coinDelta: number;
  createdAt: string;
};
export type ArenaFightOpponent = {
  userId: string;
  displayName: string;
  isNpc: boolean;
  level: number;
  eloRating: number | null;
  eloMatches: number;
  eloProvisional: boolean;
  stats: ArenaStatsBlock;
  statBreakdown: ArenaStatBreakdown;
  equipment: {
    weapon: ArenaEquippedItem | null;
    armor: ArenaEquippedItem | null;
    charm: ArenaEquippedItem | null;
  };
  equipmentPct: ArenaPctStats;
  effects: ArenaProfile["effects"];
  activePassives: ArenaPassiveRule[];
  selectedCard: ArenaCard | null;
};
export type ArenaFightResponse = {
  result: "win" | "loss";
  opponent: ArenaFightOpponent;
  battle: ArenaBattleState;
  rounds: ArenaBattleTurn[];
  score: {
    player: number;
    opponent: number;
  };
  rewards: {
    xp: number;
    coins: number;
    rarityCoinReward: number;
    levelsGained: number;
    elo: ArenaEloResult;
  };
  effectUsage: {
    usedRerollKeepHigher: boolean;
    usedUpgradeLowest: boolean;
    usedGuaranteeSsrPlus: boolean;
    usedFightStartShield?: boolean;
    usedEvadeBoost?: boolean;
    usedFirstHitTrueDamage?: boolean;
    usedHigherRarityBonus?: boolean;
    usedDoublePassiveTrigger?: boolean;
    usedGateKeyBypass?: boolean;
  };
  profile: ArenaProfile;
};
export type ArenaActiveFightBattle = {
  maxHp: { player: number; opponent: number };
  currentHp: { player: number; opponent: number };
  currentShield?: { player: number; opponent: number };
  console: ArenaBattleConsoleEvent[];
};
export type ArenaActiveFight = {
  fightId: string;
  cursor: number;
  totalTurns: number;
  isFinished: boolean;
  result: "win" | "loss" | null;
  opponent: ArenaFightOpponent;
  playerEffects?: Record<string, number>;
  battle: ArenaActiveFightBattle;
  turns: ArenaBattleTurn[];
  score: { player: number; opponent: number };
  rewards?: {
    xp: number;
    coins: number;
    rarityCoinReward?: number;
    levelsGained?: number;
    elo?: ArenaEloResult | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};
export type ArenaCollectionResponse = {
  profile: ArenaProfile;
  cards: ArenaCard[];
  page: number;
  perPage: number;
  totalPages: number;
  total: number;
  sort: string;
  element?: string;
};
export type ArenaArchiveResponse = {
  cards: ArenaCard[];
  page: number;
  perPage: number;
  totalPages: number;
  total: number;
  search?: string;
  ownership: "all" | "owned" | "not-owned";
};
export type ArenaSelectCollectionCardResponse = {
  selectedCard: ArenaCard;
  profile: ArenaProfile;
};
export type ArenaMarketIvBand = {
  id: "0-31" | "32-62" | "63-93" | "94-124";
  min: number;
  max: number;
};
export type ArenaMarketPrice = {
  value: number;
  source: "sales_average" | "shop_baseline";
  sampleSize: number;
};
export type ArenaMarketListing = {
  listingId: string;
  seller: {
    userId: string;
    username: string;
    avatar: string | null;
  };
  buyerUserId: string | null;
  card: ArenaCard;
  ivBand: ArenaMarketIvBand["id"];
  price: number;
  status: "active" | "sold" | "cancelled";
  createdAt: string;
  updatedAt: string;
  soldAt: string | null;
  cancelledAt: string | null;
  isMine: boolean;
  marketPrice: ArenaMarketPrice;
};
export type ArenaMarketListingsResponse = {
  profile: ArenaProfile;
  listings: ArenaMarketListing[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  ivBands: ArenaMarketIvBand[];
};
export type ArenaMarketMutationResponse = {
  listing: ArenaMarketListing;
  profile: ArenaProfile;
};
export type ArenaMarketPriceGuideResponse = {
  malId: number;
  ivBand: ArenaMarketIvBand;
  marketPrice: ArenaMarketPrice;
};
export type ArenaMarketSort =
  | "newest"
  | "price-asc"
  | "price-desc"
  | "iv-asc"
  | "iv-desc";

export type ArenaSkillBranchId = "offense" | "defense" | "utility";

export type ArenaSkillBranch = {
  id: ArenaSkillBranchId;
  name: string;
  color: string;
};
export type ArenaSkillNode = {
  id: string;
  branch: ArenaSkillBranchId;
  branchName: string;
  branchColor: string;
  chain: string;
  chainName: string;
  tier: number;
  name: string;
  description: string;
  prerequisiteId: string | null;
  statBonus: ArenaStatsBlock;
  passive: ArenaPassiveRule | null;
  position: { x: number; y: number };
};
export type ArenaSkillAllocation = {
  userId: string;
  nodeId: string;
  activatedAt: string;
};
export type ArenaSkillTreeResponse = {
  branches: ArenaSkillBranch[];
  nodes: ArenaSkillNode[];
  allocations: ArenaSkillAllocation[];
  earnedPoints: number;
  spentPoints: number;
  availablePoints: number;
  level: number;
  coins: number;
  resetCost: number;
  stats: ArenaStatsBlock;
};
export type ArenaShopItem = {
  id: string;
  name: string;
  tier: string | null;
  unlockLevel: number;
  price: number;
  type: "gear" | "consumable" | "instant" | "card";
  acquisition?: "buy" | "craft";
  slot?: "weapon" | "armor" | "charm";
  stats?: Partial<ArenaStatsBlock>;
  passive?: ArenaPassiveRule | null;
  consumableEffect?: ArenaConsumableRule | null;
  sprite?: ArenaSpriteRef;
  recipeId?: string | null;
  mainStat?: {
    type: string;
    min?: number;
    max?: number;
    options?: { type: string; min: number; max: number }[];
  };
  ownedQuantity: number;
  isOwned: boolean;
  isEquipped: boolean;
  unlocked: boolean;
  canBuy: boolean;
  canCraft?: boolean;
  cooldownEndsAt?: string | null;
};
export type ArenaShopTier = {
  tier: string;
  items: ArenaShopItem[];
};
export type ArenaShopResponse = {
  catalogVersion: string;
  profile: ArenaProfile;
  equipment: ArenaShopItem[];
  cardItems?: ArenaShopItem[];
  shop: ArenaShopTier[];
  recipes: ArenaShopRecipe[];
  equipped: {
    weapon: ArenaEquippedItem | null;
    armor: ArenaEquippedItem | null;
    charm: ArenaEquippedItem | null;
  };
};
export type ArenaCardShopDailyOffer = {
  offerId: string;
  card: ArenaCard;
  price: number;
  sold: boolean;
  canBuy: boolean;
  ownedCount: number;
};
export type ArenaCardShopResponse = {
  offerDate: string;
  nextRefreshAt: string;
  prices: Record<"C" | "R" | "SR" | "SSR" | "UR", number>;
  profile: ArenaProfile;
  dailyOffers: ArenaCardShopDailyOffer[];
  randomOffer: {
    offerId: "random-card";
    price: number;
    canBuy: boolean;
    endsAt: string;
  } | null;
};
export type ArenaCardShopPurchaseResponse = {
  kind: "daily" | "random";
  purchasedOfferId: string;
  pricePaid: number;
  card?: ArenaCard;
  cards?: ArenaCard[];
  profile: ArenaProfile;
  cardShop: ArenaCardShopResponse;
};
export type ArenaShopRecipe = {
  id: string;
  tier: string;
  unlockLevel: number;
  coinCost: number;
  output: {
    itemId: string;
    quantity: number;
    itemName?: string;
  };
  unlocked?: boolean;
  canCraft?: boolean;
};
export type ArenaLeaderboardResponse = {
  metric: ArenaMetric;
  page: number;
  perPage: number;
  totalPages: number;
  total: number;
  entries: Array<{
    rank: number;
    user: {
      id: string;
      username: string;
      avatar: string | null;
    };
    level: number;
    xp: number;
    xpToNext: number;
    xpProgress: number;
    wins: number;
    losses: number;
    totalFights: number;
    winRate: number;
    coins: number;
    lifetimeCoinsEarned: number;
    eloRating: number;
    eloMatches: number;
    peakElo: number;
    eloProvisional: boolean;
    updatedAt: string | null;
  }>;
};
export type ArenaHallOfFameEntry = {
  rank: number;
  userId: string;
  username: string;
  avatar: string | null;
  level: number;
  eloRating: number;
  eloMatches: number;
  peakElo: number;
};
export type ArenaHallOfFameMonth = {
  month: string;
  entries: ArenaHallOfFameEntry[];
  createdAt: string;
};
export type ArenaHallOfFameResponse = {
  months: ArenaHallOfFameMonth[];
  page: number;
  perPage: number;
  totalPages: number;
  total: number;
};
export class ArenaApiError extends Error {
  status: number;
  code: string | null;
  retryAfterMs: number | null;
  cooldownEndsAt: string | null;
  nextDrawAt: string | null;
  details: Record<string, unknown>;

  constructor(
    message: string,
    input?: {
      status?: number;
      code?: string | null;
      retryAfterMs?: number | null;
      cooldownEndsAt?: string | null;
      nextDrawAt?: string | null;
      details?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = "ArenaApiError";
    this.status = Number.isFinite(input?.status) ? Number(input?.status) : 500;
    this.code = input?.code ?? null;
    this.retryAfterMs =
      Number.isFinite(input?.retryAfterMs) && Number(input?.retryAfterMs) > 0
        ? Number(input?.retryAfterMs)
        : null;
    this.cooldownEndsAt =
      typeof input?.cooldownEndsAt === "string" ? input.cooldownEndsAt : null;
    this.nextDrawAt =
      typeof input?.nextDrawAt === "string" ? input.nextDrawAt : null;
    this.details = input?.details ?? {};
  }
}
const DEFAULT_ELO_RATING = 1000;
const ELO_PROVISIONAL_MATCHES = 20;
function toFiniteNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
export function normalizeProfile(value: unknown): ArenaProfile {
  const profile = value as ArenaProfile;
  const eloMatches = Math.max(0, toFiniteNumber(profile?.eloMatches, 0));
  const eloRating = Math.max(
    100,
    toFiniteNumber(profile?.eloRating, DEFAULT_ELO_RATING),
  );

  return {
    ...profile,
    eloRating,
    eloMatches,
    peakElo: Math.max(
      eloRating,
      toFiniteNumber(profile?.peakElo, eloRating),
    ),
    eloProvisional:
      typeof profile?.eloProvisional === "boolean"
        ? profile.eloProvisional
        : eloMatches < ELO_PROVISIONAL_MATCHES,
    tutorialComplete:
      typeof profile?.tutorialComplete === "boolean"
        ? profile.tutorialComplete
        : !!profile?.tutorialComplete,
  };
}
export function normalizeFightOpponent<T extends ArenaFightResponse["opponent"]>(
  opponent: T,
): T {
  if (!opponent || opponent.isNpc) {
    return {
      ...opponent,
      eloRating: null,
      eloMatches: 0,
      eloProvisional: false,
    };
  }

  const eloMatches = Math.max(0, toFiniteNumber(opponent.eloMatches, 0));
  return {
    ...opponent,
    eloRating: Math.max(
      100,
      toFiniteNumber(opponent.eloRating, DEFAULT_ELO_RATING),
    ),
    eloMatches,
    eloProvisional:
      typeof opponent.eloProvisional === "boolean"
        ? opponent.eloProvisional
        : eloMatches < ELO_PROVISIONAL_MATCHES,
  };
}
export function normalizeActiveFight(value: unknown): ArenaActiveFight {
  const fight = value as ArenaActiveFight;
  return {
    ...fight,
    opponent: normalizeFightOpponent(fight.opponent),
  };
}
export function normalizeLeaderboard(
  value: unknown,
  requestedMetric: ArenaMetric,
): ArenaLeaderboardResponse {
  const board = value as ArenaLeaderboardResponse;
  return {
    ...board,
    metric: requestedMetric,
    entries: (board.entries || []).map((entry) => {
      const eloMatches = Math.max(0, toFiniteNumber(entry.eloMatches, 0));
      const eloRating = Math.max(
        100,
        toFiniteNumber(entry.eloRating, DEFAULT_ELO_RATING),
      );
      return {
        ...entry,
        eloRating,
        eloMatches,
        peakElo: Math.max(
          eloRating,
          toFiniteNumber(entry.peakElo, eloRating),
        ),
        eloProvisional:
          typeof entry.eloProvisional === "boolean"
            ? entry.eloProvisional
            : eloMatches < ELO_PROVISIONAL_MATCHES,
      };
    }),
  };
}
export async function readApiError(response: Response): Promise<ArenaApiError> {
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    const knownKeys = new Set(["error", "code", "retryAfterMs", "cooldownEndsAt", "nextDrawAt"]);
    const details: Record<string, unknown> = {};
    for (const key of Object.keys(payload)) {
      if (!knownKeys.has(key)) {
        details[key] = payload[key];
      }
    }

    return new ArenaApiError(
      typeof payload.error === "string" && payload.error
        ? payload.error
        : "Arena request failed",
      {
        status: response.status,
        code: typeof payload.code === "string" ? payload.code : null,
        retryAfterMs:
          Number.isFinite(Number(payload.retryAfterMs))
            ? Number(payload.retryAfterMs)
            : null,
        cooldownEndsAt:
          typeof payload.cooldownEndsAt === "string"
            ? payload.cooldownEndsAt
            : null,
        nextDrawAt:
          typeof payload.nextDrawAt === "string" ? payload.nextDrawAt : null,
        details,
      },
    );
  } catch {
    return new ArenaApiError("Arena request failed", {
      status: response.status,
    });
  }
}
export function makeAuthHeaders(token: string) {
  return {
    ...(shouldSendBearerToken(token) ? { Authorization: `Bearer ${token}` } : {}),
    "Content-Type": "application/json",
  };
}

/** Turn any thrown value from an Arena call into a user-facing message. */
export function normalizeArenaError(error: unknown): string {
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

export type ArenaQueryValue = string | number | boolean | null | undefined;

export type ArenaRequestOptions = {
  /** HTTP method. Defaults to "POST" when `body` is set, otherwise "GET". */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Auth token — adds the bearer header when the session needs it. */
  token?: string;
  /** JSON request body. Serialized with a Content-Type header. */
  body?: unknown;
  /** Query params — entries that are null / undefined / "" are dropped. */
  query?: Record<string, ArenaQueryValue>;
  signal?: AbortSignal;
};

/**
 * Single entry point for Arena API calls: builds the URL + query string, sets
 * `credentials`/`cache`/auth/JSON headers, throws a normalized `ArenaApiError`
 * on non-2xx, and returns the parsed body (`undefined` for an empty response).
 */
export async function arenaRequest<T>(
  path: string,
  options: ArenaRequestOptions = {},
): Promise<T> {
  const { method, token, body, query, signal } = options;

  let url = joinApi(path);
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined && value !== "") {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }

  const hasBody = body !== undefined;
  const headers: Record<string, string> = {};
  if (token !== undefined && shouldSendBearerToken(token)) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (hasBody) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method: method ?? (hasBody ? "POST" : "GET"),
    credentials: "include",
    cache: "no-store",
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(hasBody ? { body: JSON.stringify(body) } : {}),
    signal,
  });

  if (!response.ok) throw await readApiError(response);

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
export type ArenaTradeUser = {
  id: string;
  username: string;
  avatar: string | null;
};
export type ArenaTradeListing = {
  id: string;
  userId: string;
  username: string;
  avatar: string | null;
  card: ArenaCard;
  wantedCard: ArenaCard | null;
  wantedRarity: string | null;
  wantedElement: string | null;
  note: string | null;
  status: string;
  hasActiveSession: boolean;
  hasPendingRequest: boolean;
  createdAt: string;
};
export type ArenaTradeListingsResponse = {
  profile: ArenaProfile;
  listings: ArenaTradeListing[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
export type ArenaTradeRequest = {
  id: string;
  askerId: string;
  askerUsername: string;
  askerAvatar: string | null;
  responderId: string;
  status: string;
  createdAt: string;
};
export type ArenaTradeSession = {
  id: string;
  askerId: string;
  askerUsername: string;
  responderId: string;
  responderUsername: string;
  askerCard: ArenaCard | null;
  responderCard: ArenaCard | null;
  askerCards: ArenaCard[];
  responderCards: ArenaCard[];
  askerCoins: number;
  responderCoins: number;
  askerConfirmed: boolean;
  responderConfirmed: boolean;
  status: string;
  createdAt: string;
};
export type ArenaNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  metadata: string | null;
  isRead: boolean;
  createdAt: string;
  requestStatus?: string | null;
};
export type TcgCard = ArenaCard & {
  currentHp?: number;
  maxHp?: number;
  assignedElements?: string[];
  hidden?: boolean;
};
export type TcgBoard = {
  attacker: TcgCard | null;
  support: (TcgCard | null)[];
};
export type TcgPlayerState = {
  board: TcgBoard;
  hand: TcgCard[];
  drawPile: string[];
  discardPile: string[];
  elementPool: string[];
  fullDeck?: TcgCard[];
  placedCardThisTurn?: boolean;
  drawnCardThisTurn?: boolean;
  switchedCardThisTurn?: boolean;
};
export type TcgGameState = {
  gameId: string;
  state: string;
  phase?: string;
  turn: number;
  playerKey: string;
  myTurn: boolean;
  p1Score: number;
  p2Score: number;
  player1Score?: number;
  player2Score?: number;
  winner: string | null;
  opponentName?: string;
  board: {
    p1: TcgPlayerState;
    p2: TcgPlayerState;
  } | null;
  lastAction?: string;
  currentPlayer?: string;
  elementPools?: Record<string, string[]> | null;
  solo?: boolean;
  mode?: string;
  aiActions?: string[] | null;
  turnStartedAt?: number | null;
  lastAttackResult?: {
    damage: number;
    elementEffective: string | null;
    elementAttacker: string | null;
    ko: boolean;
    defenderHp: number;
    defenderMaxHp: number;
    attackerKey: string;
    defenderKey: string;
    attackId?: number;
  } | null;
};
export type TcgQueueStatus = {
  waiting?: boolean;
  inQueue?: boolean;
  matched?: boolean;
  gameId?: string;
};
export type ArenaSacrificePreviewItem = {
  cardInstanceId: string;
  card: ArenaCard | null;
  coins: number;
  blockedReason: string | null;
  canSacrifice: boolean;
};
export type ArenaSacrificePreview = {
  items: ArenaSacrificePreviewItem[];
  blocked: ArenaSacrificePreviewItem[];
  totalCoins: number;
  canSacrifice: boolean;
};
export type ArenaSacrificeResponse = {
  sacrificedCardInstanceIds: string[];
  coinsGained: number;
  preview: ArenaSacrificePreview;
  profile: ArenaProfile;
  collectionTotal: number;
};
export type ArenaMintDuplicateGroup = {
  malId: number;
  cards: ArenaCard[];
  total: number;
};
export type ArenaMintResponse = {
  card: ArenaCard;
  profile: ArenaProfile;
};
