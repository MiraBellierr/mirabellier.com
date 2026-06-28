import { joinApi } from "@/lib/config";
import type { ArenaEquipmentLoadout, ArenaShopResponse } from "./shared";
import { readApiError, makeAuthHeaders } from "./shared";

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
