import { API_BASE, joinApi } from "@/lib/config";
import { shouldSendBearerToken } from "@/lib/auth-session";
import { swrJson } from "@/lib/api-cache";

export type NowSection = {
  label: string;
  body: string;
};

export type NowContent = {
  intro: string;
  sections: NowSection[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type NowDraft = {
  intro: string;
  sections: NowSection[];
};

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeSection(value: unknown): NowSection {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    label: readString(source.label),
    body: readString(source.body),
  };
}

export function normalizeNowContent(value: unknown): NowContent | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;

  return {
    intro: readString(source.intro),
    sections: Array.isArray(source.sections)
      ? source.sections.map(normalizeSection)
      : [],
    createdAt:
      typeof source.createdAt === "string" ? source.createdAt : null,
    updatedAt:
      typeof source.updatedAt === "string" ? source.updatedAt : null,
  };
}

function readNowFromEnvelope(json: unknown): NowContent | null {
  const envelope =
    json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  return normalizeNowContent(envelope.now);
}

export function fetchNow(signal?: AbortSignal) {
  return swrJson<NowContent | null>(joinApi("/now"), readNowFromEnvelope, {
    init: { credentials: "include" },
    signal,
    errorFrom: () => new Error("Failed to load the now page"),
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

export async function updateNow(
  draft: NowDraft,
  token: string | null | undefined,
): Promise<NowContent | null> {
  const response = await fetch(`${API_BASE}/now`, {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(shouldSendBearerToken(token)
        ? { Authorization: `Bearer ${token}` }
        : {}),
    },
    body: JSON.stringify({
      intro: draft.intro,
      sections: draft.sections,
    }),
  });

  if (!response.ok) {
    throw new Error((await readErrorText(response)) || "Failed to save the now page");
  }

  return readNowFromEnvelope(await response.json());
}
