// Shared Arena UI constants — one frontend copy of values that were previously
// re-declared in every Arena page. The backend's
// `mirabellier-backend/lib/arena-constants.js` remains the gameplay source of
// truth; this mirrors the presentation-facing subset the React pages need.

export const ELEMENTS = ["Fire", "Water", "Earth", "Wind", "Light", "Dark"] as const;
export type ArenaElement = (typeof ELEMENTS)[number];

export const RARITIES = ["C", "R", "SR", "SSR", "UR"] as const;
/** Alias — some call sites read this as an ordered list rather than a set. */
export const RARITY_ORDER = RARITIES;
export type ArenaRarity = (typeof RARITIES)[number];

export const ELEMENT_COLORS: Record<string, string> = {
  Fire: "#e74c3c",
  Water: "#3498db",
  Earth: "#27ae60",
  Wind: "#2ecc71",
  Light: "#f1c40f",
  Dark: "#8e44ad",
};

/**
 * Which element each element is strong against. Mirrors the
 * `ELEMENT_EFFECTIVENESS` matrix in the backend `arena-constants.js` — a change
 * there must be reflected here.
 */
export const ELEMENT_BEATS: Record<ArenaElement, ArenaElement> = {
  Fire: "Earth",
  Water: "Fire",
  Earth: "Water",
  Wind: "Light",
  Light: "Dark",
  Dark: "Wind",
};

/** Row-per-element view used by the Arena fight weakness chart. */
export const WEAKNESS_ROWS = ELEMENTS.map((element) => ({
  element,
  beats: ELEMENT_BEATS[element],
  color: ELEMENT_COLORS[element],
  beatsColor: ELEMENT_COLORS[ELEMENT_BEATS[element]],
}));
