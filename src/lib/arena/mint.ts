import type { ArenaMintDuplicateGroup, ArenaMintResponse } from "./shared";
import { arenaRequest } from "./shared";

export async function fetchMintDuplicates(
  token: string,
): Promise<ArenaMintDuplicateGroup[]> {
  return arenaRequest("/arena/mint/duplicates", { token });
}
export async function mintRainbowCard(
  token: string,
  cardInstanceId1: string,
  cardInstanceId2: string,
): Promise<ArenaMintResponse> {
  return arenaRequest("/arena/mint", {
    token,
    body: { cardInstanceId1, cardInstanceId2 },
  });
}
