import type { ArenaCard, ArenaProfile } from "./shared";
import { arenaRequest, normalizeProfile } from "./shared";

export async function drawArenaCard(
  token: string,
): Promise<{ card: ArenaCard; profile: ArenaProfile }> {
  const payload = await arenaRequest<{ card: ArenaCard; profile: ArenaProfile }>(
    "/arena/draw-card",
    { token, body: {} },
  );
  return { ...payload, profile: normalizeProfile(payload.profile) };
}
export async function drawArenaPack(
  token: string,
  count = 5,
): Promise<{ cards: ArenaCard[]; profile: ArenaProfile }> {
  const payload = await arenaRequest<{ cards: ArenaCard[]; profile: ArenaProfile }>(
    "/arena/draw-pack",
    { token, body: { count } },
  );
  return { ...payload, profile: normalizeProfile(payload.profile) };
}
