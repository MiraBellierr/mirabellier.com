const QUESTION_GUEST_STORAGE_KEY = "mirabellier.qotd_guest_token";
const QUESTION_GUEST_TOKEN_PATTERN = /^qotd:guest:[a-z0-9-]{12,}$/i;

function canUseStorage() {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function isValidQuestionGuestToken(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    QUESTION_GUEST_TOKEN_PATTERN.test(value.trim())
  );
}

function generateQuestionGuestToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `qotd:guest:${crypto.randomUUID()}`;
  }

  return `qotd:guest:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function readQuestionGuestToken() {
  if (!canUseStorage()) return null;

  try {
    const stored = window.localStorage.getItem(QUESTION_GUEST_STORAGE_KEY);
    return isValidQuestionGuestToken(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function ensureQuestionGuestToken() {
  const existing = readQuestionGuestToken();
  if (existing) return existing;

  const nextToken = generateQuestionGuestToken();

  if (canUseStorage()) {
    try {
      window.localStorage.setItem(QUESTION_GUEST_STORAGE_KEY, nextToken);
    } catch {
      // Keep the generated token for the current request even if storage fails.
    }
  }

  return nextToken;
}
