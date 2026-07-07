import { joinApi } from "@/lib/config";
import { shouldSendBearerToken } from "@/lib/auth-session";
import type { ArenaCard, TcgGameState, TcgQueueStatus } from "./shared";
import { readApiError, makeAuthHeaders } from "./shared";

export async function fetchTcgEligibleCards(token: string): Promise<{ cards: ArenaCard[] }> {
  const response = await fetch(joinApi("/tcg/eligible-cards"), {
    credentials: "include",
    headers: shouldSendBearerToken(token) ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { cards: ArenaCard[] };
}
export async function startTcgSoloGame(token: string, elementPool?: string[], deckCards?: ArenaCard[], mode?: string): Promise<{ gameId: string }> {
  const response = await fetch(joinApi("/tcg/solo"), {
    method: "POST",
    credentials: "include",
    headers: { ...makeAuthHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ elementPool: elementPool ?? null, deckCards: deckCards ?? null, mode: mode ?? "solo" }),
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { gameId: string };
}
export async function joinTcgQueue(token: string): Promise<TcgQueueStatus> {
  const response = await fetch(joinApi("/tcg/queue"), {
    method: "POST",
    credentials: "include",
    headers: { ...makeAuthHeaders(token), "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as TcgQueueStatus;
}
export async function leaveTcgQueue(token: string): Promise<void> {
  await fetch(joinApi("/tcg/queue"), {
    method: "DELETE",
    credentials: "include",
    headers: makeAuthHeaders(token),
    cache: "no-store",
  });
}
export async function checkTcgQueue(token: string): Promise<TcgQueueStatus> {
  const response = await fetch(joinApi("/tcg/queue"), {
    credentials: "include",
    headers: shouldSendBearerToken(token) ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as TcgQueueStatus;
}
export async function fetchActiveTcgGame(token: string): Promise<{ gameId: string | null }> {
  const response = await fetch(joinApi("/tcg/active-game"), {
    credentials: "include",
    headers: shouldSendBearerToken(token) ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { gameId: string | null };
}
export async function submitTcgDeck(token: string, gameId: string, cards: ArenaCard[], elementPool?: string[]): Promise<{ ok: boolean; waiting?: boolean }> {
  const response = await fetch(joinApi(`/tcg/game/${gameId}/deck`), {
    method: "POST",
    credentials: "include",
    headers: { ...makeAuthHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ cards, elementPool: elementPool ?? null }),
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { ok: boolean; waiting?: boolean };
}
export async function fetchTcgGameState(token: string, gameId: string): Promise<TcgGameState> {
  const response = await fetch(joinApi(`/tcg/game/${gameId}`), {
    credentials: "include",
    headers: shouldSendBearerToken(token) ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as TcgGameState;
}
export async function submitTcgAction(
  token: string,
  gameId: string,
  action: { type: string; cardId?: string; slot?: string },
): Promise<{ ok: boolean; attackResult?: { damage: number; elementEffective: string | null; elementAttacker: string | null; ko: boolean; defenderHp: number; defenderMaxHp: number; attackerKey: string; defenderKey: string; attackId?: number } | null; aiActions?: string[] | null }> {
  const response = await fetch(joinApi(`/tcg/game/${gameId}/action`), {
    method: "POST",
    credentials: "include",
    headers: { ...makeAuthHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(action),
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { ok: boolean; attackResult?: { damage: number; elementEffective: string | null; elementAttacker: string | null; ko: boolean; defenderHp: number; defenderMaxHp: number; attackerKey: string; defenderKey: string; attackId?: number } | null };
}
