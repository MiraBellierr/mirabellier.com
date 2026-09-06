import fireIcon from "@/assets/elements/fire.png";
import waterIcon from "@/assets/elements/water.png";
import earthIcon from "@/assets/elements/earth.png";
import windIcon from "@/assets/elements/wind.png";
import lightIcon from "@/assets/elements/light.png";
import darkIcon from "@/assets/elements/dark.png";

// Elements, rarities and their colours are shared with the Arena pages.
export { ELEMENTS, RARITY_ORDER, ELEMENT_COLORS } from "@/lib/arena/constants";

export const DECK_SIZE = 10;

export const ELEMENT_ICONS: Record<string, string> = {
  Fire: fireIcon,
  Water: waterIcon,
  Earth: earthIcon,
  Wind: windIcon,
  Light: lightIcon,
  Dark: darkIcon,
};

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
