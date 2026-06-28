import { joinApi } from "@/lib/config";
import { shouldSendBearerToken } from "@/lib/auth-session";
import type { ArenaArchiveResponse } from "./shared";
import { readApiError } from "./shared";

export async function fetchArenaArchive(
  token: string,
  options: {
    page?: number;
    perPage?: number;
    search?: string;
    ownership?: "all" | "owned" | "not-owned";
  } = {},
): Promise<ArenaArchiveResponse> {
  const params = new URLSearchParams();
  if (options.page) params.set("page", String(options.page));
  if (options.perPage) params.set("perPage", String(options.perPage));
  if (options.search) params.set("search", options.search);
  if (options.ownership && options.ownership !== "all") {
    params.set("ownership", options.ownership);
  }
  const response = await fetch(joinApi(`/arena/archive?${params.toString()}`), {
    credentials: "include",
    headers: shouldSendBearerToken(token)
      ? { Authorization: `Bearer ${token}` }
      : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaArchiveResponse;
}
