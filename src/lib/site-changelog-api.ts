import { API_BASE, joinApi } from "@/lib/config";
import { shouldSendBearerToken } from "@/lib/auth-session";
import { swrJson } from "@/lib/api-cache";

export type ChangelogEntry = {
  id: string;
  entryDate: string;
  title: string;
  body: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ChangelogDraft = {
  entryDate: string;
  title: string;
  body: string;
};

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeEntry(value: unknown): ChangelogEntry {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    id: readString(source.id),
    entryDate: readString(source.entryDate),
    title: readString(source.title),
    body: readString(source.body),
    createdAt: typeof source.createdAt === "string" ? source.createdAt : null,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
  };
}

function readEntriesEnvelope(json: unknown): ChangelogEntry[] {
  const envelope =
    json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  return Array.isArray(envelope.entries)
    ? envelope.entries.map(normalizeEntry)
    : [];
}

function readEntryEnvelope(json: unknown): ChangelogEntry {
  const envelope =
    json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  return normalizeEntry(envelope.entry);
}

export function fetchChangelog(signal?: AbortSignal) {
  return swrJson<ChangelogEntry[]>(joinApi("/changelog"), readEntriesEnvelope, {
    init: { credentials: "include" },
    signal,
    errorFrom: () => new Error("Failed to load the changelog"),
  });
}

async function readErrorText(response: Response) {
  try {
    const data = await response.json();
    return typeof data?.error === "string" ? data.error : "";
  } catch {
    return "";
  }
}

function authHeaders(token: string | null | undefined) {
  return {
    "Content-Type": "application/json",
    ...(shouldSendBearerToken(token) ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function createChangelogEntry(
  draft: ChangelogDraft,
  token: string | null | undefined,
): Promise<ChangelogEntry> {
  const response = await fetch(`${API_BASE}/changelog`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders(token),
    body: JSON.stringify(draft),
  });
  if (!response.ok) {
    throw new Error((await readErrorText(response)) || "Failed to add entry");
  }
  return readEntryEnvelope(await response.json());
}

export async function updateChangelogEntry(
  id: string,
  draft: ChangelogDraft,
  token: string | null | undefined,
): Promise<ChangelogEntry> {
  const response = await fetch(
    `${API_BASE}/changelog/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      credentials: "include",
      headers: authHeaders(token),
      body: JSON.stringify(draft),
    },
  );
  if (!response.ok) {
    throw new Error((await readErrorText(response)) || "Failed to update entry");
  }
  return readEntryEnvelope(await response.json());
}

export async function deleteChangelogEntry(
  id: string,
  token: string | null | undefined,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/changelog/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      credentials: "include",
      headers: authHeaders(token),
    },
  );
  if (!response.ok) {
    throw new Error((await readErrorText(response)) || "Failed to delete entry");
  }
}
