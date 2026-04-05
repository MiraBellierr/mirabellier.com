import { joinApi } from "@/lib/config";

export type MyAnimeListSeason = {
  season: string;
  year: number;
};

export type CurrentlyWatchingAnimeItem = {
  malId: number;
  title: string;
  url: string;
  coverImage: string | null;
  mediaType: string | null;
  watchedEpisodes: number;
  totalEpisodes: number | null;
  score: number | null;
  updatedAt: string | null;
  startSeason: MyAnimeListSeason | null;
};

export type CurrentlyWatchingAnimePayload = {
  source: "myanimelist";
  username: string;
  fetchedAt: string;
  stale: boolean;
  items: CurrentlyWatchingAnimeItem[];
};

export class AnimeFeedApiError extends Error {
  code: string | null;
  status: number;

  constructor(message: string, input?: { code?: string | null; status?: number }) {
    super(message);
    this.name = "AnimeFeedApiError";
    this.code = input?.code ?? null;
    this.status = Number.isFinite(input?.status) ? Number(input?.status) : 500;
  }
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readNullableNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSeason(value: unknown): MyAnimeListSeason | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const season = readString(source.season);
  const year = readNullableNumber(source.year);

  if (!season || year === null) {
    return null;
  }

  return {
    season,
    year: Math.trunc(year),
  };
}

function normalizeItem(value: unknown): CurrentlyWatchingAnimeItem {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    malId: Math.max(Math.trunc(readNullableNumber(source.malId) ?? 0), 0),
    title: readString(source.title),
    url: readString(source.url),
    coverImage: readNullableString(source.coverImage),
    mediaType: readNullableString(source.mediaType),
    watchedEpisodes: Math.max(
      Math.trunc(readNullableNumber(source.watchedEpisodes) ?? 0),
      0,
    ),
    totalEpisodes: (() => {
      const total = readNullableNumber(source.totalEpisodes);
      return total && total > 0 ? Math.trunc(total) : null;
    })(),
    score: (() => {
      const score = readNullableNumber(source.score);
      return score && score > 0 ? Math.trunc(score) : null;
    })(),
    updatedAt: readNullableString(source.updatedAt),
    startSeason: normalizeSeason(source.startSeason),
  };
}

async function readApiError(response: Response) {
  try {
    const data = (await response.json()) as Record<string, unknown>;
    return {
      code: typeof data.code === "string" ? data.code : null,
      message:
        typeof data.error === "string" && data.error
          ? data.error
          : "Failed to load currently watching anime",
    };
  } catch {
    return {
      code: null,
      message: "Failed to load currently watching anime",
    };
  }
}

export async function fetchCurrentlyWatchingAnime() {
  const response = await fetch(joinApi("/anime/currently-watching"), {
    cache: "no-store",
  });

  if (!response.ok) {
    const error = await readApiError(response);
    throw new AnimeFeedApiError(error.message, {
      code: error.code,
      status: response.status,
    });
  }

  const data = (await response.json()) as Record<string, unknown>;

  return {
    source: "myanimelist" as const,
    username: readString(data.username),
    fetchedAt: readString(data.fetchedAt, new Date().toISOString()),
    stale: Boolean(data.stale),
    items: Array.isArray(data.items) ? data.items.map(normalizeItem) : [],
  } as CurrentlyWatchingAnimePayload;
}
