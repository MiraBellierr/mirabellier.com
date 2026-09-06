import type { ArenaCard, ArenaProfile, ArenaTradeUser, ArenaTradeListing, ArenaTradeListingsResponse, ArenaTradeRequest, ArenaTradeSession } from "./shared";
import { arenaRequest } from "./shared";

const session = (sessionId: string, action: string) =>
  `/arena/trade/session/${encodeURIComponent(sessionId)}/${action}`;

export async function searchArenaTradeUsers(
  token: string,
  query: string,
): Promise<ArenaTradeUser[]> {
  const payload = await arenaRequest<{ users: ArenaTradeUser[] }>(
    "/arena/trade/users",
    { token, query: { q: query } },
  );
  return payload.users;
}
export async function searchArenaTradeCards(
  token: string,
  query: string,
): Promise<ArenaCard[]> {
  const payload = await arenaRequest<{ cards: ArenaCard[] }>(
    "/arena/trade/cards",
    { token, query: { q: query } },
  );
  return payload.cards;
}
export async function fetchArenaTradeListings(
  token: string,
  options: {
    page?: number;
    limit?: number;
    search?: string;
    wantedRarity?: string;
    wantedElement?: string;
  } = {},
  signal?: AbortSignal,
): Promise<ArenaTradeListingsResponse> {
  return arenaRequest("/arena/trade/listings", {
    token,
    signal,
    query: {
      page: options.page,
      limit: options.limit,
      search: options.search,
      wantedRarity: options.wantedRarity,
      wantedElement: options.wantedElement,
    },
  });
}
export async function fetchMyArenaTradeListings(
  token: string,
  signal?: AbortSignal,
): Promise<ArenaTradeListingsResponse> {
  return arenaRequest("/arena/trade/listings/mine", { token, signal });
}
export async function createArenaTradeListing(
  token: string,
  input: {
    cardInstanceId: string;
    wantedCardInstanceId?: string;
    wantedCardMalId?: number;
    wantedRarity?: string;
    wantedElement?: string;
    note?: string;
  },
): Promise<{ listing: ArenaTradeListing; profile: ArenaProfile }> {
  return arenaRequest("/arena/trade/listings", { token, body: input });
}
export async function cancelArenaTradeListing(
  token: string,
  listingId: string,
): Promise<{ listing: ArenaTradeListing; profile: ArenaProfile }> {
  return arenaRequest(
    `/arena/trade/listings/${encodeURIComponent(listingId)}/cancel`,
    { token, method: "POST", body: {} },
  );
}
export async function sendArenaTradeRequest(
  token: string,
  responderId: string,
  cardInstanceId?: string,
  listingId?: string,
): Promise<{ requestId: string }> {
  return arenaRequest("/arena/trade/request", {
    token,
    body: { responderId, cardInstanceId, listingId },
  });
}
export async function fetchIncomingArenaTradeRequests(
  token: string,
): Promise<ArenaTradeRequest[]> {
  const payload = await arenaRequest<{ requests: ArenaTradeRequest[] }>(
    "/arena/trade/requests/incoming",
    { token },
  );
  return payload.requests;
}
export async function acceptArenaTradeRequest(
  token: string,
  requestId: string,
): Promise<{ askerCard?: ArenaCard; responderCard?: ArenaCard; sessionId?: string; completed?: boolean }> {
  return arenaRequest(
    `/arena/trade/requests/${encodeURIComponent(requestId)}/accept`,
    { token, method: "POST", body: {} },
  );
}
export async function denyArenaTradeRequest(
  token: string,
  requestId: string,
): Promise<{ status: string }> {
  return arenaRequest(
    `/arena/trade/requests/${encodeURIComponent(requestId)}/deny`,
    { token, method: "POST", body: {} },
  );
}
export async function cancelArenaTradeRequest(
  token: string,
  requestId: string,
): Promise<{ status: string }> {
  return arenaRequest(
    `/arena/trade/requests/${encodeURIComponent(requestId)}/cancel`,
    { token, method: "POST", body: {} },
  );
}
export async function fetchArenaTradeRequestStatus(
  token: string,
  requestId: string,
): Promise<{ id: string; askerId: string; responderId: string; status: string; createdAt: string; sessionId: string | null }> {
  return arenaRequest(
    `/arena/trade/request/${encodeURIComponent(requestId)}`,
    { token },
  );
}
export async function fetchArenaTradeSession(
  token: string,
  sessionId: string,
): Promise<ArenaTradeSession | null> {
  const payload = await arenaRequest<{ session: ArenaTradeSession | null }>(
    `/arena/trade/session/${encodeURIComponent(sessionId)}`,
    { token },
  );
  return payload.session;
}
export async function offerCardInArenaTrade(
  token: string,
  sessionId: string,
  cardInstanceId: string,
): Promise<ArenaTradeSession> {
  return arenaRequest(session(sessionId, "offer-card"), {
    token,
    body: { cardInstanceId },
  });
}
export async function removeCardFromArenaTrade(
  token: string,
  sessionId: string,
  cardInstanceId?: string,
): Promise<ArenaTradeSession> {
  return arenaRequest(session(sessionId, "remove-card"), {
    token,
    body: { cardInstanceId },
  });
}
export async function offerCoinsInArenaTrade(
  token: string,
  sessionId: string,
  amount: number,
): Promise<ArenaTradeSession> {
  return arenaRequest(session(sessionId, "offer-coins"), {
    token,
    body: { amount },
  });
}
export async function removeCoinsFromArenaTrade(
  token: string,
  sessionId: string,
): Promise<ArenaTradeSession> {
  return arenaRequest(session(sessionId, "remove-coins"), {
    token,
    method: "POST",
    body: {},
  });
}
export async function confirmArenaTrade(
  token: string,
  sessionId: string,
): Promise<ArenaTradeSession> {
  return arenaRequest(session(sessionId, "confirm"), { token, method: "POST", body: {} });
}
export async function unconfirmArenaTrade(
  token: string,
  sessionId: string,
): Promise<ArenaTradeSession> {
  return arenaRequest(session(sessionId, "unconfirm"), { token, method: "POST", body: {} });
}
export async function cancelArenaTradeSession(
  token: string,
  sessionId: string,
): Promise<{ status: string }> {
  return arenaRequest(session(sessionId, "cancel"), { token, method: "POST", body: {} });
}
