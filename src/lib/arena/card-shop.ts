import { joinApi } from "@/lib/config";
import { shouldSendBearerToken } from "@/lib/auth-session";
import type { ArenaCardShopResponse, ArenaCardShopPurchaseResponse } from "./shared";
import { readApiError, makeAuthHeaders } from "./shared";

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
