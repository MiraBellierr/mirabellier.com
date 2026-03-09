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
