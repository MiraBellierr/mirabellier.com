type FriendlyFetchMessage = {
  title: string;
  message: string;
  detail: string | null;
};

const OFFLINE_HINTS = [
  "failed to fetch",
  "network",
  "offline",
  "internet",
  "econnrefused",
  "enotfound",
  "dns",
  "timed out",
  "timeout",
  "net::",
];

const BACKEND_HINTS = [
  "502",
  "503",
  "504",
  "500",
  "bad gateway",
  "service unavailable",
  "gateway timeout",
  "internal server error",
  "temporarily unavailable",
  "upstream",
];

function includesAny(text: string, hints: string[]) {
  return hints.some((hint) => text.includes(hint));
}

function isBrowserOffline() {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    navigator.onLine === false
  );
}

export function getFriendlyFetchMessage(
  contextLabel: string,
  rawMessage: string | null | undefined,
): FriendlyFetchMessage {
  const safeMessage = rawMessage?.trim() || null;
  const normalized = safeMessage?.toLowerCase() || "";
  const lowerContext = contextLabel.toLowerCase();

  if (isBrowserOffline() || includesAny(normalized, OFFLINE_HINTS)) {
    return {
      title: "Connection looks offline right now.",
      message: `I couldn't reach ${lowerContext}. Check your internet and try again.`,
      detail: safeMessage,
    };
  }

  if (includesAny(normalized, BACKEND_HINTS)) {
    return {
      title: `${contextLabel} is taking a short nap.`,
      message: `The server did not respond in time. Please retry in a moment.`,
      detail: safeMessage,
    };
  }

  return {
    title: `Couldn't load ${lowerContext}.`,
    message: "Please retry. If it keeps happening, the backend may be restarting.",
    detail: safeMessage,
  };
}
