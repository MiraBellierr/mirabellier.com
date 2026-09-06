import type { ArenaCard, ArenaMarketListingsResponse, ArenaMarketMutationResponse, ArenaMarketPriceGuideResponse, ArenaMarketSort } from "./shared";
import { arenaRequest } from "./shared";

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
  signal?: AbortSignal,
): Promise<ArenaMarketListingsResponse> {
  return arenaRequest("/arena/market/listings", {
    token,
    signal,
    query: {
      page: filters.page,
      limit: filters.limit,
      search: filters.search,
      rarity: filters.rarity,
      ivBand: filters.ivBand,
      sort: filters.sort,
    },
  });
}
export async function fetchMyArenaMarketListings(
  token: string,
  signal?: AbortSignal,
): Promise<ArenaMarketListingsResponse> {
  return arenaRequest("/arena/market/listings/mine", { token, signal });
}
export async function fetchArenaMarketPriceGuide(
  token: string,
  card: Pick<ArenaCard, "malId" | "rarity" | "iv">,
): Promise<ArenaMarketPriceGuideResponse> {
  return arenaRequest("/arena/market/price", {
    token,
    query: {
      malId: card.malId,
      ivTotal: card.iv.total,
      rarity: card.rarity,
    },
  });
}
export async function createArenaMarketListing(
  token: string,
  cardInstanceId: string,
  price: number,
): Promise<ArenaMarketMutationResponse> {
  return arenaRequest("/arena/market/listings", {
    token,
    body: { cardInstanceId, price },
  });
}
export async function buyArenaMarketListing(
  token: string,
  listingId: string,
): Promise<ArenaMarketMutationResponse> {
  return arenaRequest(
    `/arena/market/listings/${encodeURIComponent(listingId)}/buy`,
    { token, body: {} },
  );
}
export async function cancelArenaMarketListing(
  token: string,
  listingId: string,
): Promise<ArenaMarketMutationResponse> {
  return arenaRequest(
    `/arena/market/listings/${encodeURIComponent(listingId)}/cancel`,
    { token, body: {} },
  );
}
