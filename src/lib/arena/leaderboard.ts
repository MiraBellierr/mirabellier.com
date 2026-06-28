import { joinApi } from "@/lib/config";
import type { ArenaMetric, ArenaLeaderboardResponse } from "./shared";
import { normalizeLeaderboard, readApiError } from "./shared";

export async function fetchArenaLeaderboard(
  metric: ArenaMetric,
  options: { page?: number; perPage?: number } = {},
): Promise<ArenaLeaderboardResponse> {
  const params = new URLSearchParams({ metric });
  if (options.page) params.set("page", String(options.page));
  if (options.perPage) params.set("perPage", String(options.perPage));
  const response = await fetch(joinApi(`/arena/leaderboard?${params.toString()}`), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return normalizeLeaderboard(await response.json(), metric);
}
