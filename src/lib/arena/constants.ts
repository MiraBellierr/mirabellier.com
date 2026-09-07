// Shared Arena UI constants — one frontend copy of values that were previously
// re-declared in every Arena page. The backend's
// `mirabellier-backend/lib/arena-constants.js` remains the gameplay source of
// truth; this mirrors the presentation-facing subset the React pages need.

// The card "affinity" trait is six combat styles, not elements. `ELEMENTS` /
// `ArenaElement` keep their names for now to avoid a churny rename across every
// call site; the values are the styles.
export const ELEMENTS = ["Might", "Swift", "Skill", "Ruse", "Surge", "Ward"] as const;
export type ArenaElement = (typeof ELEMENTS)[number];

export const RARITIES = ["C", "R", "SR", "SSR", "UR"] as const;
/** Alias — some call sites read this as an ordered list rather than a set. */
export const RARITY_ORDER = RARITIES;
export type ArenaRarity = (typeof RARITIES)[number];

export const ELEMENT_COLORS: Record<string, string> = {
  Might: "#e74c3c",
  Swift: "#1abc9c",
  Skill: "#3498db",
  Ruse: "#8e44ad",
  Surge: "#f1c40f",
  Ward: "#27ae60",
};

/**
 * The two styles each style is strong against (1.3x). Mirrors the
 * `ELEMENT_EFFECTIVENESS` chart in the backend `arena-constants.js` — a change
 * there must be reflected here.
 */
export const ELEMENT_STRONG_AGAINST: Record<ArenaElement, ArenaElement[]> = {
  Might: ["Skill", "Surge"],
  Swift: ["Might", "Ruse"],
  Skill: ["Swift", "Ward"],
  Ruse: ["Might", "Surge"],
  Surge: ["Skill", "Ward"],
  Ward: ["Swift", "Ruse"],
};

/** Row-per-style view used by the Arena fight matchup chart. */
export const WEAKNESS_ROWS = ELEMENTS.map((element) => ({
  element,
  color: ELEMENT_COLORS[element],
  beats: ELEMENT_STRONG_AGAINST[element].map((target) => ({
    element: target,
    color: ELEMENT_COLORS[target],
  })),
}));
