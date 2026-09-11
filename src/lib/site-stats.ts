// Client for the public sitewide stats (see mirabellier-backend/lib/site-stats.js).
import { API_BASE } from "@/lib/config";
import { swrJson } from "@/lib/api-cache";
import type { GuestbookMood } from "@/lib/guestbook-api";

export type SiteStats = {
  postsCount: number;
  guestbookCount: number;
  guestbookMoods: Array<{ mood: GuestbookMood; count: number }>;
  topGuestbookMood: GuestbookMood | null;
  qotdQuestionsCount: number;
  qotdAnswersCount: number;
  arenaFightsCount: number;
  arenaWinsCount: number;
  pixiesCount: number;
  usersCount: number;
  sinceDate: string | null;
};

export function fetchSiteStats(signal?: AbortSignal) {
  return swrJson<SiteStats>(
    `${API_BASE}/stats`,
    (json) => json as SiteStats,
    { init: { credentials: "include" }, signal, errorFrom: () => new Error("Failed to load site stats") },
  );
}
