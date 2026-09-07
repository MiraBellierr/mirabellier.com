import type { ArenaTitlesResponse } from "./shared";
import { arenaRequest } from "./shared";

export async function fetchArenaTitles(
  token: string,
): Promise<ArenaTitlesResponse> {
  return arenaRequest("/arena/shop/titles", { token });
}
export async function buyArenaTitle(
  token: string,
  titleId: string,
): Promise<ArenaTitlesResponse> {
  return arenaRequest("/arena/shop/titles/buy", { token, body: { titleId } });
}
export async function setActiveArenaTitle(
  token: string,
  titleId: string | null,
): Promise<ArenaTitlesResponse> {
  return arenaRequest("/arena/shop/titles/activate", {
    token,
    body: { titleId: titleId ?? "" },
  });
}
