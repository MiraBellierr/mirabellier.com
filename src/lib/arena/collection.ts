import type { ArenaCollectionResponse, ArenaSelectCollectionCardResponse, ArenaSacrificeResponse } from "./shared";
import { arenaRequest } from "./shared";

export async function fetchArenaCollection(
  token: string,
  options: { page?: number; perPage?: number; sort?: string; search?: string; element?: string; duplicates?: boolean } = {},
  signal?: AbortSignal,
): Promise<ArenaCollectionResponse> {
  return arenaRequest("/arena/collection", {
    token,
    signal,
    query: {
      page: options.page,
      perPage: options.perPage,
      sort: options.sort,
      search: options.search,
      element: options.element,
      duplicates: options.duplicates ? 1 : undefined,
    },
  });
}
export async function selectArenaCollectionCard(
  token: string,
  cardInstanceId: string,
): Promise<ArenaSelectCollectionCardResponse> {
  return arenaRequest("/arena/collection/select-card", {
    token,
    body: { cardInstanceId },
  });
}
export async function toggleArenaCollectionCardFavorite(
  token: string,
  cardInstanceId: string,
): Promise<{ cardInstanceId: string; isFavorite: boolean }> {
  return arenaRequest("/arena/collection/toggle-favorite", {
    token,
    body: { cardInstanceId },
  });
}
export async function sacrificeArenaCollectionCards(
  token: string,
  cardInstanceIds: string[],
  confirm: boolean,
): Promise<ArenaSacrificeResponse> {
  return arenaRequest("/arena/collection/sacrifice", {
    token,
    body: { cardInstanceIds, confirm },
  });
}
