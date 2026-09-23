/**
 * Team-planner logic for the Star Rail page.
 *
 * The flow is a chain: pick the characters you own, take the highest-ranked
 * team, lock it, and the next team is drawn from what's left. A lock consumes
 * its four members globally — regardless of which endgame mode the team was
 * locked in — so later suggestions never reuse them.
 *
 * Kept pure and free of React / `import.meta.env` so it can be unit tested
 * under `node --test` (see hsr-planner.test.ts).
 */
import type { HsrIndexedTeam } from "./hsr-api";

export type LockedTeam = {
  /** Team id = member slugs sorted and joined (matches the backend's key). */
  id: string;
  /** Mode the lock was made from, used to label the locked card. */
  mode: string;
};

export type PlannerState = {
  /** Characters consumed by locked teams. */
  used: Set<string>;
  /** Owned characters that are still free to be assigned. */
  available: Set<string>;
  /** Teams fieldable from `available`, in prydwen's rank order. */
  candidates: HsrIndexedTeam[];
  /** Locked teams that are no longer fieldable from what is owned. */
  stranded: LockedTeam[];
  /** Resolved locked teams, in lock order. */
  locked: HsrIndexedTeam[];
};

export type TeamsByMode = Record<string, HsrIndexedTeam[]>;

/** Every member slug a team occupies. */
export function teamMembers(team: HsrIndexedTeam | null | undefined): string[] {
  if (!team || !Array.isArray(team.members)) return [];
  return team.members;
}

/**
 * Build an id -> team lookup across every mode.
 *
 * A lineup can appear in more than one mode with different stats; the first
 * mode in iteration order wins, which is only ever used to resolve which
 * characters a lock occupies (identical either way).
 */
export function indexTeamsById(teamsByMode: TeamsByMode): Map<string, HsrIndexedTeam> {
  const byId = new Map<string, HsrIndexedTeam>();

  for (const teams of Object.values(teamsByMode ?? {})) {
    if (!Array.isArray(teams)) continue;
    for (const team of teams) {
      if (!team || !team.id || byId.has(team.id)) continue;
      if (teamMembers(team).length === 0) continue;
      byId.set(team.id, team);
    }
  }

  return byId;
}

/**
 * Union of every member across the locked teams.
 *
 * Unresolvable ids (a team that left the index after a prydwen update) simply
 * contribute nothing instead of throwing.
 */
export function usedCharacters(
  locked: LockedTeam[],
  byId: Map<string, HsrIndexedTeam>,
): Set<string> {
  const used = new Set<string>();

  for (const entry of Array.isArray(locked) ? locked : []) {
    const team = byId.get(entry.id);
    if (!team) continue;
    for (const member of teamMembers(team)) used.add(member);
  }

  return used;
}

/** Resolve locked entries back to teams, preserving lock order. */
export function resolveLocked(
  locked: LockedTeam[],
  byId: Map<string, HsrIndexedTeam>,
): HsrIndexedTeam[] {
  const resolved: HsrIndexedTeam[] = [];

  for (const entry of Array.isArray(locked) ? locked : []) {
    const team = byId.get(entry.id);
    if (team) resolved.push(team);
  }

  return resolved;
}

/**
 * Compute what the planner should show.
 *
 * A team is a candidate only when *all* of its members are owned and none are
 * consumed by a lock. Ordering is preserved from the incoming list, which the
 * backend already sorts by prydwen's rank.
 */
export function buildPlannerState(options: {
  owned: Iterable<string>;
  locked: LockedTeam[];
  teamsByMode: TeamsByMode;
  mode: string;
}): PlannerState {
  const owned = new Set(options.owned);
  const locked = Array.isArray(options.locked) ? options.locked : [];
  const byId = indexTeamsById(options.teamsByMode ?? {});

  const used = usedCharacters(locked, byId);
  const available = new Set<string>();
  for (const slug of owned) {
    if (!used.has(slug)) available.add(slug);
  }

  const modeTeams = options.teamsByMode?.[options.mode];
  const candidates: HsrIndexedTeam[] = [];
  for (const team of Array.isArray(modeTeams) ? modeTeams : []) {
    const members = teamMembers(team);
    if (members.length === 0) continue;
    if (members.every((member) => available.has(member))) {
      candidates.push(team);
    }
  }

  // A locked team whose members are no longer all owned (the user unchecked
  // someone) still occupies its slots, so surface it rather than silently
  // dropping the lock.
  const resolved = resolveLocked(locked, byId);
  const stranded = locked.filter((entry) => {
    const team = byId.get(entry.id);
    if (!team) return false;
    return !teamMembers(team).every((member) => owned.has(member));
  });

  return { used, available, candidates, stranded, locked: resolved };
}

/** How many of an owned set are actually reachable in at least one team. */
export function teammatesInIndex(
  owned: Iterable<string>,
  teams: HsrIndexedTeam[],
): Set<string> {
  const ownedSet = new Set(owned);
  const seen = new Set<string>();

  for (const team of Array.isArray(teams) ? teams : []) {
    for (const member of teamMembers(team)) {
      if (ownedSet.has(member)) seen.add(member);
    }
  }

  return seen;
}

/**
 * Suggest the next team to lock.
 *
 * prydwen's rank already orders the list, so the first candidate is the best
 * available team — but only among teams the user can actually field.
 */
export function nextTeam(state: PlannerState): HsrIndexedTeam | null {
  return state.candidates.length > 0 ? state.candidates[0] : null;
}

/** Stable id for a member set, matching the backend's team keys. */
export function teamIdFromMembers(members: Iterable<string>): string {
  return [...members].sort().join("|");
}

/** Serialized planner state for localStorage. */
export type StoredPlannerState = {
  owned: string[];
  locked: LockedTeam[];
  mode: string;
};

export function parseStoredPlannerState(
  raw: unknown,
  fallbackMode: string,
): StoredPlannerState {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const readStringArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string")
      : [];

  // Older revisions stored a bare id list; accept both so an upgrade does not
  // silently drop someone's saved plan.
  const locked: LockedTeam[] = [];
  if (Array.isArray(source.locked)) {
    for (const entry of source.locked) {
      if (typeof entry === "string" && entry) {
        locked.push({ id: entry, mode: fallbackMode });
        continue;
      }
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : "";
        if (!id) continue;
        locked.push({
          id,
          mode: typeof record.mode === "string" && record.mode ? record.mode : fallbackMode,
        });
      }
    }
  }

  const seen = new Set<string>();
  const dedupedLocked = locked.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });

  return {
    owned: [...new Set(readStringArray(source.owned))],
    locked: dedupedLocked,
    mode: typeof source.mode === "string" && source.mode ? source.mode : fallbackMode,
  };
}
