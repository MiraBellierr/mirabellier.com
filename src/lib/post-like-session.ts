// Anonymous like identity is minted and stored *by the client* — it is not a
// trustworthy per-person signal. Clearing localStorage (or just sending a fresh
// random `x-like-anonymous-id` header) yields another like on the same post. The
// only real limit is the 60-writes-per-minute per-IP cap in app.js.
//
// This is deliberate: blog like counts here are a decorative engagement hint,
// not a metric anything depends on. If they ever need to *mean* something,
// anonymous actions must be keyed on a server-issued signed cookie (see the
// `signSessionId` HMAC helper in mirabellier-backend/lib/users.js) or an IP+UA
// hash, and the backend must return a per-viewer `liked` flag instead of
// shipping the raw actor-id array for the client to match against.
const ANONYMOUS_LIKE_STORAGE_KEY = "mirabellier.anonymous_like_id";

function canUseStorage() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function isValidAnonymousLikeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^anon:[a-z0-9-]{12,}$/i.test(value.trim())
  );
}

function generateAnonymousLikeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `anon:${crypto.randomUUID()}`;
  }

  return `anon:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function readAnonymousLikeId() {
  if (!canUseStorage()) return null;

  try {
    const stored = window.localStorage.getItem(ANONYMOUS_LIKE_STORAGE_KEY);
    return isValidAnonymousLikeId(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function ensureAnonymousLikeId() {
  const existing = readAnonymousLikeId();
  if (existing) return existing;

  const nextId = generateAnonymousLikeId();

  if (canUseStorage()) {
    try {
      window.localStorage.setItem(ANONYMOUS_LIKE_STORAGE_KEY, nextId);
    } catch {
      // Fall back to the generated ID for the current request even if storage fails.
    }
  }

  return nextId;
}
