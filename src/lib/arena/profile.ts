import type { ArenaProfile } from "./shared";
import { arenaRequest, normalizeProfile } from "./shared";

export async function fetchArenaProfile(token: string): Promise<ArenaProfile> {
  return normalizeProfile(await arenaRequest("/arena/profile", { token }));
}
