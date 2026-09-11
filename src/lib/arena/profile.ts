import type { ArenaProfile } from "./shared";
import { arenaRequest, normalizeProfile } from "./shared";

export async function fetchArenaProfile(token: string): Promise<ArenaProfile> {
  return normalizeProfile(await arenaRequest("/arena/profile", { token }));
}

export async function claimArenaDailyLogin(
  token: string,
): Promise<{ streak: number; coins: number; coinsTotal: number }> {
  return arenaRequest("/arena/daily-login/claim", { token, method: "POST", body: {} });
}
