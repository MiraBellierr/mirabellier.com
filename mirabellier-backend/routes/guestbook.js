const express = require("express");
const { isOwner } = require("../lib/authz");
const {
  TurnstileError,
  verifyTurnstileToken,
} = require("../lib/turnstile");
const { sanitizeWebsite } = require("../lib/sanitize-website");
const {
  getOnThisDayKey,
  normalizeOnThisDayLimit,
  queryOnThisDayRows,
} = require("../lib/guestbook-on-this-day");
const {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  NOTE_SIZE,
  findOpenPosition,
  positionsOverlap,
  sanitizeCoordinate,
} = require("../lib/guestbook-position");

const MAX_ENTRIES = 100;
const MAX_NAME_LENGTH = 40;
const MAX_MESSAGE_LENGTH = 400;
const ALLOWED_MOODS = new Set([
  "sparkly",
  "cozy",
  "sleepy",
  "sunny",
  "chaotic",
]);

function collapseWhitespace(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function sanitizeName(value) {
  return collapseWhitespace(value).slice(0, MAX_NAME_LENGTH);
}

function sanitizeMessage(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

function sanitizeMood(value) {
  const normalized = collapseWhitespace(value).toLowerCase();
  return ALLOWED_MOODS.has(normalized) ? normalized : "sparkly";
}

function pickWebsite(row, user) {
  if (user && user.website) return user.website;
  return row.website || null;
}

/**
 * Resolve a board position for every row in one pass.
 *
 * A row's stored coordinate is kept when it is usable and does not sit on a
 * note that already took that spot. Anything else — a NULL coordinate, or one
 * of the rows the old `(0, 0)` bug wrote to the same corner — is moved to the
 * first free grid slot. A board saved before this fix therefore fans out on
 * first load instead of rendering one readable note over a pile of hidden
 * ones, without rewriting the database.
 */
function resolveEntryPositions(rows) {
  const taken = [];

  return rows.map((row) => {
    const x = sanitizeCoordinate(row.x, BOARD_WIDTH - NOTE_SIZE);
    const y = sanitizeCoordinate(row.y, BOARD_HEIGHT - NOTE_SIZE);

    const stored = x === null || y === null ? null : { x, y };
    const position =
      stored && !taken.some((placed) => positionsOverlap(placed, stored))
        ? stored
        : findOpenPosition(taken);

    taken.push(position);
    return position;
  });
}

/**
 * Every stored board position, normalized and clamped. Rows with an unusable
 * coordinate are skipped rather than treated as `(0, 0)`, so a legacy NULL does
 * not make the corner look occupied.
 */
function getOccupiedPositions(db) {
  const rows = db
    .prepare(
      "SELECT x, y FROM guestbook_entries WHERE x IS NOT NULL AND y IS NOT NULL",
    )
    .all();

  return rows
    .map((row) => ({
      x: sanitizeCoordinate(row.x, BOARD_WIDTH - NOTE_SIZE),
      y: sanitizeCoordinate(row.y, BOARD_HEIGHT - NOTE_SIZE),
    }))
    .filter((position) => position.x !== null && position.y !== null);
}

function mapEntryRow(row, getUserById, userPublic, position = { x: 0, y: 0 }) {
  const user = row.userId ? userPublic(getUserById(row.userId)) : null;

  return {
    id: row.id,
    author: user?.username || row.author || "Anonymous",
    message: row.message,
    website: pickWebsite(row, user),
    mood: sanitizeMood(row.mood),
    x: position.x,
    y: position.y,
    createdAt: row.createdAt,
    user: user
      ? {
          id: user.id,
          username: user.username,
          avatar: user.avatar || null,
        }
      : null,
  };
}

module.exports = function registerGuestbookRoutes(app, deps) {
  const { db, authFromReq, getUserById, userPublic } = deps;
  const router = express.Router();

  router.get("/", (req, res) => {
    try {
      const rows = db
        .prepare(
          "SELECT id, userId, author, message, website, mood, x, y, createdAt FROM guestbook_entries ORDER BY createdAt DESC LIMIT ?",
        )
        .all(MAX_ENTRIES);

      const positions = resolveEntryPositions(rows);

      res.setHeader("Cache-Control", "no-store");
      res.json(
        rows.map((row, index) =>
          mapEntryRow(row, getUserById, userPublic, positions[index]),
        ),
      );
    } catch {
      res.status(500).json({ error: "Failed to fetch guestbook entries" });
    }
  });

  router.get("/on-this-day", (req, res) => {
    try {
      const { monthDay, year } = getOnThisDayKey();
      const limit = normalizeOnThisDayLimit(req.query?.limit);
      const rows = queryOnThisDayRows(db, { monthDay, year, limit });
      const positions = resolveEntryPositions(rows);

      res.setHeader("Cache-Control", "no-store");
      res.json({
        date: monthDay,
        entries: rows.map((row, index) =>
          mapEntryRow(row, getUserById, userPublic, positions[index]),
        ),
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch guestbook memories" });
    }
  });

  router.post("/", async (req, res) => {
    try {
      await verifyTurnstileToken(req, req.body?.turnstileToken, "guestbook");
      const user = authFromReq(req);
      const author = user ? user.username : sanitizeName(req.body?.name);
      const message = sanitizeMessage(req.body?.message);
      const website = user ? null : sanitizeWebsite(req.body?.website);
      const mood = sanitizeMood(req.body?.mood);

      if (!author) {
        return res.status(400).json({ error: "Name is required" });
      }

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Placement is server-owned. The sign form has no board on screen, so a
      // coordinate from the client is either absent or a placeholder like
      // `0,0` — and `(0, 0)` is a real spot, which is how every new note ended
      // up piled in the corner. A client coordinate is honored only when it is
      // valid and lands somewhere free; otherwise the note takes the first
      // open grid slot.
      const occupied = getOccupiedPositions(db);
      const requestedX = sanitizeCoordinate(req.body?.x, BOARD_WIDTH - NOTE_SIZE);
      const requestedY = sanitizeCoordinate(req.body?.y, BOARD_HEIGHT - NOTE_SIZE);
      const position =
        requestedX !== null &&
        requestedY !== null &&
        !occupied.some((taken) =>
          positionsOverlap(taken, { x: requestedX, y: requestedY }),
        )
          ? { x: requestedX, y: requestedY }
          : findOpenPosition(occupied);

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const createdAt = new Date().toISOString();

      db.prepare(
        "INSERT INTO guestbook_entries (id, userId, author, message, website, mood, x, y, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        id,
        user ? user.id : null,
        author,
        message,
        website,
        mood,
        position.x,
        position.y,
        createdAt,
      );

      const row = db
        .prepare(
          "SELECT id, userId, author, message, website, mood, x, y, createdAt FROM guestbook_entries WHERE id = ?",
        )
        .get(id);

      res.status(201).json(mapEntryRow(row, getUserById, userPublic, position));
    } catch (error) {
      if (error instanceof TurnstileError) {
        return res.status(error.status).json({
          error: error.message,
          code: error.code,
        });
      }
      res.status(500).json({ error: "Failed to sign the guestbook" });
    }
  });

  router.patch("/:id/position", (req, res) => {
    try {
      const x = sanitizeCoordinate(req.body?.x, BOARD_WIDTH - NOTE_SIZE);
      const y = sanitizeCoordinate(req.body?.y, BOARD_HEIGHT - NOTE_SIZE);

      if (x === null || y === null) {
        return res.status(400).json({ error: "Valid x and y are required" });
      }

      const result = db
        .prepare("UPDATE guestbook_entries SET x = ?, y = ? WHERE id = ?")
        .run(x, y, req.params.id);

      if (result.changes === 0) {
        return res.status(404).json({ error: "Guestbook entry not found" });
      }

      const row = db
        .prepare(
          "SELECT id, userId, author, message, website, mood, x, y, createdAt FROM guestbook_entries WHERE id = ?",
        )
        .get(req.params.id);

      res.json(mapEntryRow(row, getUserById, userPublic, { x, y }));
    } catch {
      res.status(500).json({ error: "Failed to move the note" });
    }
  });

  router.delete("/:id", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!isOwner(user)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const result = db
        .prepare("DELETE FROM guestbook_entries WHERE id = ?")
        .run(req.params.id);

      if (result.changes === 0) {
        return res.status(404).json({ error: "Guestbook entry not found" });
      }

      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete guestbook note" });
    }
  });

  app.use("/guestbook", router);
};
