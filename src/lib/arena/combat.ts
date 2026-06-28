import { joinApi } from "@/lib/config";
import { shouldSendBearerToken } from "@/lib/auth-session";
import type { ArenaFightResponse, ArenaActiveFight } from "./shared";
import { normalizeProfile, normalizeFightOpponent, normalizeActiveFight, readApiError, makeAuthHeaders } from "./shared";

export async function runArenaFight(
  token: string,
): Promise<ArenaFightResponse> {
  const response = await fetch(joinApi("/arena/fight"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const payload = (await response.json()) as ArenaFightResponse;
  return {
    ...payload,
    opponent: normalizeFightOpponent(payload.opponent),
    profile: normalizeProfile(payload.profile),
  };
}
export async function startPlaybackFight(
  token: string,
): Promise<ArenaActiveFight> {
  const response = await fetch(joinApi("/arena/fight/start"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return normalizeActiveFight(await response.json());
}
export async function fetchFightState(
  token: string,
): Promise<{ activeFight: ArenaActiveFight | null }> {
  const response = await fetch(joinApi("/arena/fight/state"), {
    credentials: "include",
    headers: shouldSendBearerToken(token)
      ? { Authorization: `Bearer ${token}` }
      : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const payload = (await response.json()) as {
    activeFight: ArenaActiveFight | null;
  };
  return {
    activeFight: payload.activeFight
      ? normalizeActiveFight(payload.activeFight)
      : null,
  };
}
export async function advanceFightTurn(
  token: string,
): Promise<ArenaActiveFight> {
  const response = await fetch(joinApi("/arena/fight/advance"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return normalizeActiveFight(await response.json());
}
export async function skipFight(
  token: string,
): Promise<ArenaActiveFight> {
  const response = await fetch(joinApi("/arena/fight/skip"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return normalizeActiveFight(await response.json());
}
export async function verifyArena(
  token: string,
  turnstileToken: string,
): Promise<void> {
  const response = await fetch(joinApi("/arena/verify"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ turnstileToken }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }
}
