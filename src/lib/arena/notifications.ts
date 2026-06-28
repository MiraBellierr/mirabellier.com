import { joinApi } from "@/lib/config";
import type { ArenaNotification } from "./shared";
import { readApiError, makeAuthHeaders } from "./shared";

export async function fetchArenaNotifications(
  token: string,
  options: { page?: number; limit?: number } = {},
): Promise<{ notifications: ArenaNotification[]; page: number; limit: number; total: number; totalPages: number }> {
  const params = new URLSearchParams();
  if (options.page) params.set("page", String(options.page));
  if (options.limit) params.set("limit", String(options.limit));
  const response = await fetch(joinApi(`/arena/notifications?${params.toString()}`), {
    credentials: "include",
    headers: makeAuthHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  return (await response.json()) as { notifications: ArenaNotification[]; page: number; limit: number; total: number; totalPages: number };
}
export async function fetchArenaUnreadCount(
  token: string,
): Promise<number> {
  const response = await fetch(joinApi("/arena/notifications/unread-count"), {
    credentials: "include",
    headers: makeAuthHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  const payload = (await response.json()) as { count: number };
  return payload.count;
}
export async function markArenaNotificationRead(
  token: string,
  notificationId: string,
): Promise<void> {
  const response = await fetch(
    joinApi(`/arena/notifications/${encodeURIComponent(notificationId)}/read`),
    {
      method: "POST",
      credentials: "include",
      headers: makeAuthHeaders(token),
    },
  );
  if (!response.ok) throw await readApiError(response);
}
export async function markAllArenaNotificationsRead(
  token: string,
): Promise<void> {
  const response = await fetch(joinApi("/arena/notifications/read-all"), {
    method: "POST",
    credentials: "include",
    headers: makeAuthHeaders(token),
  });
  if (!response.ok) throw await readApiError(response);
}
