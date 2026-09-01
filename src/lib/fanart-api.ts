import { joinApi } from "@/lib/config";

export type FanArtSite = "safebooru" | "gelbooru" | "danbooru" | "pixiv";

export type FanArtItem = {
  id: string;
  site: FanArtSite;
  title: string;
  artist: string;
  artistUrl: string | null;
  thumbnailUrl: string;
  sampleUrl: string | null;
  imageUrl: string;
  postUrl: string;
  width: number | null;
  height: number | null;
  rating: string;
  score: number | null;
  tags: string[];
};

export type FanArtSiteResult = {
  site: FanArtSite;
  available: boolean;
  items: FanArtItem[];
  error: string | null;
};

export type FanArtSearchPayload = {
  query: string;
  rating: "safe" | "all";
  page: number;
  limit: number;
  fetchedAt: string;
  sites: FanArtSiteResult[];
  allFailed: boolean;
};

export class FanArtApiError extends Error {
  code: string | null;
  status: number;

  constructor(message: string, input?: { code?: string | null; status?: number }) {
    super(message);
    this.name = "FanArtApiError";
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

const KNOWN_SITES: FanArtSite[] = ["safebooru", "gelbooru", "danbooru", "pixiv"];

function proxyImageUrl(value: string) {
  if (!value) {
    return value;
  }

  return joinApi(`/fanart/image?url=${encodeURIComponent(value)}`);
}

function normalizeItem(value: unknown): FanArtItem {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  const rawSite = readString(source.site).toLowerCase();
  const site = (KNOWN_SITES as string[]).includes(rawSite)
    ? (rawSite as FanArtSite)
    : "safebooru";
  const isProxied =
    site === "pixiv" || site === "danbooru" || site === "gelbooru";
  const thumbnailUrl = readString(source.thumbnailUrl);
  const sampleUrl = readNullableString(source.sampleUrl);
  const imageUrl = readString(source.imageUrl);

  return {
    id: readString(source.id),
    site,
    title: readString(source.title),
    artist: readString(source.artist, "unknown"),
    artistUrl: readNullableString(source.artistUrl),
    thumbnailUrl: isProxied ? proxyImageUrl(thumbnailUrl) : thumbnailUrl,
    sampleUrl: isProxied ? proxyImageUrl(sampleUrl ?? "") : sampleUrl,
    imageUrl: isProxied ? proxyImageUrl(imageUrl) : imageUrl,
    postUrl: readString(source.postUrl),
    width: readNullableNumber(source.width),
    height: readNullableNumber(source.height),
    rating: readString(source.rating, "unknown"),
    score: readNullableNumber(source.score),
    tags: Array.isArray(source.tags)
      ? source.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
  };
}

function normalizeSiteResult(value: unknown): FanArtSiteResult {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawSite = readString(source.site).toLowerCase();

  return {
    site: (KNOWN_SITES as string[]).includes(rawSite)
      ? (rawSite as FanArtSite)
      : "safebooru",
    available: source.available !== false,
    items: Array.isArray(source.items) ? source.items.map(normalizeItem) : [],
    error: readNullableString(source.error),
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
          : "Failed to search fan art",
    };
  } catch {
    return {
      code: null,
      message: "Failed to search fan art",
    };
  }
}

export async function searchFanArt(input: {
  query: string;
  page?: number;
  limit?: number;
  sites?: FanArtSite[];
  rating?: "safe" | "all";
}) {
  const params = new URLSearchParams({
    query: input.query,
    page: String(input.page ?? 1),
    limit: String(input.limit ?? 24),
    rating: input.rating ?? "safe",
  });

  if (input.sites && input.sites.length > 0) {
    params.set("sites", input.sites.join(","));
  }

  const response = await fetch(joinApi(`/fanart/search?${params.toString()}`), {
    cache: "no-store",
  });

  if (!response.ok) {
    const error = await readApiError(response);
    throw new FanArtApiError(error.message, {
      code: error.code,
      status: response.status,
    });
  }

  const data = (await response.json()) as Record<string, unknown>;

  return {
    query: readString(data.query),
    rating: readString(data.rating, "safe") === "all" ? "all" : "safe",
    page: Math.max(Math.trunc(readNullableNumber(data.page) ?? 1), 1),
    limit: Math.max(Math.trunc(readNullableNumber(data.limit) ?? 24), 1),
    fetchedAt: readString(data.fetchedAt, new Date().toISOString()),
    sites: Array.isArray(data.sites)
      ? data.sites.map(normalizeSiteResult)
      : [],
    allFailed: Boolean(data.allFailed),
  } as FanArtSearchPayload;
}
