import { joinApi } from "@/lib/config";
import { shouldSendBearerToken } from "@/lib/auth-session";

export type ArenaMetric = "level" | "win_rate" | "rich";

export type ArenaStatsBlock = {
  hp: number;
  power: number;
  guard: number;
  speed: number;
  luck: number;
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
  source?: {
    itemId: string;
    itemName: string;
    slot: "weapon" | "armor" | "charm";
    tier: string;
    equippedAt?: string | null;
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
  luck: number;
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
  stats: {
    base: ArenaStatsBlock;
    equipment: ArenaStatsBlock;
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
  };
  equipment: {
    weapon: ArenaEquippedItem | null;
    armor: ArenaEquippedItem | null;
    charm: ArenaEquippedItem | null;
  };
  activePassives?: ArenaPassiveRule[];
  materialInventory?: Record<string, number>;
  catalogVersion?: string;
  recentFights?: ArenaRecentFight[];
  lastFightAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ArenaEquippedItem = {
  itemId: string;
  name: string;
  slot: "weapon" | "armor" | "charm";
  tier: string;
  stats: Partial<ArenaStatsBlock>;
  equippedAt: string | null;
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
};

export type ArenaBattleConsoleEvent = {
  line: string;
  playerHp: number;
  opponentHp: number;
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
    materialDrops?: Array<{ itemId: string; quantity: number }>;
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

export type ArenaCollectionResponse = {
  profile: ArenaProfile;
  cards: ArenaCard[];
  limit: number;
};

export type ArenaSelectCollectionCardResponse = {
  selectedCard: ArenaCard;
  profile: ArenaProfile;
};

export type ArenaShopItem = {
  id: string;
  name: string;
  tier: string;
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
  shop: ArenaShopTier[];
  recipes: ArenaShopRecipe[];
  equipped: {
    weapon: ArenaEquippedItem | null;
    armor: ArenaEquippedItem | null;
    charm: ArenaEquippedItem | null;
  };
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
  limit: number;
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
    updatedAt: string | null;
  }>;
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

let jikanHealthRequest: Promise<void> | null = null;

async function checkJikanHealth(): Promise<void> {
  try {
    const response = await fetch("https://api.jikan.moe/v4/health", {
      cache: "no-store",
    });

    if (response.status >= 400 && response.status < 600) {
      throw new ArenaApiError("Arena is in maintenance. Please try again later.", {
        status: response.status,
        code: "JIKAN_MAINTENANCE",
      });
    }
  } catch (error) {
    if (error instanceof ArenaApiError) throw error;
    throw new ArenaApiError("Arena is in maintenance. Please try again later.", {
      status: 503,
      code: "JIKAN_MAINTENANCE",
    });
  }
}

async function ensureJikanHealth(): Promise<void> {
  jikanHealthRequest ||= checkJikanHealth().finally(() => {
    jikanHealthRequest = null;
  });
  await jikanHealthRequest;
}

function normalizeProfile(value: unknown): ArenaProfile {
  return value as ArenaProfile;
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

export async function drawArenaCard(
  token: string,
): Promise<{ card: ArenaCard; profile: ArenaProfile }> {
  await ensureJikanHealth();

  const response = await fetch(joinApi("/arena/draw-card"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as { card: ArenaCard; profile: ArenaProfile };
}

export async function runArenaFight(token: string): Promise<ArenaFightResponse> {
  const response = await fetch(joinApi("/arena/fight"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaFightResponse;
}

export async function fetchArenaCollection(
  token: string,
  limit = 200,
): Promise<ArenaCollectionResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
  });
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

export async function buyArenaItem(
  token: string,
  itemId: string,
): Promise<{ purchasedItemId: string; appliedInstantly: boolean; shop: ArenaShopResponse }> {
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
  limit = 50,
): Promise<ArenaLeaderboardResponse> {
  const params = new URLSearchParams({
    metric,
    limit: String(limit),
  });
  const response = await fetch(joinApi(`/arena/leaderboard?${params.toString()}`), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaLeaderboardResponse;
}
