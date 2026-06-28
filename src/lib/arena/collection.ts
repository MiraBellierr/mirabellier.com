import { joinApi } from "@/lib/config";
import { shouldSendBearerToken } from "@/lib/auth-session";
import type { ArenaCollectionResponse, ArenaSelectCollectionCardResponse, ArenaSacrificeResponse } from "./shared";
import { readApiError, makeAuthHeaders } from "./shared";

export async function fetchArenaCollection(
  token: string,
  options: { page?: number; perPage?: number; sort?: string; search?: string; element?: string; duplicates?: boolean } = {},
): Promise<ArenaCollectionResponse> {
  const params = new URLSearchParams();
  if (options.page) params.set("page", String(options.page));
  if (options.perPage) params.set("perPage", String(options.perPage));
  if (options.sort) params.set("sort", options.sort);
  if (options.search) params.set("search", options.search);
  if (options.element) params.set("element", options.element);
  if (options.duplicates) params.set("duplicates", "1");
  const response = await fetch(joinApi(`/arena/collection?${params.toString()}`), {
    credentials: "include",
    headers: shouldSendBearerToken(token)
      ? { Authorization: `Bearer ${token}` }
      : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaCollectionResponse;
}
export async function selectArenaCollectionCard(
  token: string,
  cardInstanceId: string,
): Promise<ArenaSelectCollectionCardResponse> {
  const response = await fetch(joinApi("/arena/collection/select-card"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ cardInstanceId }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaSelectCollectionCardResponse;
}
export async function toggleArenaCollectionCardFavorite(
  token: string,
  cardInstanceId: string,
): Promise<{ cardInstanceId: string; isFavorite: boolean }> {
  const response = await fetch(joinApi("/arena/collection/toggle-favorite"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ cardInstanceId }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as { cardInstanceId: string; isFavorite: boolean };
}
export async function sacrificeArenaCollectionCards(
  token: string,
  cardInstanceIds: string[],
  confirm: boolean,
): Promise<ArenaSacrificeResponse> {
  const response = await fetch(joinApi("/arena/collection/sacrifice"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ cardInstanceIds, confirm }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaSacrificeResponse;
}
