import { joinApi } from "@/lib/config";
import { shouldSendBearerToken } from "@/lib/auth-session";
import type { ArenaMintDuplicateGroup, ArenaMintResponse } from "./shared";
import { readApiError, makeAuthHeaders } from "./shared";

export async function fetchMintDuplicates(
  token: string,
): Promise<ArenaMintDuplicateGroup[]> {
  const response = await fetch(joinApi("/arena/mint/duplicates"), {
    credentials: "include",
    headers: shouldSendBearerToken(token)
      ? { Authorization: `Bearer ${token}` }
      : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaMintDuplicateGroup[];
}
export async function mintRainbowCard(
  token: string,
  cardInstanceId1: string,
  cardInstanceId2: string,
): Promise<ArenaMintResponse> {
  const response = await fetch(joinApi("/arena/mint"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ cardInstanceId1, cardInstanceId2 }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  return (await response.json()) as ArenaMintResponse;
}
