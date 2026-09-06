import type { ArenaCardShopResponse, ArenaCardShopPurchaseResponse } from "./shared";
import { arenaRequest } from "./shared";

export async function fetchArenaCardShop(
  token: string,
  forceRandomPack = false,
  signal?: AbortSignal,
): Promise<ArenaCardShopResponse> {
  return arenaRequest("/arena/shop/cards", {
    token,
    query: { forceRandomPack: forceRandomPack ? 1 : undefined },
    signal,
  });
}
export async function buyArenaShopCard(
  token: string,
  purchase:
    | { kind: "daily"; offerId: string }
    | { kind: "random"; forceRandomPack?: boolean },
): Promise<ArenaCardShopPurchaseResponse> {
  return arenaRequest("/arena/shop/cards/buy", { token, body: purchase });
}
