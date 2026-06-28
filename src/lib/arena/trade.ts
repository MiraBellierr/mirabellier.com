import { joinApi } from "@/lib/config";
import type { ArenaCard, ArenaProfile, ArenaTradeUser, ArenaTradeListing, ArenaTradeListingsResponse, ArenaTradeRequest, ArenaTradeSession } from "./shared";
import { readApiError, makeAuthHeaders } from "./shared";

export async function searchArenaTradeUsers(
  token: string,
  query: string,
): Promise<ArenaTradeUser[]> {
  const params = new URLSearchParams({ q: query });
  const response = await fetch(joinApi(`/arena/trade/users?${params.toString()}`), {
    credentials: "include",
    headers: makeAuthHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  const payload = (await response.json()) as { users: ArenaTradeUser[] };
  return payload.users;
}
export async function searchArenaTradeCards(
  token: string,
  query: string,
): Promise<ArenaCard[]> {
  const params = new URLSearchParams({ q: query });
  const response = await fetch(joinApi(`/arena/trade/cards?${params.toString()}`), {
    credentials: "include",
    headers: makeAuthHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  const payload = (await response.json()) as { cards: ArenaCard[] };
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
): Promise<ArenaTradeListingsResponse> {
  const params = new URLSearchParams();
  if (options.page) params.set("page", String(options.page));
  if (options.limit) params.set("limit", String(options.limit));
  if (options.search) params.set("search", options.search);
  if (options.wantedRarity) params.set("wantedRarity", options.wantedRarity);
  if (options.wantedElement) params.set("wantedElement", options.wantedElement);
  const response = await fetch(joinApi(`/arena/trade/listings?${params.toString()}`), {
    credentials: "include",
    headers: makeAuthHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as ArenaTradeListingsResponse;
}
export async function fetchMyArenaTradeListings(
  token: string,
): Promise<ArenaTradeListingsResponse> {
  const response = await fetch(joinApi("/arena/trade/listings/mine"), {
    credentials: "include",
    headers: makeAuthHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as ArenaTradeListingsResponse;
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
  const response = await fetch(joinApi("/arena/trade/listings"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { listing: ArenaTradeListing; profile: ArenaProfile };
}
export async function cancelArenaTradeListing(
  token: string,
  listingId: string,
): Promise<{ listing: ArenaTradeListing; profile: ArenaProfile }> {
  const response = await fetch(
    joinApi(`/arena/trade/listings/${encodeURIComponent(listingId)}/cancel`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { listing: ArenaTradeListing; profile: ArenaProfile };
}
export async function sendArenaTradeRequest(
  token: string,
  responderId: string,
  cardInstanceId?: string,
  listingId?: string,
): Promise<{ requestId: string }> {
  const response = await fetch(joinApi("/arena/trade/request"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
    body: JSON.stringify({ responderId, cardInstanceId, listingId }),
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { requestId: string };
}
export async function fetchIncomingArenaTradeRequests(
  token: string,
): Promise<ArenaTradeRequest[]> {
  const response = await fetch(joinApi("/arena/trade/requests/incoming"), {
    credentials: "include",
    headers: makeAuthHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  const payload = (await response.json()) as { requests: ArenaTradeRequest[] };
  return payload.requests;
}
export async function acceptArenaTradeRequest(
  token: string,
  requestId: string,
): Promise<{ askerCard?: ArenaCard; responderCard?: ArenaCard; sessionId?: string; completed?: boolean }> {
  const response = await fetch(
    joinApi(`/arena/trade/requests/${encodeURIComponent(requestId)}/accept`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { askerCard?: ArenaCard; responderCard?: ArenaCard; sessionId?: string };
}
export async function denyArenaTradeRequest(
  token: string,
  requestId: string,
): Promise<{ status: string }> {
  const response = await fetch(
    joinApi(`/arena/trade/requests/${encodeURIComponent(requestId)}/deny`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { status: string };
}
export async function cancelArenaTradeRequest(
  token: string,
  requestId: string,
): Promise<{ status: string }> {
  const response = await fetch(
    joinApi(`/arena/trade/requests/${encodeURIComponent(requestId)}/cancel`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { status: string };
}
export async function fetchArenaTradeRequestStatus(
  token: string,
  requestId: string,
): Promise<{ id: string; askerId: string; responderId: string; status: string; createdAt: string; sessionId: string | null }> {
  const response = await fetch(
    joinApi(`/arena/trade/request/${encodeURIComponent(requestId)}`),
    {
      credentials: "include",
      headers: makeAuthHeaders(token),
      cache: "no-store",
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { id: string; askerId: string; responderId: string; status: string; createdAt: string; sessionId: string | null };
}
export async function fetchArenaTradeSession(
  token: string,
  sessionId: string,
): Promise<ArenaTradeSession | null> {
  const response = await fetch(
    joinApi(`/arena/trade/session/${encodeURIComponent(sessionId)}`),
    {
      credentials: "include",
      headers: makeAuthHeaders(token),
      cache: "no-store",
    },
  );
  if (!response.ok) throw await readApiError(response);
  const payload = (await response.json()) as { session: ArenaTradeSession | null };
  return payload.session;
}
export async function offerCardInArenaTrade(
  token: string,
  sessionId: string,
  cardInstanceId: string,
): Promise<ArenaTradeSession> {
  const response = await fetch(
    joinApi(`/arena/trade/session/${encodeURIComponent(sessionId)}/offer-card`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
      body: JSON.stringify({ cardInstanceId }),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as ArenaTradeSession;
}
export async function removeCardFromArenaTrade(
  token: string,
  sessionId: string,
  cardInstanceId?: string,
): Promise<ArenaTradeSession> {
  const response = await fetch(
    joinApi(`/arena/trade/session/${encodeURIComponent(sessionId)}/remove-card`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
      body: JSON.stringify({ cardInstanceId }),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as ArenaTradeSession;
}
export async function offerCoinsInArenaTrade(
  token: string,
  sessionId: string,
  amount: number,
): Promise<ArenaTradeSession> {
  const response = await fetch(
    joinApi(`/arena/trade/session/${encodeURIComponent(sessionId)}/offer-coins`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
      body: JSON.stringify({ amount }),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as ArenaTradeSession;
}
export async function removeCoinsFromArenaTrade(
  token: string,
  sessionId: string,
): Promise<ArenaTradeSession> {
  const response = await fetch(
    joinApi(`/arena/trade/session/${encodeURIComponent(sessionId)}/remove-coins`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as ArenaTradeSession;
}
export async function confirmArenaTrade(
  token: string,
  sessionId: string,
): Promise<ArenaTradeSession> {
  const response = await fetch(
    joinApi(`/arena/trade/session/${encodeURIComponent(sessionId)}/confirm`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as ArenaTradeSession;
}
export async function unconfirmArenaTrade(
  token: string,
  sessionId: string,
): Promise<ArenaTradeSession> {
  const response = await fetch(
    joinApi(`/arena/trade/session/${encodeURIComponent(sessionId)}/unconfirm`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as ArenaTradeSession;
}
export async function cancelArenaTradeSession(
  token: string,
  sessionId: string,
): Promise<{ status: string }> {
  const response = await fetch(
    joinApi(`/arena/trade/session/${encodeURIComponent(sessionId)}/cancel`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
    },
  );
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { status: string };
}
