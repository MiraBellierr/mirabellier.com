// Client for the user follow graph (see mirabellier-backend/lib/user-follows.js).
import { API_BASE } from "@/lib/config";

export interface FollowState {
  following: boolean;
  followersCount: number;
  followingCount?: number;
}

export async function fetchFollowState(userId: string): Promise<FollowState> {
  const res = await fetch(
    `${API_BASE}/user/${encodeURIComponent(userId)}/follow`,
    { credentials: "include", cache: "no-store" },
  );
  if (!res.ok) throw new Error("Failed to load follow state");
  return res.json() as Promise<FollowState>;
}

/** Toggle the current viewer's follow of `userId`. Returns the new state. */
export async function toggleFollow(userId: string): Promise<FollowState> {
  const res = await fetch(
    `${API_BASE}/user/${encodeURIComponent(userId)}/follow`,
    { method: "POST", credentials: "include" },
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || "Failed to update follow");
  }
  return res.json() as Promise<FollowState>;
}
