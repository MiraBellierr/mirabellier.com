import { joinApi } from "@/lib/config";

export type ArenaMetric = "level" | "win_rate" | "rich";

export type ArenaStatsBlock = {
  hp: number;
  power: number;
  guard: number;
  speed: number;
  luck: number;
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
  nextCardDrawAt: string | null;
  lastCardDrawDate: string | null;
  lifetimeCoinsEarned: number;
  effects: {
    expBoostPct: number;
    expBoostWinsRemaining: number;
    coinBoostPct: number;
    coinBoostWinsRemaining: number;
    refocusCharges: number;
    streakShieldCharges: number;
    upgradeLowestRarityCharges: number;
    guaranteeSsrPlusCharges: number;
    ascensionLastPurchasedAt: string | null;
  };
  equipment: {
    weapon: ArenaEquippedItem | null;
    armor: ArenaEquippedItem | null;
    charm: ArenaEquippedItem | null;
  };
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
  };
  effectUsage: {
    usedRefocus: boolean;
    usedUpgradeLowest: boolean;
    usedGuaranteeSsrPlus: boolean;
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
  type: "gear" | "consumable" | "instant";
  slot?: "weapon" | "armor" | "charm";
  stats?: Partial<ArenaStatsBlock>;
  effect?: Record<string, unknown>;
  ownedQuantity: number;
  isOwned: boolean;
  isEquipped: boolean;
  unlocked: boolean;
  canBuy: boolean;
  cooldownEndsAt?: string | null;
};

export type ArenaShopTier = {
  tier: string;
  items: ArenaShopItem[];
};

export type ArenaShopResponse = {
  profile: ArenaProfile;
  shop: ArenaShopTier[];
  equipped: {
    weapon: ArenaEquippedItem | null;
    armor: ArenaEquippedItem | null;
    charm: ArenaEquippedItem | null;
  };
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
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function fetchArenaProfile(token: string): Promise<ArenaProfile> {
  const response = await fetch(joinApi("/arena/profile"), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
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
  const response = await fetch(joinApi("/arena/draw-card"), {
    method: "POST",
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
    headers: {
      Authorization: `Bearer ${token}`,
    },
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
    headers: {
      Authorization: `Bearer ${token}`,
    },
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
