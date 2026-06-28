import { joinApi } from "@/lib/config";
import { shouldSendBearerToken } from "@/lib/auth-session";
import type { ArenaCard, ArenaMarketListingsResponse, ArenaMarketMutationResponse, ArenaMarketPriceGuideResponse, ArenaMarketSort } from "./shared";
import { readApiError, makeAuthHeaders } from "./shared";

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
