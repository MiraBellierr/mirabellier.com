import { ArenaApiError, type ArenaCard, type TcgCard, type TcgGameState, type TcgPlayerState } from "@/lib/arena";
import { RARITY_ORDER, type CollectionSort, type MobileTcgDrag } from "@/lib/tcg-constants";

// ── Card helpers ──

export function rarityRank(rarity: string | null | undefined) {
  const index = RARITY_ORDER.indexOf((rarity || "C") as (typeof RARITY_ORDER)[number]);
  return index >= 0 ? index : 0;
}

export function sortDeckCards(cards: ArenaCard[], sort: CollectionSort) {
  return [...cards].sort((a, b) => {
    const byDate = (Date.parse(b.drawnAt || "") || 0) - (Date.parse(a.drawnAt || "") || 0);
    if (sort === "rarity-desc") return rarityRank(b.rarity) - rarityRank(a.rarity) || byDate;
    if (sort === "rarity-asc") return rarityRank(a.rarity) - rarityRank(b.rarity) || byDate;
    if (sort === "iv-desc") return (b.iv?.total || 0) - (a.iv?.total || 0) || byDate;
    if (sort === "iv-asc") return (a.iv?.total || 0) - (b.iv?.total || 0) || byDate;
    if (sort === "power-desc") return (b.iv?.power || 0) - (a.iv?.power || 0) || byDate;
    if (sort === "guard-desc") return (b.iv?.guard || 0) - (a.iv?.guard || 0) || byDate;
    if (sort === "speed-desc") return (b.iv?.speed || 0) - (a.iv?.speed || 0) || byDate;
    if (sort === "effectHit-desc") return (b.iv?.effectHit || 0) - (a.iv?.effectHit || 0) || byDate;
    return byDate;
  });
}

export function readMobileTcgDrag(target: EventTarget | null): MobileTcgDrag | null {
  if (!(target instanceof Element)) return null;
  const dragElement = target.closest("[data-tcg-drag-kind]") as HTMLElement | null;
  if (!dragElement) return null;

  const kind = dragElement.dataset.tcgDragKind;
  if (kind === "card" && dragElement.dataset.tcgCardId) return { kind, cardId: dragElement.dataset.tcgCardId };
  if (kind === "draw") return { kind };
  if (kind === "attack") return { kind };
  if (kind === "promote" && dragElement.dataset.tcgPromoteSlot) return { kind, slot: dragElement.dataset.tcgPromoteSlot };
  if (kind === "element" && dragElement.dataset.tcgElement) return { kind, element: dragElement.dataset.tcgElement };
  return null;
}

export function normalizeArenaError(error: unknown) {
  if (error instanceof ArenaApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

export function toCardId(card: TcgCard | ArenaCard | null): string {
  if (!card) return "";
  return card.cardInstanceId || `${card.malId}-${card.drawnAt || "card"}`;
}

// ── Game rule helpers ──

export function canTcgCardAttack(card: TcgCard | null | undefined) {
  const assigned = card?.assignedElements || [];
  return !!card?.element && assigned.length >= 2 && assigned.every((element) => element === card.element);
}

export function canTcgCardSwitch(card: TcgCard | null | undefined, board: TcgPlayerState) {
  return !!card && (card.assignedElements?.length || 0) >= 1 && !board.switchedCardThisTurn && board.board.support.some((support) => !!support);
}

export function getAssignedEnergyText(card: TcgCard | null | undefined) {
  const assigned = card?.assignedElements || [];
  if (!card) return "No attacker";
  if (assigned.length === 0) return "No energy";
  return `${assigned.length} energy`;
}

export function getActivePlayerLabel(gameState: TcgGameState) {
  if (gameState.solo) {
    if (gameState.mode === "ai" && gameState.currentPlayer === "p2") return "AI turn";
    return gameState.currentPlayer === "p2" ? "P2 turn" : "P1 turn";
  }
  return gameState.myTurn ? "Your turn" : "Opponent turn";
}

// ── localStorage helpers ──

export function loadSavedDeck(): string[] {
  try {
    const raw = localStorage.getItem("tcg_deck");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveDeck(ids: string[]) {
  localStorage.setItem("tcg_deck", JSON.stringify(ids));
}

export function loadElementPool(): string[] {
  try {
    const raw = localStorage.getItem("tcg_element_pool");
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) && arr.length > 0 ? arr : ["Fire", "Water", "Earth", "Wind", "Light", "Dark"];
  } catch { return ["Fire", "Water", "Earth", "Wind", "Light", "Dark"]; }
}

export function saveElementPool(elements: string[]) {
  localStorage.setItem("tcg_element_pool", JSON.stringify(elements));
}

export function clearActiveTcgGame() {
  localStorage.removeItem("tcg_active_game");
}

export function loadTcgStagingAcknowledgement() {
  try {
    return localStorage.getItem("tcg_staging_acknowledged") === "1";
  } catch {
    return false;
  }
}

export function saveTcgStagingAcknowledgement() {
  try {
    localStorage.setItem("tcg_staging_acknowledged", "1");
  } catch {
    // Ignore storage failures; the modal can safely return next visit.
  }
}
