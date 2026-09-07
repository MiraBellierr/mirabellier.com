// Styles, rarities and their colours are shared with the Arena pages.
export { ELEMENTS, RARITY_ORDER, ELEMENT_COLORS } from "@/lib/arena/constants";

export const DECK_SIZE = 10;

export type CollectionSort =
  | "recent"
  | "rarity-desc"
  | "rarity-asc"
  | "iv-desc"
  | "iv-asc"
  | "power-desc"
  | "guard-desc"
  | "speed-desc"
  | "effectHit-desc";

export type MobileTcgDrag =
  | { kind: "card"; cardId: string }
  | { kind: "draw" }
  | { kind: "attack" }
  | { kind: "promote"; slot: string }
  | { kind: "element"; element: string };

export type MobileTcgGhost = {
  drag: MobileTcgDrag;
  clientX: number;
  clientY: number;
};

export type TcgAction = { type: string; cardId?: string; slot?: string };
