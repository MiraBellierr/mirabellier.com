import type { ArenaSubStat } from "./shared";

// Fantasy display names for equipment slots and stats, shared by the Arena
// overview, inventory, and reward screens.
export const EQUIPMENT_SLOT_NAMES: Record<string, string> = {
  weapon: "Blade",
  armor: "Armour",
  charm: "Charm",
};

export const EQUIPMENT_MAIN_NAMES: Record<string, string> = {
  dmgPct: "Force",
  defendPct: "Aegis",
  critRate: "Keen",
  critDmg: "Ruin",
  // legacy pieces
  power: "Force",
  guard: "Aegis",
};

export const EQUIPMENT_SUB_NAMES: Record<string, string> = {
  hp: "Vitality",
  power: "Power",
  guard: "Guard",
  speed: "Speed",
  effectHit: "Focus",
  hpPct: "Fortitude",
  dmgPct: "Fury",
  defendPct: "Bulwark",
  crit: "Precision",
  critRate: "Precision",
  critDmg: "Ruin",
};

// Plain-language main-stat labels.
export const MAIN_STAT_LABELS: Record<string, string> = {
  dmgPct: "DMG%",
  defendPct: "DEF%",
  critRate: "Crit Rate",
  critDmg: "Crit DMG",
  // legacy pieces
  power: "Power",
  guard: "Guard",
};

const STAT_LABELS: Record<string, string> = {
  hp: "HP",
  power: "Power",
  guard: "Guard",
  speed: "Speed",
  effectHit: "Effect Hit",
  hpPct: "HP%",
  dmgPct: "DMG%",
  defendPct: "DEF%",
  crit: "Crit Rate",
  critRate: "Crit Rate",
  critDmg: "Crit DMG",
};

/** Humanize a stat key (e.g. "effectHit" -> "Effect Hit"). */
export function statLabel(type: string): string {
  return STAT_LABELS[type] || type || "Main Stat";
}

/** "HP +42 (+12)" — the trailing "(+n)" is the enhancement boost, shown only when > 0. */
export function formatSubStat(s: {
  type: string;
  value: number;
  bonus?: number;
}): string {
  const bonus = s.bonus || 0;
  return `${statLabel(s.type)} +${s.value + bonus}${bonus > 0 ? ` (+${bonus})` : ""}`;
}

type DisplayPiece = {
  slot: string;
  mainStatType: string;
  subStats: ArenaSubStat[];
};

/** Fantasy name for an equipment piece, e.g. "Force Blade of Ruin". */
export function equipmentDisplayName(piece: DisplayPiece): string {
  const prefix =
    EQUIPMENT_MAIN_NAMES[piece.mainStatType] ||
    MAIN_STAT_LABELS[piece.mainStatType] ||
    "Balanced";
  const base = EQUIPMENT_SLOT_NAMES[piece.slot] || "Gear";
  const bestSub = [...piece.subStats].sort(
    (a, b) => Math.abs(Number(b.value) || 0) - Math.abs(Number(a.value) || 0),
  )[0];
  const suffix =
    bestSub && bestSub.type !== piece.mainStatType
      ? ` of ${EQUIPMENT_SUB_NAMES[bestSub.type] || statLabel(bestSub.type)}`
      : "";
  return `${prefix} ${base}${suffix}`;
}

type IvCard = {
  iv: { power: number; guard: number; speed: number; effectHit: number };
  cardItemIds?: string[] | null;
} | null | undefined;

/** True when every IV of the selected card is maxed (31). */
export function isMaxIvCard(card: IvCard): boolean {
  return (
    !!card &&
    card.iv.power === 31 &&
    card.iv.guard === 31 &&
    card.iv.speed === 31 &&
    card.iv.effectHit === 31
  );
}

/** True when the card has already had the given card-item effect applied. */
export function hasCardItem(card: IvCard, itemId: string): boolean {
  return Array.isArray(card?.cardItemIds) && card.cardItemIds.includes(itemId);
}
