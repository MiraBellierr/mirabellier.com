import { API_BASE } from "@/lib/config";

export type GuestbookMood =
  | "sparkly"
  | "cozy"
  | "sleepy"
  | "sunny"
  | "chaotic";

export type GuestbookEntry = {
  id: string;
  author: string;
  message: string;
  website?: string | null;
  mood: GuestbookMood;
  x: number;
  y: number;
  createdAt: string;
  user?: {
    id?: string;
    username?: string;
    avatar?: string | null;
  } | null;
};

function normalizeWebsite(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const candidate = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;

  try {
    const url = /^[a-z][a-z0-9+.-]*:/i.test(candidate)
      ? new URL(candidate)
      : new URL(`https://${candidate}`);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function normalizeMood(value: unknown): GuestbookMood {
  switch (String(value || "").toLowerCase()) {
    case "cozy":
      return "cozy";
    case "sleepy":
      return "sleepy";
    case "sunny":
      return "sunny";
    case "chaotic":
      return "chaotic";
    default:
      return "sparkly";
  }
}

function normalizeEntry(value: unknown): GuestbookEntry {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const userSource =
    source.user && typeof source.user === "object"
      ? (source.user as Record<string, unknown>)
      : null;

  return {
    id: source.id ? String(source.id) : "",
    author: typeof source.author === "string" ? source.author : "Anonymous",
    message: typeof source.message === "string" ? source.message : "",
    website: normalizeWebsite(source.website),
    mood: normalizeMood(source.mood),
    x: Number.isFinite(Number(source.x)) ? Number(source.x) : 0,
    y: Number.isFinite(Number(source.y)) ? Number(source.y) : 0,
    createdAt:
      typeof source.createdAt === "string"
        ? source.createdAt
        : new Date().toISOString(),
    user: userSource
      ? {
          id: userSource.id ? String(userSource.id) : undefined,
          username:
            typeof userSource.username === "string"
              ? String(userSource.username)
              : undefined,
          avatar:
            typeof userSource.avatar === "string"
              ? String(userSource.avatar)
              : null,
        }
      : null,
  };
}

async function readErrorText(response: Response) {
  try {
    const data = await response.json();
    return typeof data?.error === "string" ? data.error : "";
  } catch {
    return "";
  }
}

export async function fetchGuestbookEntries(): Promise<GuestbookEntry[]> {
  const response = await fetch(`${API_BASE}/guestbook`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch guestbook entries");
  }

  const data = (await response.json()) as unknown[];
  return Array.isArray(data) ? data.map(normalizeEntry) : [];
}

export async function createGuestbookEntry(input: {
  message: string;
  mood: GuestbookMood;
  name?: string;
  website?: string;
  token?: string | null;
  x?: number;
  y?: number;
}) {
  const response = await fetch(`${API_BASE}/guestbook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
    },
    body: JSON.stringify({
      name: input.name,
      website: normalizeWebsite(input.website),
      message: input.message,
      mood: input.mood,
      x: input.x,
      y: input.y,
    }),
  });

  if (!response.ok) {
    const message = await readErrorText(response);
    throw new Error(message || "Failed to sign the guestbook");
  }

  return normalizeEntry(await response.json());
}

export async function updateGuestbookEntryPosition(
  id: string,
  x: number,
  y: number,
) {
  const response = await fetch(`${API_BASE}/guestbook/${id}/position`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ x, y }),
  });

  if (!response.ok) {
    const message = await readErrorText(response);
    throw new Error(message || "Failed to move guestbook note");
  }

  return normalizeEntry(await response.json());
}

export async function deleteGuestbookEntry(id: string, token: string) {
  const response = await fetch(`${API_BASE}/guestbook/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const message = await readErrorText(response);
    throw new Error(message || "Failed to delete guestbook note");
  }
}
