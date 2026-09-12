// Shared by main.tsx (vite:preloadError / unhandledrejection listeners) and
// ErrorBoundary (React.lazy's import() rejecting during render, which never
// fires those two events since React's Suspense mechanism already has a
// .then/.catch on the promise). Both paths mean the same thing: this tab's
// bundle references a chunk that a newer deploy has overwritten, so a full
// reload picks up the current index.html and hashed asset URLs.

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

const CHUNK_RELOAD_GUARD = "mirabellier-chunk-reload";
const CHUNK_RELOAD_QUERY = "__chunk_reload";
const CHUNK_RELOAD_COOLDOWN_MS = 90_000;
const CHUNK_FAILURE_KEY = "mirabellier-chunk-failures";
const CHUNK_FAILURE_WINDOW_MS = 30_000;
// Vite 7's __vitePreload calls preventDefault() to suppress the throw, so a
// stale chunk never produces a second import attempt to count toward a
// higher threshold — the page is already dead after the first failure.
const CHUNK_FAILURE_THRESHOLD = 1;

export function isChunkLoadErrorMessage(message: string): boolean {
  return (
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    message.includes("ChunkLoadError")
  );
}

function parsePositiveInteger(value: string | null) {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function readChunkReloadGuardFromSession() {
  try {
    return parsePositiveInteger(sessionStorage.getItem(CHUNK_RELOAD_GUARD));
  } catch {
    return 0;
  }
}

function writeChunkReloadGuardToSession(timestamp: number): boolean {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_GUARD, String(timestamp));
    return true;
  } catch {
    // Safari can deny storage access in some modes; URL guard still applies.
    return false;
  }
}

export function consumeChunkReloadGuardFromUrl() {
  const url = new URL(window.location.href);
  const queryTimestamp = parsePositiveInteger(
    url.searchParams.get(CHUNK_RELOAD_QUERY),
  );
  if (!queryTimestamp) return;

  const sessionWriteOk = writeChunkReloadGuardToSession(queryTimestamp);
  if (!sessionWriteOk) return;

  url.searchParams.delete(CHUNK_RELOAD_QUERY);

  try {
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  } catch {
    // Ignore history API failures and keep app boot resilient.
  }
}

function readChunkFailureTimestamps(): number[] {
  try {
    const raw = sessionStorage.getItem(CHUNK_FAILURE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  } catch {
    return [];
  }
}

function recordChunkFailure(): number {
  const now = Date.now();
  let timestamps = readChunkFailureTimestamps();
  timestamps = timestamps.filter((t) => now - t < CHUNK_FAILURE_WINDOW_MS);
  timestamps.push(now);
  try {
    sessionStorage.setItem(CHUNK_FAILURE_KEY, JSON.stringify(timestamps));
  } catch {
    // Ignore storage failures.
  }
  return timestamps.length;
}

function readLastChunkReloadTimestamp() {
  const sessionTimestamp = readChunkReloadGuardFromSession();
  const urlTimestamp = parsePositiveInteger(
    new URL(window.location.href).searchParams.get(CHUNK_RELOAD_QUERY),
  );
  return Math.max(sessionTimestamp, urlTimestamp);
}

function shouldReload(): boolean {
  if (isIOS()) return false;

  const now = Date.now();
  const lastReloadTimestamp = readLastChunkReloadTimestamp();
  if (
    lastReloadTimestamp > 0 &&
    now - lastReloadTimestamp < CHUNK_RELOAD_COOLDOWN_MS
  ) {
    return false;
  }

  const failures = recordChunkFailure();
  if (failures < CHUNK_FAILURE_THRESHOLD) {
    return false;
  }

  return true;
}

export function reloadForUpdatedBuild(): boolean {
  if (!shouldReload()) return false;

  const now = Date.now();
  writeChunkReloadGuardToSession(now);
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set(CHUNK_RELOAD_QUERY, String(now));
  window.location.replace(nextUrl.toString());
  return true;
}
