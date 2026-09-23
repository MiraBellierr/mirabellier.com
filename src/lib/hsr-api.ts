// Client for the Honkai: Star Rail data mirrored from prydwen.gg by the
// backend (`GET /hsr/...`, sourced from `mirabellier-backend/lib/hsr-sync.js`).
//
// Two documents matter: the roster (names/elements/icons, used for the "what
// do you own" picker) and the team index (every distinct team per endgame
// mode, ranked by prydwen). The planner page joins the two.
import { API_BASE, joinApi } from "@/lib/config";
import { swrJson } from "@/lib/api-cache";
import { readNullableNumber } from "@/lib/nullable-number";

export type HsrImageRef = {
  remote: string | null;
  local: string | null;
};

export type HsrCharacter = {
  slug: string;
  name: string;
  rarity: number | null;
  element: string | null;
  path: string | null;
  role: string | null;
  isReleased: boolean;
  isNew: boolean;
  upcoming: boolean;
  releasePatch: string | null;
  images: {
    icon: HsrImageRef;
    elementIcon: HsrImageRef;
    pathIcon: HsrImageRef;
  };
};

export type HsrRosterPayload = {
  schema: number;
  source: string;
  sourceLastUpdated: string | null;
  generatedAt: string;
  total: number;
  characters: HsrCharacter[];
};

export type HsrTeamModeKey = "moc" | "pf" | "as" | "aa";

export type HsrIndexedTeam = {
  /** Stable key: the four member slugs sorted and joined. */
  id: string;
  members: string[];
  rank: number | null;
  appRate: number | null;
  avgRound: number | null;
  avgRoundE1: number | null;
};

export type HsrTeamMode = {
  key: HsrTeamModeKey;
  label: string;
  scoreLabel: string;
  count: number;
  teams: HsrIndexedTeam[];
};

export type HsrPhase = { phase?: string } | null;

export type HsrTeamIndexPayload = {
  schema: number;
  source: string;
  generatedAt: string;
  total: number;
  phases: Record<HsrTeamModeKey, HsrPhase>;
  modes: Record<HsrTeamModeKey, HsrTeamMode>;
  stats: { considered: number; skippedThin: number; skippedLowRate: number };
};

export type HsrStatus = {
  schema: number;
  sourceLastUpdated: string | null;
  lastSyncAt: string | null;
  lastFullSyncAt: string | null;
  characters: number;
};

export class HsrApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "HsrApiError";
    this.status = status;
  }
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function readImageRef(value: unknown): HsrImageRef {
  const source = readRecord(value);
  return {
    remote: readNullableString(source.remote),
    local: readNullableString(source.local),
  };
}

function normalizeCharacter(value: unknown): HsrCharacter {
  const source = readRecord(value);
  const images = readRecord(source.images);

  return {
    slug: readString(source.slug),
    name: readString(source.name),
    rarity: readNullableNumber(source.rarity),
    element: readNullableString(source.element),
    path: readNullableString(source.path),
    role: readNullableString(source.role),
    isReleased: source.isReleased === true,
    isNew: source.isNew === true,
    upcoming: source.upcoming === true,
    releasePatch: readNullableString(source.releasePatch),
    images: {
      icon: readImageRef(images.icon),
      elementIcon: readImageRef(images.elementIcon),
      pathIcon: readImageRef(images.pathIcon),
    },
  };
}

function normalizeRoster(json: unknown): HsrRosterPayload {
  const source = readRecord(json);
  return {
    schema: readNullableNumber(source.schema) ?? 1,
    source: readString(source.source),
    sourceLastUpdated: readNullableString(source.sourceLastUpdated),
    generatedAt: readString(source.generatedAt, new Date().toISOString()),
    total: readNullableNumber(source.total) ?? 0,
    characters: Array.isArray(source.characters)
      ? source.characters.map(normalizeCharacter)
      : [],
  };
}

function normalizeTeam(value: unknown): HsrIndexedTeam | null {
  const source = readRecord(value);
  const members = Array.isArray(source.members)
    ? source.members.filter((member): member is string => typeof member === "string")
    : [];
  if (members.length === 0) return null;

  return {
    id: readString(source.id, [...members].sort().join("|")),
    members,
    rank: readNullableNumber(source.rank),
    appRate: readNullableNumber(source.appRate),
    avgRound: readNullableNumber(source.avgRound),
    avgRoundE1: readNullableNumber(source.avgRoundE1),
  };
}

