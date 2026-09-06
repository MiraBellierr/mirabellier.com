import type { ArenaNotification } from "./shared";
import { arenaRequest } from "./shared";

export async function fetchArenaNotifications(
  token: string,
  options: { page?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<{ notifications: ArenaNotification[]; page: number; limit: number; total: number; totalPages: number }> {
  return arenaRequest("/arena/notifications", {
    token,
    signal,
    query: { page: options.page, limit: options.limit },
  });
}
export async function fetchArenaUnreadCount(token: string): Promise<number> {
  const payload = await arenaRequest<{ count: number }>(
    "/arena/notifications/unread-count",
    { token },
  );
  return payload.count;
}
export async function markArenaNotificationRead(
  token: string,
  notificationId: string,
): Promise<void> {
  await arenaRequest<void>(
    `/arena/notifications/${encodeURIComponent(notificationId)}/read`,
    { token, method: "POST", body: {} },
  );
}
export async function markAllArenaNotificationsRead(token: string): Promise<void> {
  await arenaRequest<void>("/arena/notifications/read-all", {
    token,
    method: "POST",
    body: {},
  });
}
