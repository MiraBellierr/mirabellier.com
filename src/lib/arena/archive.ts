import type { ArenaArchiveResponse } from "./shared";
import { arenaRequest } from "./shared";

export async function fetchArenaArchive(
  token: string,
  options: {
    page?: number;
    perPage?: number;
    search?: string;
    ownership?: "all" | "owned" | "not-owned";
  } = {},
): Promise<ArenaArchiveResponse> {
  return arenaRequest("/arena/archive", {
    token,
    query: {
      page: options.page,
      perPage: options.perPage,
      search: options.search,
      ownership:
        options.ownership && options.ownership !== "all"
          ? options.ownership
          : undefined,
    },
  });
}
