import type { ArenaSubStat, ArenaProfile, ArenaShopResponse } from "./shared";
import { arenaRequest } from "./shared";

export async function fetchArenaShop(token: string): Promise<ArenaShopResponse> {
  return arenaRequest("/arena/shop", { token });
}
export async function buyArenaItem(
  token: string,
  itemId: string,
): Promise<{ purchasedItemId: string; appliedInstantly: boolean; rolledPieceId: string | null; rolledPiece: { slot: string; mainStatType: string; mainStatValue: number; subStats: ArenaSubStat[]; fodderRefund: number } | null; shop: ArenaShopResponse }> {
  return arenaRequest("/arena/shop/buy", { token, body: { itemId } });
}
export async function useArenaConsumable(
  token: string,
  itemId: string,
  options: boolean | { force?: boolean; replaceItemId?: string | null } = false,
): Promise<{ activatedItemId: string; effects: ArenaProfile["effects"]; shop: ArenaShopResponse }> {
  const body = typeof options === "boolean"
    ? { itemId, force: options }
    : {
        itemId,
        force: Boolean(options.force),
        replaceItemId: options.replaceItemId ?? null,
      };
  return arenaRequest("/arena/shop/use-consumable", { token, body });
}
export async function craftArenaRecipe(
  token: string,
  recipeId: string,
  quantity = 1,
): Promise<{ craftedRecipeId: string; outputItemId: string; craftedQuantity: number; shop: ArenaShopResponse }> {
  return arenaRequest("/arena/shop/craft", { token, body: { recipeId, quantity } });
}
