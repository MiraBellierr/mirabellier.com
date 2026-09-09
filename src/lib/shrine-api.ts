import { API_BASE } from "@/lib/config";
import { shouldSendBearerToken } from "@/lib/auth-session";
import { swrJson } from "@/lib/api-cache";
import type { CharacterShrineData } from "@/components/CharacterShrinePage";

export type ShrinePageRecord = {
  slug: string;
  path: string;
  title: string;
  description: string;
  excerpt: string;
  image: string;
  imageAlt: string;
  schemaType: string;
  about: string[];
  keywords: string[];
  priority: string;
  changefreq: string;
  ctaLabel: string;
  payload: CharacterShrineData | null;
  createdAt: string;
  updatedAt: string;
};

export type ShrineMutationInput = {
  slug?: string;
  title?: string;
  description?: string;
  excerpt?: string;
  image?: string;
  imageAlt?: string;
  schemaType?: string;
  about?: string[];
  keywords?: string[];
  priority?: string;
  changefreq?: string;
  ctaLabel?: string;
  payload: CharacterShrineData;
};

async function parseJsonOrThrow(response: Response) {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error || "Request failed");
  }
  return response.json();
}

async function shrineError(response: Response) {
  const data = await response.json().catch(() => ({}));
  return new Error(
    (data as { error?: string })?.error || "Request failed",
  );
}

export function fetchShrinePages() {
  return swrJson(
    `${API_BASE}/shrines/pages`,
    (json) => json as ShrinePageRecord[],
    { init: { credentials: "include" }, errorFrom: shrineError },
  );
}

export function fetchShrinePage(slug: string) {
  return swrJson(
    `${API_BASE}/shrines/pages/${slug}`,
    (json) => json as ShrinePageRecord,
    { init: { credentials: "include" }, errorFrom: shrineError },
  );
}

export async function createShrinePage(input: ShrineMutationInput, token: string) {
  const response = await fetch(`${API_BASE}/shrines/pages`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(shouldSendBearerToken(token) ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });
  return (await parseJsonOrThrow(response)) as ShrinePageRecord;
}

export async function updateShrinePage(
  slug: string,
  input: ShrineMutationInput,
  token: string,
) {
  const response = await fetch(`${API_BASE}/shrines/pages/${slug}`, {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(shouldSendBearerToken(token) ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });
  return (await parseJsonOrThrow(response)) as ShrinePageRecord;
}
