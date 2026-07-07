import fireIcon from "@/assets/elements/fire.png";
import waterIcon from "@/assets/elements/water.png";
import earthIcon from "@/assets/elements/earth.png";
import windIcon from "@/assets/elements/wind.png";
import lightIcon from "@/assets/elements/light.png";
import darkIcon from "@/assets/elements/dark.png";

export const DECK_SIZE = 10;
export const ELEMENTS = ["Fire", "Water", "Earth", "Wind", "Light", "Dark"] as const;
export const RARITY_ORDER = ["C", "R", "SR", "SSR", "UR"] as const;

export const ELEMENT_COLORS: Record<string, string> = {
  Fire: "#e74c3c",
  Water: "#3498db",
  Earth: "#27ae60",
  Wind: "#2ecc71",
  Light: "#f1c40f",
  Dark: "#8e44ad",
};

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
