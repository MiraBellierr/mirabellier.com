// Client for the pixies real-time inbox. The backend pushes `pixie:notification:new`
// and `pixie:notification:unread-count` over the shared WebSocket (see
// mirabellier-backend/lib/pixie-notifications.js); these REST calls back the
// initial load, pagination, and read-state changes.
import { API_BASE } from "@/lib/config";

export type PixieNotificationType =
  | "like"
  | "comment"
  | "reply"
  | "comment_like"
  | "mention"
  | "video_removed"
  | (string & {});

export interface PixieNotificationActor {
  id: string;
  username: string;
  avatar: string | null;
}

export interface PixieNotification {
  id: string;
  type: PixieNotificationType;
  actor: PixieNotificationActor | null;
  videoId: string | null;
  commentId: string | null;
  preview: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface PixieNotificationPage {
  notifications: PixieNotification[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  unread: number;
}

export async function fetchPixieNotifications(options?: {
  page?: number;
  limit?: number;
}): Promise<PixieNotificationPage> {
  const params = new URLSearchParams();
  if (options?.page) params.set("page", String(options.page));
  if (options?.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  const res = await fetch(
    `${API_BASE}/pixies/notifications${query ? `?${query}` : ""}`,
    { credentials: "include", cache: "no-store" },
  );
  if (!res.ok) throw new Error("Failed to load notifications");
  return res.json() as Promise<PixieNotificationPage>;
}

export async function fetchPixieNotificationUnreadCount(): Promise<number> {
  const res = await fetch(`${API_BASE}/pixies/notifications/unread-count`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to load unread count");
  const data = (await res.json()) as { count: number };
  return data.count ?? 0;
}

export async function markPixieNotificationRead(id: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/pixies/notifications/${encodeURIComponent(id)}/read`,
    { method: "POST", credentials: "include" },
  );
  if (!res.ok) throw new Error("Failed to mark notification read");
}

export async function markAllPixieNotificationsRead(): Promise<void> {
  const res = await fetch(`${API_BASE}/pixies/notifications/read-all`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to mark all read");
}

/** "just now" · "5m" · "3h" · "2d" · locale date. */
export function formatNotificationTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}
