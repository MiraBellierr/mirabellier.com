import { joinApi } from "@/lib/config";

// Generic Web Push endpoints for every non-Twitch topic ("blog:new-post",
// "qotd:new", "pixie:follows:<userId>"). Twitch keeps its own dedicated
// /twitch/push/* endpoints in src/lib/twitch-api.ts — same shape, different
// route, see mirabellier-backend/lib/push-subscriptions.js for why.

export const TOPIC_NEW_POST = "blog:new-post";
export const TOPIC_NEW_QOTD = "qotd:new";

/** Mirrors the backend's `followTopic` in lib/push-subscriptions.js. */
export function followTopic(userId: string) {
  return `pixie:follows:${userId}`;
}

export class PushApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "PushApiError";
    this.status = status;
  }
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { error?: string };
    return typeof data.error === "string" && data.error ? data.error : fallback;
  } catch {
    return fallback;
  }
}

export async function fetchVapidPublicKey() {
  const response = await fetch(joinApi("/push/vapid-public-key"), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new PushApiError("Failed to load push configuration", response.status);
  }

  const data = (await response.json()) as { publicKey: string | null };
  return data.publicKey;
}

export async function subscribeToTopic(
  topic: string,
  subscription: PushSubscriptionJSON,
) {
  const response = await fetch(joinApi("/push/subscribe"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, subscription }),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response, "Failed to enable notifications");
    throw new PushApiError(message, response.status);
  }

  return (await response.json()) as { ok: boolean; topic: string };
}

export async function unsubscribeFromTopic(topic: string, endpoint: string) {
  const params = new URLSearchParams({ topic, endpoint });
  const response = await fetch(joinApi(`/push/subscribe?${params.toString()}`), {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const message = await readErrorMessage(response, "Failed to disable notifications");
    throw new PushApiError(message, response.status);
  }

  return (await response.json()) as { ok: boolean };
}

export async function fetchTopicStatus(
  topic: string,
  endpoint: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ topic, endpoint });
  const response = await fetch(joinApi(`/push/status?${params.toString()}`), {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    return { subscribed: false };
  }

  return (await response.json()) as { subscribed: boolean };
}
