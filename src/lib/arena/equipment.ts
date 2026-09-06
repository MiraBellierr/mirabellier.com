import type { ArenaEquipmentLoadout, ArenaShopResponse } from "./shared";
import { arenaRequest } from "./shared";

export async function equipArenaItem(
  token: string,
  pieceId: string,
): Promise<{
  equippedPieceId: string;
  slot: "weapon" | "armor" | "charm";
  shop: ArenaShopResponse;
}> {
  return arenaRequest("/arena/shop/equip", { token, body: { pieceId } });
}
export async function unequipArenaSlot(
  token: string,
  slot: string,
): Promise<{ success: boolean; slot: string }> {
  return arenaRequest("/arena/shop/unequip", { token, body: { slot } });
}
export async function lockArenaPiece(
  token: string,
  pieceId: string,
): Promise<{ pieceId: string; locked: true }> {
  return arenaRequest("/arena/shop/lock", { token, body: { pieceId } });
}
export async function unlockArenaPiece(
  token: string,
  pieceId: string,
): Promise<{ pieceId: string; locked: false }> {
  return arenaRequest("/arena/shop/unlock", { token, body: { pieceId } });
}
export async function fodderArenaPiece(
  token: string,
  pieceId: string,
): Promise<{ fodderPieceId: string; coinsGained: number }> {
  return arenaRequest("/arena/shop/fodder", { token, body: { pieceId } });
}
export async function enhanceArenaPiece(
  token: string,
  pieceId: string,
  fodderPieceId: string,
): Promise<{
  pieceId: string;
  fodderPieceId: string;
  previousLevel: number;
  enhancementLevel: number;
  coinCost: number;
  shop: ArenaShopResponse;
}> {
  return arenaRequest("/arena/shop/enhance", {
    token,
    body: { pieceId, fodderPieceId },
  });
}
export async function rerollArenaSubStat(
  token: string,
  pieceId: string,
  subStatIndex: number,
  fodderPieceId: string,
): Promise<{
  pieceId: string;
  fodderPieceId: string;
  subStatIndex: number;
  oldSubStat: { type: string; value: number };
  newSubStat: { type: string; value: number };
  coinCost: number;
  shop: ArenaShopResponse;
}> {
  return arenaRequest("/arena/shop/reroll-substat", {
    token,
    body: { pieceId, subStatIndex, fodderPieceId },
  });
}
export async function saveEquipmentLoadout(
  token: string,
  name?: string,
): Promise<{ loadout: ArenaEquipmentLoadout; shop: ArenaShopResponse }> {
  return arenaRequest("/arena/loadout/save", { token, body: { name } });
}
export async function restoreEquipmentLoadout(
  token: string,
  loadoutId: string,
): Promise<{ loadoutId: string; restored: string[]; shop: ArenaShopResponse }> {
  return arenaRequest("/arena/loadout/restore", { token, body: { loadoutId } });
}
export async function deleteEquipmentLoadout(
  token: string,
  loadoutId: string,
): Promise<{ success: boolean; loadoutId: string; shop: ArenaShopResponse }> {
  return arenaRequest("/arena/loadout/delete", { token, body: { loadoutId } });
}
