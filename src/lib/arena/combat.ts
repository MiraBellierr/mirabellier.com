import type { ArenaFightResponse, ArenaActiveFight } from "./shared";
import { arenaRequest, normalizeProfile, normalizeFightOpponent, normalizeActiveFight } from "./shared";

export async function runArenaFight(token: string): Promise<ArenaFightResponse> {
  const payload = await arenaRequest<ArenaFightResponse>("/arena/fight", {
    token,
    body: {},
  });
  return {
    ...payload,
    opponent: normalizeFightOpponent(payload.opponent),
    profile: normalizeProfile(payload.profile),
  };
}
export async function startPlaybackFight(token: string): Promise<ArenaActiveFight> {
  return normalizeActiveFight(
    await arenaRequest("/arena/fight/start", { token, body: {} }),
  );
}
export async function fetchFightState(
  token: string,
): Promise<{ activeFight: ArenaActiveFight | null }> {
  const payload = await arenaRequest<{ activeFight: ArenaActiveFight | null }>(
    "/arena/fight/state",
    { token },
  );
  return {
    activeFight: payload.activeFight
      ? normalizeActiveFight(payload.activeFight)
      : null,
  };
}
export async function advanceFightTurn(token: string): Promise<ArenaActiveFight> {
  return normalizeActiveFight(
    await arenaRequest("/arena/fight/advance", { token, body: {} }),
  );
}
export async function skipFight(token: string): Promise<ArenaActiveFight> {
  return normalizeActiveFight(
    await arenaRequest("/arena/fight/skip", { token, body: {} }),
  );
}
export async function verifyArena(
  token: string,
  turnstileToken: string,
): Promise<void> {
  await arenaRequest<void>("/arena/verify", { token, body: { turnstileToken } });
}
