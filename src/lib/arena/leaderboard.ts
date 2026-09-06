import type { ArenaMetric, ArenaLeaderboardResponse } from "./shared";
import { arenaRequest, normalizeLeaderboard } from "./shared";

export async function fetchArenaLeaderboard(
  metric: ArenaMetric,
  options: { page?: number; perPage?: number } = {},
): Promise<ArenaLeaderboardResponse> {
  const payload = await arenaRequest<unknown>("/arena/leaderboard", {
    query: { metric, page: options.page, perPage: options.perPage },
  });
  return normalizeLeaderboard(payload, metric);
}
