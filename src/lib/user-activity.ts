// Client for the merged "what this user has done" timeline (see
// mirabellier-backend/lib/user-activity.js). Likes are intentionally absent
// — see that module for why.
import { API_BASE } from "@/lib/config";

export type UserActivityEvent =
  | { type: "post"; createdAt: string; title: string; href: string }
  | { type: "guestbook"; createdAt: string; preview: string; href: string }
  | { type: "pixie"; createdAt: string; title: string; href: string }
  | {
      type: "pixie_comment";
      createdAt: string;
      preview: string;
      href: string;
    }
  | { type: "follow"; createdAt: string; username: string; href: string }
  | {
      type: "arena_fight";
      createdAt: string;
      result: "win" | "loss";
      href: string;
    }
  | {
      type: "blog_comment";
      createdAt: string;
      preview: string;
      postTitle: string;
      href: string;
    };

export async function fetchUserActivity(
  userId: string,
  signal?: AbortSignal,
): Promise<UserActivityEvent[]> {
  const res = await fetch(
    `${API_BASE}/user/${encodeURIComponent(userId)}/activity`,
    { credentials: "include", cache: "no-store", signal },
  );
  if (!res.ok) throw new Error("Failed to load activity");
  const data = (await res.json()) as { events: UserActivityEvent[] };
  return data.events;
}
