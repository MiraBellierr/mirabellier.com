import { API_BASE } from "./config";

/**
 * The Discord OAuth URL to send the browser to. The current page is already
 * remembered as the post-login target (the app-wide tracker in `App.tsx`
 * runs on every route change), so this can be a plain full-page navigation
 * with no intermediate `/login` stop.
 */
export function getDiscordAuthUrl(): string {
  const params = new URLSearchParams({
    redirect_origin: window.location.origin,
  });
  return `${API_BASE}/auth/discord?${params.toString()}`;
}

/** Send the browser straight to Discord OAuth, skipping the `/login` page. */
export function redirectToDiscordLogin(): void {
  window.location.href = getDiscordAuthUrl();
}
