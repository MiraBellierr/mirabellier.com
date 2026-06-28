import { joinApi } from "@/lib/config";
import { shouldSendBearerToken } from "@/lib/auth-session";
import type { ArenaSubStat, ArenaProfile, ArenaShopResponse } from "./shared";
import { readApiError, makeAuthHeaders } from "./shared";

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
