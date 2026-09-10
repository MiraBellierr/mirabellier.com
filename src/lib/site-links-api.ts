import { API_BASE, joinApi } from "@/lib/config";
import { shouldSendBearerToken } from "@/lib/auth-session";
import { swrJson } from "@/lib/api-cache";

export type SiteLinkEntry = {
  name: string;
  url: string;
  blurb: string;
  feed: string;
};

export type SiteLinkSection = {
  id: string;
  title: string;
  note: string;
  entries: SiteLinkEntry[];
};

export type SiteWebring = {
  enabled: boolean;
  name: string;
  hubUrl: string;
  prevUrl: string;
  nextUrl: string;
  randomUrl: string;
};

export type SiteLinksContent = {
  sections: SiteLinkSection[];
  webring: SiteWebring;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SiteLinksDraft = {
  sections: Array<{
    title: string;
    note: string;
    entries: Array<{ name: string; url: string; blurb: string; feed: string }>;
  }>;
  webring: {
    enabled: boolean;
    name: string;
    hubUrl: string;
    prevUrl: string;
    nextUrl: string;
    randomUrl: string;
  };
};

export const EMPTY_WEBRING: SiteWebring = {
  enabled: false,
  name: "",
  hubUrl: "",
  prevUrl: "",
  nextUrl: "",
  randomUrl: "",
};

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeEntry(value: unknown): SiteLinkEntry {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    name: readString(source.name),
    url: readString(source.url),
    blurb: readString(source.blurb),
    feed: readString(source.feed),
  };
}

function normalizeSection(value: unknown, index: number): SiteLinkSection {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    id: readString(source.id) || `section-${index + 1}`,
    title: readString(source.title),
    note: readString(source.note),
    entries: Array.isArray(source.entries)
      ? source.entries.map(normalizeEntry)
      : [],
  };
}

function normalizeWebring(value: unknown): SiteWebring {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    enabled: source.enabled === true,
    name: readString(source.name),
    hubUrl: readString(source.hubUrl),
    prevUrl: readString(source.prevUrl),
    nextUrl: readString(source.nextUrl),
    randomUrl: readString(source.randomUrl),
  };
}

export function normalizeSiteLinks(value: unknown): SiteLinksContent | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;

  return {
    sections: Array.isArray(source.sections)
      ? source.sections.map((section, i) => normalizeSection(section, i))
      : [],
    webring: normalizeWebring(source.webring),
    createdAt: typeof source.createdAt === "string" ? source.createdAt : null,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
  };
}

function readLinksFromEnvelope(json: unknown): SiteLinksContent | null {
  const envelope =
    json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  return normalizeSiteLinks(envelope.links);
}

export function fetchSiteLinks(signal?: AbortSignal) {
  return swrJson<SiteLinksContent | null>(
    joinApi("/links"),
    readLinksFromEnvelope,
    {
      init: { credentials: "include" },
      signal,
      errorFrom: () => new Error("Failed to load the links page"),
    },
  );
}

async function readErrorText(response: Response) {
  try {
    const data = await response.json();
    return typeof data?.error === "string" ? data.error : "";
  } catch {
    return "";
  }
}

export async function updateSiteLinks(
  draft: SiteLinksDraft,
  token: string | null | undefined,
): Promise<SiteLinksContent | null> {
  const response = await fetch(`${API_BASE}/links`, {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(shouldSendBearerToken(token)
        ? { Authorization: `Bearer ${token}` }
        : {}),
    },
    body: JSON.stringify(draft),
  });

  if (!response.ok) {
    throw new Error(
      (await readErrorText(response)) || "Failed to save the links page",
    );
  }

  return readLinksFromEnvelope(await response.json());
}
