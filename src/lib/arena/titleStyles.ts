/**
 * Cosmetic treatment for each purchasable arena title.
 *
 * The backend catalog (`arena-constants.js` -> TITLE_CATALOG) only ships
 * `{ id, name, price }`; everything visual lives here so a palette tweak is a
 * frontend change instead of a backend deploy. Ids that are missing from this
 * map (a title added server-side before the styling lands) fall back to the
 * plainest treatment rather than rendering unstyled.
 */
export type ArenaTitleEffect =
  | "plain"
  | "sheen"
  | "pulse"
  | "shimmer"
  | "ember"
  | "prism"
  | "flame";

export const FALLBACK_TITLE_EFFECT: ArenaTitleEffect = "plain";

const TITLE_EFFECTS: Record<string, ArenaTitleEffect> = {
  brawler: "plain",
  duelist: "sheen",
  gladiator: "pulse",
  champion: "shimmer",
  warlord: "ember",
  mythbreaker: "prism",
  immortal: "flame",
};

export function getArenaTitleEffect(titleId: string | null | undefined): ArenaTitleEffect {
  if (!titleId) return FALLBACK_TITLE_EFFECT;
  return TITLE_EFFECTS[titleId] ?? FALLBACK_TITLE_EFFECT;
}
