const { nowIso, makeId, toInt, toPositiveInt, clamp } = require("./utils");
const { S2C } = require("../websocket-events");
const { ArenaHttpError } = require("./utils");

function _wsEmit() { return require("../websocket-server").getWebSocketManager(); }
function _notifyUser(userId, type, data) { const w = _wsEmit(); if (w) w.sendToUser(userId, { type, data }); }
function _notifyUnreadCount(userId) {
  const w = _wsEmit();
  if (w) {
    const db = require("../db").db;
    const count = db.prepare(`SELECT COUNT(*) AS count FROM arena_notifications WHERE userId = ? AND isRead = 0`).get(userId)?.count;
    w.sendToUser(userId, { type: S2C.ARENA_NOTIFICATION_UNREAD_COUNT, data: { count: count || 0 } });
  }
}


function createArenaNotification(db, userId, type, title, body = null, link = null, metadata = null) {
  const now = nowIso();
  const id = makeId("notif");
  db.prepare(
    `INSERT INTO arena_notifications (id, userId, type, title, body, link, metadata, isRead, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  ).run(id, userId, type, title, body || null, link || null, metadata || null, now);
  _notifyUser(userId, S2C.ARENA_NOTIFICATION_NEW, { id, type, title, body, link, metadata, createdAt: now });
  _notifyUnreadCount(userId);
}

function getArenaNotifications(db, userId, options = {}) {
  const page = Math.max(toPositiveInt(options.page, 1), 1);
  const limit = clamp(toPositiveInt(options.limit, 20) || 20, 1, 50);

  const total = toPositiveInt(
    db
      .prepare(`SELECT COUNT(*) AS count FROM arena_notifications WHERE userId = ?`)
      .get(userId)?.count,
    0,
  );
  const rows = db
    .prepare(
      `SELECT * FROM arena_notifications
       WHERE userId = ?
       ORDER BY isRead ASC, createdAt DESC
       LIMIT ? OFFSET ?`,
    )
    .all(userId, limit, (page - 1) * limit);

  // For trade_request notifications, include the current request status
  const tradeRequestIds = [];
  for (const row of rows) {
    if (row.type === "trade_request" && row.metadata) {
      try {
        const meta = JSON.parse(row.metadata);
        if (meta.requestId) tradeRequestIds.push(meta.requestId);
      } catch { /* ignore */ }
    }
  }
  const requestStatuses = new Map();
  if (tradeRequestIds.length > 0) {
    const placeholders = tradeRequestIds.map(() => "?").join(",");
    const statusRows = db
      .prepare(
        `SELECT id, status FROM arena_trade_requests WHERE id IN (${placeholders})`,
      )
      .all(...tradeRequestIds);
    for (const sr of statusRows) {
      requestStatuses.set(sr.id, sr.status);
    }
  }

  return {
    notifications: rows.map((row) => {
      let requestStatus = null;
      if (row.type === "trade_request" && row.metadata) {
        try {
          const meta = JSON.parse(row.metadata);
          if (meta.requestId) {
            requestStatus = requestStatuses.get(meta.requestId) || null;
          }
        } catch { /* ignore */ }
      }
      return {
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body || null,
        link: row.link || null,
        metadata: row.metadata || null,
        isRead: row.isRead === 1,
        createdAt: row.createdAt,
        requestStatus,
      };
    }),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

function getArenaNotificationUnreadCount(db, userId) {
  return toPositiveInt(
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM arena_notifications
         WHERE userId = ? AND isRead = 0`,
      )
      .get(userId)?.count,
    0,
  );
}

function markArenaNotificationRead(db, userId, notificationId) {
  const result = db
    .prepare(
      `UPDATE arena_notifications SET isRead = 1
       WHERE id = ? AND userId = ?`,
    )
    .run(notificationId, userId);
  if (result.changes > 0) _notifyUnreadCount(userId);
  return { updated: result.changes > 0 };
}

function markAllArenaNotificationsRead(db, userId) {
  const result = db
    .prepare(
      `UPDATE arena_notifications SET isRead = 1
       WHERE userId = ? AND isRead = 0`,
    )
    .run(userId);
  if (result.changes > 0) _notifyUnreadCount(userId);
  return { updated: result.changes };
}

module.exports = {
  createArenaNotification,
  getArenaNotifications,
  getArenaNotificationUnreadCount,
  markArenaNotificationRead,
  markAllArenaNotificationsRead,
};
