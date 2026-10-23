// Real-time inbox for the pixies feature. Mirrors the arena notification
// helpers (see lib/arena/notifications.js) but keeps its own table and its
// own set of WebSocket event types so the two inboxes never cross-talk.

const { S2C } = require("./websocket-events");

const NOTIFICATION_TYPES = new Set([
  "like",
  "comment",
  "reply",
  "comment_like",
  "mention",
  "follow",
  "video_removed",
]);

const PREVIEW_MAX_LENGTH = 140;
const LIST_MAX_LIMIT = 50;
const LIST_DEFAULT_LIMIT = 20;
// Keep the table from growing without bound — trim a user's oldest rows once
// they pile up past this after every insert.
const RETAIN_PER_USER = 200;

function wsManager() {
  try {
    return require("./websocket-server").getWebSocketManager();
  } catch {
    return null;
  }
}

function makeId() {
  return `pxn_${Date.now()}_${Math.round(Math.random() * 1e9)}`;
}

function trimPreview(value) {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  if (text.length <= PREVIEW_MAX_LENGTH) return text;
  return `${text.slice(0, PREVIEW_MAX_LENGTH - 1)}…`;
}

function mapRow(row) {
  return {
    id: row.id,
    type: row.type,
    actor: row.actorId
      ? {
          id: row.actorId,
          username: row.actorUsername || "someone",
          avatar: row.actorAvatar || null,
        }
      : null,
    videoId: row.videoId || null,
    commentId: row.commentId || null,
    preview: row.preview || null,
    isRead: row.isRead === 1,
    createdAt: row.createdAt,
  };
}

function unreadCount(db, userId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM pixie_notifications WHERE userId = ? AND isRead = 0`,
    )
    .get(userId);
  return row?.count || 0;
}

function emitUnreadCount(db, userId) {
  const manager = wsManager();
  if (!manager) return;
  manager.sendToUser(userId, {
    type: S2C.PIXIE_NOTIFICATION_UNREAD_COUNT,
    data: { count: unreadCount(db, userId) },
  });
}

function pruneUser(db, userId) {
  db.prepare(
    `DELETE FROM pixie_notifications
     WHERE id IN (
       SELECT id FROM pixie_notifications
       WHERE userId = ?
       ORDER BY createdAt DESC
       LIMIT -1 OFFSET ?
     )`,
  ).run(userId, RETAIN_PER_USER);
}

/**
 * Insert one notification and push it (plus the refreshed unread count) to the
 * recipient's live sockets. A no-op when the recipient is also the actor, when
 * there is no recipient, or when the type is unknown.
 */
function createPixieNotification(db, params) {
  const {
    userId,
    type,
    actor = null,
    videoId = null,
    commentId = null,
    preview = null,
  } = params || {};

  if (!userId || !NOTIFICATION_TYPES.has(type)) return null;
  // Never notify someone about their own action.
  if (actor && String(actor.id) === String(userId)) return null;

  const id = makeId();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO pixie_notifications
       (id, userId, type, actorId, actorUsername, actorAvatar, videoId, commentId, preview, isRead, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  ).run(
    id,
    String(userId),
    type,
    actor?.id ? String(actor.id) : null,
    actor?.username || null,
    actor?.avatar || null,
    videoId || null,
    commentId || null,
    preview ? trimPreview(preview) : null,
    createdAt,
  );

  pruneUser(db, String(userId));

  const manager = wsManager();
  if (manager) {
    const row = db
      .prepare(`SELECT * FROM pixie_notifications WHERE id = ?`)
      .get(id);
    if (row) {
      manager.sendToUser(String(userId), {
        type: S2C.PIXIE_NOTIFICATION_NEW,
        data: mapRow(row),
      });
    }
    emitUnreadCount(db, String(userId));
  }

  return id;
}

function getPixieNotifications(db, userId, options = {}) {
  const rawPage = Number.parseInt(String(options.page ?? "1"), 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const rawLimit = Number.parseInt(String(options.limit ?? LIST_DEFAULT_LIMIT), 10);
  const limit = Math.min(
    Math.max(Number.isFinite(rawLimit) ? rawLimit : LIST_DEFAULT_LIMIT, 1),
    LIST_MAX_LIMIT,
  );

  const total =
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM pixie_notifications WHERE userId = ?`,
      )
      .get(userId)?.count || 0;

  const rows = db
    .prepare(
      `SELECT * FROM pixie_notifications
       WHERE userId = ?
       ORDER BY createdAt DESC
       LIMIT ? OFFSET ?`,
    )
    .all(userId, limit, (page - 1) * limit);

  return {
    notifications: rows.map(mapRow),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    unread: unreadCount(db, userId),
  };
}

function getPixieNotificationUnreadCount(db, userId) {
  return unreadCount(db, userId);
}

function markPixieNotificationRead(db, userId, notificationId) {
  const result = db
    .prepare(
      `UPDATE pixie_notifications SET isRead = 1 WHERE id = ? AND userId = ?`,
    )
    .run(notificationId, userId);
  if (result.changes > 0) emitUnreadCount(db, userId);
  return { updated: result.changes > 0, unread: unreadCount(db, userId) };
}

function markAllPixieNotificationsRead(db, userId) {
  const result = db
    .prepare(
      `UPDATE pixie_notifications SET isRead = 1 WHERE userId = ? AND isRead = 0`,
    )
    .run(userId);
  if (result.changes > 0) emitUnreadCount(db, userId);
  return { updated: result.changes, unread: 0 };
}

module.exports = {
  NOTIFICATION_TYPES,
  createPixieNotification,
  getPixieNotifications,
  getPixieNotificationUnreadCount,
  markPixieNotificationRead,
  markAllPixieNotificationsRead,
};
