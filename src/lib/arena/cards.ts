import { joinApi } from "@/lib/config";
import type { ArenaCard, ArenaProfile } from "./shared";
import { normalizeProfile, readApiError, makeAuthHeaders } from "./shared";

export async function drawArenaCard(
  token: string,
): Promise<{ card: ArenaCard; profile: ArenaProfile }> {
  const response = await fetch(joinApi("/arena/draw-card"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const payload = (await response.json()) as {
    card: ArenaCard;
    profile: ArenaProfile;
  };
  return {
    ...payload,
    profile: normalizeProfile(payload.profile),
  };
}
export async function drawArenaPack(
  token: string,
  count = 5,
): Promise<{ cards: ArenaCard[]; profile: ArenaProfile }> {
  const response = await fetch(joinApi("/arena/draw-pack"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ count }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const payload = (await response.json()) as {
    cards: ArenaCard[];
    profile: ArenaProfile;
  };
  return {
    ...payload,
    profile: normalizeProfile(payload.profile),
  };
}
