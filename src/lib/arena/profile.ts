import { joinApi } from "@/lib/config";
import { shouldSendBearerToken } from "@/lib/auth-session";
import type { ArenaProfile } from "./shared";
import { normalizeProfile, readApiError } from "./shared";

export async function fetchArenaProfile(token: string): Promise<ArenaProfile> {
  const response = await fetch(joinApi("/arena/profile"), {
    credentials: "include",
    headers: shouldSendBearerToken(token)
      ? { Authorization: `Bearer ${token}` }
      : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return normalizeProfile(await response.json());
}
