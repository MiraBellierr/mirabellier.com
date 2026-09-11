import type { ArenaFightResponse, ArenaActiveFight, ArenaBattleTurn, ArenaCard } from "./shared";
import {
  arenaRequest,
  normalizeProfile,
  normalizeFightOpponent,
  normalizeActiveFight,
  ArenaApiError,
} from "./shared";

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
export type ArenaActiveFighter = {
  userId: string;
  username: string;
  updatedAt: string;
};

// Spectator mode: read-only, no token required — anyone can see who's
// currently fighting and watch (poll) their fight.
export async function fetchActiveArenaFighters(): Promise<ArenaActiveFighter[]> {
  const payload = await arenaRequest<{ fighters: ArenaActiveFighter[] }>(
    "/arena/spectate/active",
  );
  return payload.fighters;
}

export async function fetchSpectatedFight(
  userId: string,
  signal?: AbortSignal,
): Promise<ArenaActiveFight | null> {
  try {
    const payload = await arenaRequest<{ activeFight: ArenaActiveFight }>(
      `/arena/spectate/${encodeURIComponent(userId)}`,
      { signal },
    );
    return normalizeActiveFight(payload.activeFight);
  } catch (error) {
    if (error instanceof ArenaApiError && error.status === 404) return null;
    throw error;
  }
}

export type ArenaFightReplayRecord = {
  id: string;
  userId: string;
  username: string;
  opponentUserId: string;
  result: "win" | "loss";
  rounds: ArenaBattleTurn[];
  xpDelta: number;
  coinDelta: number;
  createdAt: string;
  // Nullable — fights recorded before this shipped have no card snapshot.
  playerCard?: ArenaCard | null;
  opponentCard?: ArenaCard | null;
};

// Replay links: read-only, no token required — a completed fight's rounds
// are already stored, so anyone with the id can watch it play out.
export async function fetchArenaFightReplay(
  id: string,
  signal?: AbortSignal,
): Promise<ArenaFightReplayRecord | null> {
  try {
    const payload = await arenaRequest<{ fight: ArenaFightReplayRecord }>(
      `/arena/fights/${encodeURIComponent(id)}`,
      { signal },
    );
    return payload.fight;
  } catch (error) {
    if (error instanceof ArenaApiError && error.status === 404) return null;
    throw error;
  }
}

export async function verifyArena(
  token: string,
  turnstileToken: string,
): Promise<void> {
  await arenaRequest<void>("/arena/verify", { token, body: { turnstileToken } });
}
