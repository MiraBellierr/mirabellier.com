import type { ArenaHallOfFameResponse } from "./shared";
import { arenaRequest } from "./shared";

export async function fetchArenaHallOfFame(
  options: { month?: string; page?: number } = {},
): Promise<ArenaHallOfFameResponse> {
  return arenaRequest("/arena/hall-of-fame", {
    query: { month: options.month, page: options.page },
  });
}
