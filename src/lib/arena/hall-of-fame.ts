import { joinApi } from "@/lib/config";
import type { ArenaHallOfFameResponse } from "./shared";
import { readApiError } from "./shared";

export async function fetchArenaHallOfFame(
  options: { month?: string; page?: number } = {},
): Promise<ArenaHallOfFameResponse> {
  const params = new URLSearchParams();
  if (options.month) params.set("month", options.month);
  if (options.page) params.set("page", String(options.page));

  const query = params.toString();
  const response = await fetch(
    joinApi(`/arena/hall-of-fame${query ? `?${query}` : ""}`),
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw await readApiError(response);
  }

  return response.json();
}