const TEAM_MODE_KEYS: HsrTeamModeKey[] = ["moc", "pf", "as", "aa"];

function normalizeTeamIndex(json: unknown): HsrTeamIndexPayload {
  const source = readRecord(json);
  const modesRaw = readRecord(source.modes);
  const phasesRaw = readRecord(source.phases);

  const modes = {} as Record<HsrTeamModeKey, HsrTeamMode>;
  const phases = {} as Record<HsrTeamModeKey, HsrPhase>;

  for (const key of TEAM_MODE_KEYS) {
    const modeRaw = readRecord(modesRaw[key]);
    const teams = Array.isArray(modeRaw.teams)
      ? modeRaw.teams
          .map(normalizeTeam)
          .filter((team): team is HsrIndexedTeam => team !== null)
      : [];

    modes[key] = {
      key,
      label: readString(modeRaw.label, key),
      scoreLabel: readString(modeRaw.scoreLabel, "Avg. score"),
      count: readNullableNumber(modeRaw.count) ?? teams.length,
      teams,
    };

    const phase = phasesRaw[key];
    phases[key] = phase ? (readRecord(phase) as HsrPhase) : null;
  }

  const statsRaw = readRecord(source.stats);

  return {
    schema: readNullableNumber(source.schema) ?? 1,
    source: readString(source.source),
    generatedAt: readString(source.generatedAt, new Date().toISOString()),
    total: readNullableNumber(source.total) ?? 0,
    phases,
    modes,
    stats: {
      considered: readNullableNumber(statsRaw.considered) ?? 0,
      skippedThin: readNullableNumber(statsRaw.skippedThin) ?? 0,
      skippedLowRate: readNullableNumber(statsRaw.skippedLowRate) ?? 0,
    },
  };
}

function errorFromStatus(status: number, what: string) {
  return new HsrApiError(
    status === 503
      ? `${what} is still syncing from prydwen.gg — check back in a moment.`
      : `Failed to load ${what.toLowerCase()} (HTTP ${status})`,
    status,
  );
}

export function fetchHsrRoster(signal?: AbortSignal) {
  return swrJson<HsrRosterPayload>(joinApi("/hsr/characters"), normalizeRoster, {
    signal,
    errorFrom: (response) =>
      errorFromStatus(response.status, "Star Rail roster"),
  });
}

export function fetchHsrTeamIndex(signal?: AbortSignal) {
  return swrJson<HsrTeamIndexPayload>(joinApi("/hsr/teams"), normalizeTeamIndex, {
    signal,
    errorFrom: (response) =>
      errorFromStatus(response.status, "Star Rail team index"),
  });
}

export function fetchHsrStatus(signal?: AbortSignal) {
  return swrJson<HsrStatus>(
    joinApi("/hsr/status"),
    (json) => {
      const source = readRecord(json);
      return {
        schema: readNullableNumber(source.schema) ?? 1,
        sourceLastUpdated: readNullableString(source.sourceLastUpdated),
        lastSyncAt: readNullableString(source.lastSyncAt),
        lastFullSyncAt: readNullableString(source.lastFullSyncAt),
        characters: readNullableNumber(source.characters) ?? 0,
      };
    },
    { signal },
  );
}

/** Absolute URL for a mirrored image path returned by the API. */
export function hsrImageUrl(
  ref: { local?: string | null; remote?: string | null } | null | undefined,
): string | null {
  if (!ref) return null;
  const local = ref.local;
  if (local) return local.startsWith("http") ? local : `${API_BASE}${local}`;
  const remote = ref.remote;
  if (remote) return remote;
  return null;
}

export const HSR_ELEMENTS = [
  "Physical",
  "Fire",
  "Ice",
  "Lightning",
  "Wind",
  "Quantum",
  "Imaginary",
] as const;

export const HSR_PATHS = [
  "Abundance",
  "Destruction",
  "Elation",
  "Erudition",
  "Harmony",
  "Hunt",
  "Nihility",
  "Preservation",
  "Remembrance",
] as const;

export const HSR_TEAM_MODES: Array<{ key: HsrTeamModeKey; label: string }> = [
  { key: "moc", label: "Memory of Chaos" },
  { key: "pf", label: "Pure Fiction" },
  { key: "as", label: "Apocalyptic Shadow" },
  { key: "aa", label: "Anomaly Arbitration" },
];
