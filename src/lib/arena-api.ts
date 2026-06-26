import { joinApi } from "@/lib/config";
import { shouldSendBearerToken } from "@/lib/auth-session";

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
  subStats: ArenaSubStat[];
  equipped: boolean;
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
  | { type: "scaleDamagePct"; value: number; chancePct?: number; maxTriggersPerFight?: number }
  | { type: "reduceIncomingDamagePct"; value: number; chancePct?: number; maxTriggersPerFight?: number }
  | { type: "applyShield"; value: number; chancePct?: number; maxTriggersPerFight?: number }
  | { type: "healFlat"; value: number; chancePct?: number; maxTriggersPerFight?: number }
  | { type: "rewardBonusPct"; target: "xp" | "coins"; value: number; chancePct?: number; maxTriggersPerFight?: number }
  | { type: "rarityStepUp"; steps: number; target: "lowest_round_card"; chancePct?: number; maxTriggersPerFight?: number }
  | { type: string; [key: string]: unknown };

export type ArenaPassiveRule = {
  key: string;
  trigger: "onFightStart" | "onAttack" | "onDamageTaken" | "onDamageDealt" | "onWin" | "onLose";
  priority: number;
  when?: ArenaPassiveCondition[];
  actions: ArenaPassiveAction[];
  source?:
    | {
        itemId: string;
        itemName: string;
        slot: "weapon" | "armor" | "charm";
        tier: string;
        equippedAt?: string | null;
      }
    | {
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
  ownedCount?: number;
  owned?: boolean;
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
  materialInventory?: Record<string, number>;
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

export type ArenaMaterialReward = {
  itemId: string;
  itemName?: string;
  tier?: string;
  quantity: number;
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

export type ArenaFightResponse = {
  result: "win" | "loss";
  opponent: {
    userId: string;
    displayName: string;
    isNpc: boolean;
    level: number;
    eloRating: number | null;
    eloMatches: number;
    eloProvisional: boolean;
    stats: ArenaStatsBlock;
    equipment: {
      weapon: ArenaEquippedItem | null;
      armor: ArenaEquippedItem | null;
      charm: ArenaEquippedItem | null;
    };
    selectedCard: ArenaCard | null;
  };
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
    materialDrops?: ArenaMaterialReward[];
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
  opponent: {
    userId: string;
    displayName: string;
    isNpc: boolean;
    level: number;
    eloRating: number | null;
    eloMatches: number;
    eloProvisional: boolean;
    stats: ArenaStatsBlock;
    equipment: {
      weapon: ArenaEquippedItem | null;
      armor: ArenaEquippedItem | null;
      charm: ArenaEquippedItem | null;
    };
    selectedCard: ArenaCard | null;
  };
  battle: ArenaActiveFightBattle;
  turns: ArenaBattleTurn[];
  score: { player: number; opponent: number };
  rewards?: {
    xp: number;
    coins: number;
    rarityCoinReward?: number;
    levelsGained?: number;
    materialDrops: ArenaMaterialReward[];
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
  type: "gear" | "consumable" | "material" | "instant";
  acquisition?: "buy" | "craft" | "drop";
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
  inputs: Array<{
    itemId: string;
    itemName?: string;
    required: number;
    quantity?: number;
    owned?: number;
  }>;
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

  constructor(
    message: string,
    input?: {
      status?: number;
      code?: string | null;
      retryAfterMs?: number | null;
      cooldownEndsAt?: string | null;
      nextDrawAt?: string | null;
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
  }
}

const DEFAULT_ELO_RATING = 1000;
const ELO_PROVISIONAL_MATCHES = 20;

function toFiniteNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeProfile(value: unknown): ArenaProfile {
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

function normalizeFightOpponent<T extends ArenaFightResponse["opponent"]>(
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

function normalizeActiveFight(value: unknown): ArenaActiveFight {
  const fight = value as ArenaActiveFight;
  return {
    ...fight,
    opponent: normalizeFightOpponent(fight.opponent),
  };
}

function normalizeLeaderboard(
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

async function readApiError(response: Response): Promise<ArenaApiError> {
  try {
    const payload = (await response.json()) as Record<string, unknown>;
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
      },
    );
  } catch {
    return new ArenaApiError("Arena request failed", {
      status: response.status,
    });
  }
}

function makeAuthHeaders(token: string) {
  return {
    ...(shouldSendBearerToken(token) ? { Authorization: `Bearer ${token}` } : {}),
    "Content-Type": "application/json",
  };
}

export async function fetchArenaProfile(token: string): Promise<ArenaProfile> {
  const response = await fetch(joinApi("/arena/profile"), {
    credentials: "include",
    headers: shouldSendBearerToken(token)
      ? { Authorization: `Bearer ${token}` }
      : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return normalizeProfile(await response.json());
}

export async function fetchArenaUpdates(limit = 5): Promise<ArenaUpdate[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const response = await fetch(joinApi(`/arena/updates?${params.toString()}`), {
    cache: "no-store",
  });
  if (!response.ok) {
    throw await readApiError(response);
  }
  const payload = (await response.json()) as { updates: ArenaUpdate[] };
  return payload.updates;
}

export async function createArenaUpdate(
  token: string,
  input: { title: string; body: string },
): Promise<ArenaUpdate> {
  const response = await fetch(joinApi("/arena/updates"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await readApiError(response);
  }
  const payload = (await response.json()) as { update: ArenaUpdate };
  return payload.update;
}

export async function deleteArenaUpdate(
  token: string,
  updateId: string,
): Promise<void> {
  const response = await fetch(
    joinApi(`/arena/updates/${encodeURIComponent(updateId)}`),
    {
      method: "DELETE",
      credentials: "include",
      headers: makeAuthHeaders(token),
    },
  );
  if (!response.ok) {
    throw await readApiError(response);
  }
}

// ---------------------------------------------------------------------------
//  Notifications
// ---------------------------------------------------------------------------

export async function fetchArenaNotifications(
  token: string,
  options: { page?: number; limit?: number } = {},
): Promise<{ notifications: ArenaNotification[]; page: number; limit: number; total: number; totalPages: number }> {
  const params = new URLSearchParams();
  if (options.page) params.set("page", String(options.page));
  if (options.limit) params.set("limit", String(options.limit));
  const response = await fetch(joinApi(`/arena/notifications?${params.toString()}`), {
    credentials: "include",
    headers: makeAuthHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { notifications: ArenaNotification[]; page: number; limit: number; total: number; totalPages: number };
}

export async function fetchArenaUnreadCount(
  token: string,
): Promise<number> {
  const response = await fetch(joinApi("/arena/notifications/unread-count"), {
    credentials: "include",
    headers: makeAuthHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  const payload = (await response.json()) as { count: number };
  return payload.count;
}

export async function markArenaNotificationRead(
  token: string,
  notificationId: string,
): Promise<void> {
  const response = await fetch(
    joinApi(`/arena/notifications/${encodeURIComponent(notificationId)}/read`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
    },
  );
  if (!response.ok) throw await readApiError(response);
}

export async function markAllArenaNotificationsRead(
  token: string,
): Promise<void> {
  const response = await fetch(joinApi("/arena/notifications/read-all"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
  });
  if (!response.ok) throw await readApiError(response);
}

// ---------------------------------------------------------------------------
//  Trade types
// ---------------------------------------------------------------------------

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
};

// ---------------------------------------------------------------------------
//  Trade API functions
// ---------------------------------------------------------------------------

export async function searchArenaTradeUsers(
  token: string,
  query: string,
): Promise<ArenaTradeUser[]> {
  const params = new URLSearchParams({ q: query });
  const response = await fetch(joinApi(`/arena/trade/users?${params.toString()}`), {
    credentials: "include",
    headers: makeAuthHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  const payload = (await response.json()) as { users: ArenaTradeUser[] };
  return payload.users;
}

export async function searchArenaTradeCards(
  token: string,
  query: string,
): Promise<ArenaCard[]> {
  const params = new URLSearchParams({ q: query });
  const response = await fetch(joinApi(`/arena/trade/cards?${params.toString()}`), {
    credentials: "include",
    headers: makeAuthHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  const payload = (await response.json()) as { cards: ArenaCard[] };
  return payload.cards;
}

export async function fetchArenaTradeListings(
  token: string,
  options: {
    page?: number;
    limit?: number;
    search?: string;
    wantedRarity?: string;
    wantedElement?: string;
  } = {},
): Promise<ArenaTradeListingsResponse> {
  const params = new URLSearchParams();
  if (options.page) params.set("page", String(options.page));
  if (options.limit) params.set("limit", String(options.limit));
  if (options.search) params.set("search", options.search);
  if (options.wantedRarity) params.set("wantedRarity", options.wantedRarity);
  if (options.wantedElement) params.set("wantedElement", options.wantedElement);
  const response = await fetch(joinApi(`/arena/trade/listings?${params.toString()}`), {
    credentials: "include",
    headers: makeAuthHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as ArenaTradeListingsResponse;
}

export async function fetchMyArenaTradeListings(
  token: string,
): Promise<ArenaTradeListingsResponse> {
  const response = await fetch(joinApi("/arena/trade/listings/mine"), {
    credentials: "include",
    headers: makeAuthHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as ArenaTradeListingsResponse;
}

export async function createArenaTradeListing(
  token: string,
  input: {
    cardInstanceId: string;
    wantedCardInstanceId?: string;
    wantedCardMalId?: number;
    wantedRarity?: string;
    wantedElement?: string;
    note?: string;
  },
): Promise<{ listing: ArenaTradeListing; profile: ArenaProfile }> {
  const response = await fetch(joinApi("/arena/trade/listings"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { listing: ArenaTradeListing; profile: ArenaProfile };
}

export async function cancelArenaTradeListing(
  token: string,
  listingId: string,
): Promise<{ listing: ArenaTradeListing; profile: ArenaProfile }> {
  const response = await fetch(
    joinApi(`/arena/trade/listings/${encodeURIComponent(listingId)}/cancel`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { listing: ArenaTradeListing; profile: ArenaProfile };
}

export async function sendArenaTradeRequest(
  token: string,
  responderId: string,
  cardInstanceId?: string,
  listingId?: string,
): Promise<{ requestId: string }> {
  const response = await fetch(joinApi("/arena/trade/request"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ responderId, cardInstanceId, listingId }),
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { requestId: string };
}

export async function fetchIncomingArenaTradeRequests(
  token: string,
): Promise<ArenaTradeRequest[]> {
  const response = await fetch(joinApi("/arena/trade/requests/incoming"), {
    credentials: "include",
    headers: makeAuthHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  const payload = (await response.json()) as { requests: ArenaTradeRequest[] };
  return payload.requests;
}

export async function acceptArenaTradeRequest(
  token: string,
  requestId: string,
): Promise<{ askerCard?: ArenaCard; responderCard?: ArenaCard; sessionId?: string }> {
  const response = await fetch(
    joinApi(`/arena/trade/requests/${encodeURIComponent(requestId)}/accept`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { askerCard?: ArenaCard; responderCard?: ArenaCard; sessionId?: string };
}

export async function denyArenaTradeRequest(
  token: string,
  requestId: string,
): Promise<{ status: string }> {
  const response = await fetch(
    joinApi(`/arena/trade/requests/${encodeURIComponent(requestId)}/deny`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { status: string };
}

export async function cancelArenaTradeRequest(
  token: string,
  requestId: string,
): Promise<{ status: string }> {
  const response = await fetch(
    joinApi(`/arena/trade/requests/${encodeURIComponent(requestId)}/cancel`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { status: string };
}

export async function fetchArenaTradeRequestStatus(
  token: string,
  requestId: string,
): Promise<{ id: string; askerId: string; responderId: string; status: string; createdAt: string; sessionId: string | null }> {
  const response = await fetch(
    joinApi(`/arena/trade/request/${encodeURIComponent(requestId)}`),
    {
      credentials: "include",
      headers: makeAuthHeaders(token),
      cache: "no-store",
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { id: string; askerId: string; responderId: string; status: string; createdAt: string; sessionId: string | null };
}

export async function fetchArenaTradeSession(
  token: string,
  sessionId: string,
): Promise<ArenaTradeSession | null> {
  const response = await fetch(
    joinApi(`/arena/trade/session/${encodeURIComponent(sessionId)}`),
    {
      credentials: "include",
      headers: makeAuthHeaders(token),
      cache: "no-store",
    },
  );
  if (!response.ok) throw await readApiError(response);
  const payload = (await response.json()) as { session: ArenaTradeSession | null };
  return payload.session;
}

export async function offerCardInArenaTrade(
  token: string,
  sessionId: string,
  cardInstanceId: string,
): Promise<ArenaTradeSession> {
  const response = await fetch(
    joinApi(`/arena/trade/session/${encodeURIComponent(sessionId)}/offer-card`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
      body: JSON.stringify({ cardInstanceId }),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as ArenaTradeSession;
}

export async function removeCardFromArenaTrade(
  token: string,
  sessionId: string,
  cardInstanceId?: string,
): Promise<ArenaTradeSession> {
  const response = await fetch(
    joinApi(`/arena/trade/session/${encodeURIComponent(sessionId)}/remove-card`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
      body: JSON.stringify({ cardInstanceId }),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as ArenaTradeSession;
}

export async function offerCoinsInArenaTrade(
  token: string,
  sessionId: string,
  amount: number,
): Promise<ArenaTradeSession> {
  const response = await fetch(
    joinApi(`/arena/trade/session/${encodeURIComponent(sessionId)}/offer-coins`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
      body: JSON.stringify({ amount }),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as ArenaTradeSession;
}

export async function removeCoinsFromArenaTrade(
  token: string,
  sessionId: string,
): Promise<ArenaTradeSession> {
  const response = await fetch(
    joinApi(`/arena/trade/session/${encodeURIComponent(sessionId)}/remove-coins`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as ArenaTradeSession;
}

export async function confirmArenaTrade(
  token: string,
  sessionId: string,
): Promise<ArenaTradeSession> {
  const response = await fetch(
    joinApi(`/arena/trade/session/${encodeURIComponent(sessionId)}/confirm`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as ArenaTradeSession;
}

export async function unconfirmArenaTrade(
  token: string,
  sessionId: string,
): Promise<ArenaTradeSession> {
  const response = await fetch(
    joinApi(`/arena/trade/session/${encodeURIComponent(sessionId)}/unconfirm`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as ArenaTradeSession;
}

export async function cancelArenaTradeSession(
  token: string,
  sessionId: string,
): Promise<{ status: string }> {
  const response = await fetch(
    joinApi(`/arena/trade/session/${encodeURIComponent(sessionId)}/cancel`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { status: string };
}

// ── TCG (Trading Card Game) ────────────────────────────

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

export async function fetchTcgEligibleCards(token: string): Promise<{ cards: ArenaCard[] }> {
  const response = await fetch(joinApi("/tcg/eligible-cards"), {
    credentials: "include",
    headers: shouldSendBearerToken(token) ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { cards: ArenaCard[] };
}

export async function startTcgSoloGame(token: string, elementPool?: string[], deckCards?: ArenaCard[], mode?: string): Promise<{ gameId: string }> {
  const response = await fetch(joinApi("/tcg/solo"), {
    method: "POST",
    credentials: "include",
    headers: { ...makeAuthHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ elementPool: elementPool ?? null, deckCards: deckCards ?? null, mode: mode ?? "solo" }),
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { gameId: string };
}

export async function joinTcgQueue(token: string): Promise<TcgQueueStatus> {
  const response = await fetch(joinApi("/tcg/queue"), {
    method: "POST",
    credentials: "include",
    headers: { ...makeAuthHeaders(token), "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as TcgQueueStatus;
}

export async function leaveTcgQueue(token: string): Promise<void> {
  await fetch(joinApi("/tcg/queue"), {
    method: "DELETE",
    credentials: "include",
    headers: makeAuthHeaders(token),
    cache: "no-store",
  });
}

export async function checkTcgQueue(token: string): Promise<TcgQueueStatus> {
  const response = await fetch(joinApi("/tcg/queue"), {
    credentials: "include",
    headers: shouldSendBearerToken(token) ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as TcgQueueStatus;
}

export async function submitTcgDeck(token: string, gameId: string, cards: ArenaCard[], elementPool?: string[]): Promise<{ ok: boolean; waiting?: boolean }> {
  const response = await fetch(joinApi(`/tcg/game/${gameId}/deck`), {
    method: "POST",
    credentials: "include",
    headers: { ...makeAuthHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ cards, elementPool: elementPool ?? null }),
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { ok: boolean; waiting?: boolean };
}

export async function fetchTcgGameState(token: string, gameId: string): Promise<TcgGameState> {
  const response = await fetch(joinApi(`/tcg/game/${gameId}`), {
    credentials: "include",
    headers: shouldSendBearerToken(token) ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as TcgGameState;
}

export async function submitTcgAction(
  token: string,
  gameId: string,
  action: { type: string; cardId?: string; slot?: string },
): Promise<{ ok: boolean; attackResult?: { damage: number; elementEffective: string | null; elementAttacker: string | null; ko: boolean; defenderHp: number; defenderMaxHp: number; attackerKey: string; defenderKey: string; attackId?: number } | null; aiActions?: string[] | null }> {
  const response = await fetch(joinApi(`/tcg/game/${gameId}/action`), {
    method: "POST",
    credentials: "include",
    headers: { ...makeAuthHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(action),
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { ok: boolean; attackResult?: { damage: number; elementEffective: string | null; elementAttacker: string | null; ko: boolean; defenderHp: number; defenderMaxHp: number; attackerKey: string; defenderKey: string; attackId?: number } | null };
}

export async function fetchArenaSkillTree(
  token: string,
): Promise<ArenaSkillTreeResponse> {
  const response = await fetch(joinApi("/arena/skill-tree"), {
    credentials: "include",
    headers: shouldSendBearerToken(token)
      ? { Authorization: `Bearer ${token}` }
      : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaSkillTreeResponse;
}

export async function activateArenaSkill(
  token: string,
  nodeId: string,
): Promise<ArenaSkillTreeResponse> {
  const response = await fetch(joinApi("/arena/skill-tree/activate"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ nodeId }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaSkillTreeResponse;
}

export async function resetArenaSkillTree(
  token: string,
): Promise<ArenaSkillTreeResponse> {
  const response = await fetch(joinApi("/arena/skill-tree/reset"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaSkillTreeResponse;
}

export async function drawArenaCard(
  token: string,
): Promise<{ card: ArenaCard; profile: ArenaProfile }> {
  const response = await fetch(joinApi("/arena/draw-card"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const payload = (await response.json()) as {
    card: ArenaCard;
    profile: ArenaProfile;
  };
  return {
    ...payload,
    profile: normalizeProfile(payload.profile),
  };
}

export async function drawArenaPack(
  token: string,
  count = 5,
): Promise<{ cards: ArenaCard[]; profile: ArenaProfile }> {
  const response = await fetch(joinApi("/arena/draw-pack"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ count }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const payload = (await response.json()) as {
    cards: ArenaCard[];
    profile: ArenaProfile;
  };
  return {
    ...payload,
    profile: normalizeProfile(payload.profile),
  };
}

export async function runArenaFight(
  token: string,
): Promise<ArenaFightResponse> {
  const response = await fetch(joinApi("/arena/fight"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const payload = (await response.json()) as ArenaFightResponse;
  return {
    ...payload,
    opponent: normalizeFightOpponent(payload.opponent),
    profile: normalizeProfile(payload.profile),
  };
}

export async function fetchArenaCollection(
  token: string,
  options: { page?: number; perPage?: number; sort?: string; search?: string; element?: string; duplicates?: boolean } = {},
): Promise<ArenaCollectionResponse> {
  const params = new URLSearchParams();
  if (options.page) params.set("page", String(options.page));
  if (options.perPage) params.set("perPage", String(options.perPage));
  if (options.sort) params.set("sort", options.sort);
  if (options.search) params.set("search", options.search);
  if (options.element) params.set("element", options.element);
  if (options.duplicates) params.set("duplicates", "1");
  const response = await fetch(joinApi(`/arena/collection?${params.toString()}`), {
    credentials: "include",
    headers: shouldSendBearerToken(token)
      ? { Authorization: `Bearer ${token}` }
      : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaCollectionResponse;
}

export async function fetchArenaArchive(
  token: string,
  options: {
    page?: number;
    perPage?: number;
    search?: string;
    ownership?: "all" | "owned" | "not-owned";
  } = {},
): Promise<ArenaArchiveResponse> {
  const params = new URLSearchParams();
  if (options.page) params.set("page", String(options.page));
  if (options.perPage) params.set("perPage", String(options.perPage));
  if (options.search) params.set("search", options.search);
  if (options.ownership && options.ownership !== "all") {
    params.set("ownership", options.ownership);
  }
  const response = await fetch(joinApi(`/arena/archive?${params.toString()}`), {
    credentials: "include",
    headers: shouldSendBearerToken(token)
      ? { Authorization: `Bearer ${token}` }
      : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaArchiveResponse;
}

export async function selectArenaCollectionCard(
  token: string,
  cardInstanceId: string,
): Promise<ArenaSelectCollectionCardResponse> {
  const response = await fetch(joinApi("/arena/collection/select-card"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ cardInstanceId }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaSelectCollectionCardResponse;
}

export async function toggleArenaCollectionCardFavorite(
  token: string,
  cardInstanceId: string,
): Promise<{ cardInstanceId: string; isFavorite: boolean }> {
  const response = await fetch(joinApi("/arena/collection/toggle-favorite"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ cardInstanceId }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as { cardInstanceId: string; isFavorite: boolean };
}

export type ArenaMintDuplicateGroup = {
  malId: number;
  cards: ArenaCard[];
  total: number;
};

export async function fetchMintDuplicates(
  token: string,
): Promise<ArenaMintDuplicateGroup[]> {
  const response = await fetch(joinApi("/arena/mint/duplicates"), {
    credentials: "include",
    headers: shouldSendBearerToken(token)
      ? { Authorization: `Bearer ${token}` }
      : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaMintDuplicateGroup[];
}

export type ArenaMintResponse = {
  card: ArenaCard;
  profile: ArenaProfile;
};

export async function mintRainbowCard(
  token: string,
  cardInstanceId1: string,
  cardInstanceId2: string,
): Promise<ArenaMintResponse> {
  const response = await fetch(joinApi("/arena/mint"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ cardInstanceId1, cardInstanceId2 }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaMintResponse;
}

export async function fetchArenaMarketListings(
  token: string,
  filters: {
    page?: number;
    limit?: number;
    search?: string;
    rarity?: string;
    ivBand?: string;
    sort?: ArenaMarketSort;
  } = {},
): Promise<ArenaMarketListingsResponse> {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.search) params.set("search", filters.search);
  if (filters.rarity) params.set("rarity", filters.rarity);
  if (filters.ivBand) params.set("ivBand", filters.ivBand);
  if (filters.sort) params.set("sort", filters.sort);
  const response = await fetch(
    joinApi(`/arena/market/listings?${params.toString()}`),
    {
      credentials: "include",
      headers: shouldSendBearerToken(token)
        ? { Authorization: `Bearer ${token}` }
        : undefined,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaMarketListingsResponse;
}

export async function fetchMyArenaMarketListings(
  token: string,
): Promise<ArenaMarketListingsResponse> {
  const response = await fetch(joinApi("/arena/market/listings/mine"), {
    credentials: "include",
    headers: shouldSendBearerToken(token)
      ? { Authorization: `Bearer ${token}` }
      : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaMarketListingsResponse;
}

export async function fetchArenaMarketPriceGuide(
  token: string,
  card: Pick<ArenaCard, "malId" | "rarity" | "iv">,
): Promise<ArenaMarketPriceGuideResponse> {
  const params = new URLSearchParams({
    malId: String(card.malId),
    ivTotal: String(card.iv.total),
    rarity: card.rarity,
  });
  const response = await fetch(
    joinApi(`/arena/market/price?${params.toString()}`),
    {
      credentials: "include",
      headers: shouldSendBearerToken(token)
        ? { Authorization: `Bearer ${token}` }
        : undefined,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaMarketPriceGuideResponse;
}

export async function createArenaMarketListing(
  token: string,
  cardInstanceId: string,
  price: number,
): Promise<ArenaMarketMutationResponse> {
  const response = await fetch(joinApi("/arena/market/listings"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ cardInstanceId, price }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaMarketMutationResponse;
}

export async function buyArenaMarketListing(
  token: string,
  listingId: string,
): Promise<ArenaMarketMutationResponse> {
  const response = await fetch(
    joinApi(`/arena/market/listings/${encodeURIComponent(listingId)}/buy`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
      body: JSON.stringify({}),
    },
  );

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaMarketMutationResponse;
}

export async function cancelArenaMarketListing(
  token: string,
  listingId: string,
): Promise<ArenaMarketMutationResponse> {
  const response = await fetch(
    joinApi(`/arena/market/listings/${encodeURIComponent(listingId)}/cancel`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
      body: JSON.stringify({}),
    },
  );

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaMarketMutationResponse;
}

export async function fetchArenaShop(token: string): Promise<ArenaShopResponse> {
  const response = await fetch(joinApi("/arena/shop"), {
    credentials: "include",
    headers: shouldSendBearerToken(token)
      ? { Authorization: `Bearer ${token}` }
      : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaShopResponse;
}

export async function fetchArenaCardShop(
  token: string,
  forceRandomPack = false,
): Promise<ArenaCardShopResponse> {
  const url = joinApi(`/arena/shop/cards${forceRandomPack ? "?forceRandomPack=1" : ""}`);
  const response = await fetch(url, {
    credentials: "include",
    headers: shouldSendBearerToken(token)
      ? { Authorization: `Bearer ${token}` }
      : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaCardShopResponse;
}

export async function buyArenaShopCard(
  token: string,
  purchase:
    | { kind: "daily"; offerId: string }
    | { kind: "random"; forceRandomPack?: boolean },
): Promise<ArenaCardShopPurchaseResponse> {
  const response = await fetch(joinApi("/arena/shop/cards/buy"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify(purchase),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaCardShopPurchaseResponse;
}

export async function buyArenaItem(
  token: string,
  itemId: string,
): Promise<{ purchasedItemId: string; appliedInstantly: boolean; rolledPieceId: string | null; rolledPiece: { slot: string; mainStatType: string; mainStatValue: number; subStats: ArenaSubStat[] } | null; shop: ArenaShopResponse }> {
  const response = await fetch(joinApi("/arena/shop/buy"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ itemId }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as {
    purchasedItemId: string;
    appliedInstantly: boolean;
    rolledPieceId: string | null;
    rolledPiece: { slot: string; mainStatType: string; mainStatValue: number; subStats: ArenaSubStat[] } | null;
    shop: ArenaShopResponse;
  };
}

export async function useArenaConsumable(
  token: string,
  itemId: string,
): Promise<{ activatedItemId: string; effects: ArenaProfile["effects"]; shop: ArenaShopResponse }> {
  const response = await fetch(joinApi("/arena/shop/use-consumable"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ itemId }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as {
    activatedItemId: string;
    effects: ArenaProfile["effects"];
    shop: ArenaShopResponse;
  };
}

export async function equipArenaItem(
  token: string,
  pieceId: string,
): Promise<{
  equippedPieceId: string;
  slot: "weapon" | "armor" | "charm";
  shop: ArenaShopResponse;
}> {
  const response = await fetch(joinApi("/arena/shop/equip"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ pieceId }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as {
    equippedPieceId: string;
    slot: "weapon" | "armor" | "charm";
    shop: ArenaShopResponse;
  };
}

export async function unequipArenaSlot(
  token: string,
  slot: string,
): Promise<{ success: boolean; slot: string }> {
  const response = await fetch(joinApi("/arena/shop/unequip"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ slot }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as { success: boolean; slot: string };
}

export async function fodderArenaPiece(
  token: string,
  pieceId: string,
  refundAmount?: number,
): Promise<{ fodderPieceId: string; coinsGained: number }> {
  const response = await fetch(joinApi("/arena/shop/fodder"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ pieceId, refundAmount }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as { fodderPieceId: string; coinsGained: number };
}

export async function saveEquipmentLoadout(
  token: string,
  name?: string,
): Promise<{ loadout: ArenaEquipmentLoadout; shop: ArenaShopResponse }> {
  const response = await fetch(joinApi("/arena/loadout/save"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as { loadout: ArenaEquipmentLoadout; shop: ArenaShopResponse };
}

export async function restoreEquipmentLoadout(
  token: string,
  loadoutId: string,
): Promise<{ loadoutId: string; restored: string[]; shop: ArenaShopResponse }> {
  const response = await fetch(joinApi("/arena/loadout/restore"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ loadoutId }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as { loadoutId: string; restored: string[]; shop: ArenaShopResponse };
}

export async function deleteEquipmentLoadout(
  token: string,
  loadoutId: string,
): Promise<{ success: boolean; loadoutId: string; shop: ArenaShopResponse }> {
  const response = await fetch(joinApi("/arena/loadout/delete"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ loadoutId }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as { success: boolean; loadoutId: string; shop: ArenaShopResponse };
}

export async function craftArenaRecipe(
  token: string,
  recipeId: string,
  quantity = 1,
): Promise<{ craftedRecipeId: string; outputItemId: string; craftedQuantity: number; shop: ArenaShopResponse }> {
  const response = await fetch(joinApi("/arena/shop/craft"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ recipeId, quantity }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as {
    craftedRecipeId: string;
    outputItemId: string;
    craftedQuantity: number;
    shop: ArenaShopResponse;
  };
}

export async function fetchArenaLeaderboard(
  metric: ArenaMetric,
  options: { page?: number; perPage?: number } = {},
): Promise<ArenaLeaderboardResponse> {
  const params = new URLSearchParams({ metric });
  if (options.page) params.set("page", String(options.page));
  if (options.perPage) params.set("perPage", String(options.perPage));
  const response = await fetch(joinApi(`/arena/leaderboard?${params.toString()}`), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return normalizeLeaderboard(await response.json(), metric);
}

export async function startPlaybackFight(
  token: string,
): Promise<ArenaActiveFight> {
  const response = await fetch(joinApi("/arena/fight/start"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return normalizeActiveFight(await response.json());
}

export async function fetchFightState(
  token: string,
): Promise<{ activeFight: ArenaActiveFight | null }> {
  const response = await fetch(joinApi("/arena/fight/state"), {
    credentials: "include",
    headers: shouldSendBearerToken(token)
      ? { Authorization: `Bearer ${token}` }
      : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const payload = (await response.json()) as {
    activeFight: ArenaActiveFight | null;
  };
  return {
    activeFight: payload.activeFight
      ? normalizeActiveFight(payload.activeFight)
      : null,
  };
}

export async function advanceFightTurn(
  token: string,
): Promise<ArenaActiveFight> {
  const response = await fetch(joinApi("/arena/fight/advance"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return normalizeActiveFight(await response.json());
}

export async function skipFight(
  token: string,
): Promise<ArenaActiveFight> {
  const response = await fetch(joinApi("/arena/fight/skip"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return normalizeActiveFight(await response.json());
}

export async function verifyArena(
  token: string,
  turnstileToken: string,
): Promise<void> {
  const response = await fetch(joinApi("/arena/verify"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ turnstileToken }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }
}

export async function fetchArenaHallOfFame(
  options: { month?: string; page?: number } = {},
): Promise<ArenaHallOfFameResponse> {
  const params = new URLSearchParams();
  if (options.month) params.set("month", options.month);
  if (options.page) params.set("page", String(options.page));

  const query = params.toString();
  const response = await fetch(
    joinApi(`/arena/hall-of-fame${query ? `?${query}` : ""}`),
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw await readApiError(response);
  }

  return response.json();
}
