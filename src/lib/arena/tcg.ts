import type { ArenaCard, TcgGameState, TcgQueueStatus } from "./shared";
import { arenaRequest } from "./shared";

export async function fetchTcgEligibleCards(token: string): Promise<{ cards: ArenaCard[] }> {
  return arenaRequest("/tcg/eligible-cards", { token });
}
export async function startTcgSoloGame(token: string, elementPool?: string[], deckCards?: ArenaCard[], mode?: string): Promise<{ gameId: string }> {
  return arenaRequest("/tcg/solo", {
    token,
    body: {
      elementPool: elementPool ?? null,
      deckCards: deckCards ?? null,
      mode: mode ?? "solo",
    },
  });
}
export async function joinTcgQueue(token: string): Promise<TcgQueueStatus> {
  return arenaRequest("/tcg/queue", { token, method: "POST", body: {} });
}
export async function leaveTcgQueue(token: string): Promise<void> {
  // Best-effort cleanup — never surface an error to the caller.
  try {
    await arenaRequest<void>("/tcg/queue", { token, method: "DELETE" });
  } catch {
    /* ignore */
  }
}
export async function checkTcgQueue(token: string): Promise<TcgQueueStatus> {
  return arenaRequest("/tcg/queue", { token });
}
export async function fetchActiveTcgGame(token: string): Promise<{ gameId: string | null }> {
  return arenaRequest("/tcg/active-game", { token });
}
export async function submitTcgDeck(token: string, gameId: string, cards: ArenaCard[], elementPool?: string[]): Promise<{ ok: boolean; waiting?: boolean }> {
  return arenaRequest(`/tcg/game/${gameId}/deck`, {
    token,
    body: { cards, elementPool: elementPool ?? null },
  });
}
export async function fetchTcgGameState(token: string, gameId: string): Promise<TcgGameState> {
  return arenaRequest(`/tcg/game/${gameId}`, { token });
}
export async function submitTcgAction(
  token: string,
  gameId: string,
  action: { type: string; cardId?: string; slot?: string },
): Promise<{ ok: boolean; attackResult?: { damage: number; elementEffective: string | null; elementAttacker: string | null; ko: boolean; defenderHp: number; defenderMaxHp: number; attackerKey: string; defenderKey: string; attackId?: number } | null; aiActions?: string[] | null }> {
  return arenaRequest(`/tcg/game/${gameId}/action`, { token, body: action });
}
