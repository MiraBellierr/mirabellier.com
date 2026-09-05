// Remembers which in-app page the user was on before they were sent to the
// Discord OAuth login, so `AuthCallback` can drop them back there instead of
// always landing on the home page.
//
// The OAuth round-trip is a full-page navigation away to discord.com and back,
// so React Router state does not survive it — but it returns to the same
// origin/tab, so `sessionStorage` does.

const STORAGE_KEY = "auth:postLoginRedirect";

// Paths that are part of the auth flow itself (or otherwise pointless to
// return to). Landing back on any of these would be a dead end or a loop.
const EXCLUDED_PREFIXES = ["/login", "/register", "/auth"];

/** A same-origin absolute path we are willing to redirect to after login. */
export function isSafeRedirectPath(path: string | null | undefined): path is string {
  if (typeof path !== "string") return false;
  // Must be a root-relative path, not a protocol-relative ("//evil.com") or
  // absolute URL — this value ends up in `navigate(...)`.
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.startsWith("/\\")) return false;
  return !EXCLUDED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Record the page to come back to after login. No-ops for auth-flow paths so
 * navigating Home → /login keeps "Home" as the target rather than "/login".
 */
export function rememberPostLoginRedirect(path: string): void {
  if (!isSafeRedirectPath(path)) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, path);
  } catch {
    // sessionStorage unavailable (private mode, etc.) — fall back to "/".
  }
}

/**
 * Read and clear the remembered redirect. Returns `null` when there is nothing
 * usable stored, so callers can default to the home page.
 */
export function consumePostLoginRedirect(): string | null {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    return null;
  }
  return isSafeRedirectPath(stored) ? stored : null;
}
