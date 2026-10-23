const { nowIso, makeId, clamp, toInt, toPositiveInt, ARENA_UPDATE_MAX_TITLE_LENGTH, ARENA_UPDATE_MAX_BODY_LENGTH } = require("./utils");
const { ArenaHttpError } = require("./utils");


function normalizeArenaUpdateText(value, maxLength) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxLength);
}

// Renders the 0-based updateNumber as the version shown on the Arena home page.
function formatArenaUpdateVersion(updateNumber) {
  const n = Number(updateNumber);
  return `1.0.${Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0}`;
}

function mapArenaUpdateRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    version: formatArenaUpdateVersion(row.updateNumber),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function getArenaUpdates(db, options = {}) {
  const limit = clamp(toPositiveInt(options.limit, 5) || 5, 1, 50);
  return db
    .prepare(
      `SELECT id, title, body, updateNumber, createdAt, updatedAt
       FROM arena_updates
       ORDER BY createdAt DESC, rowid DESC
       LIMIT ?`,
    )
    .all(limit)
    .map(mapArenaUpdateRow);
}

function createArenaUpdate(db, userId, input = {}) {
  const title = normalizeArenaUpdateText(
    input.title,
    ARENA_UPDATE_MAX_TITLE_LENGTH,
  );
  const body = normalizeArenaUpdateText(
    input.body,
    ARENA_UPDATE_MAX_BODY_LENGTH,
  );
  if (!title) {
    throw new ArenaHttpError(
      400,
      "Update title is required.",
      "ARENA_UPDATE_TITLE_REQUIRED",
    );
  }
  if (!body) {
    throw new ArenaHttpError(
      400,
      "Update message is required.",
      "ARENA_UPDATE_BODY_REQUIRED",
    );
  }
  const id = makeId("arena-update");
  const now = nowIso();
  // Next monotonic number — never reused, so versions stay stable across deletes.
  const { m } = db
    .prepare("SELECT MAX(updateNumber) AS m FROM arena_updates")
    .get();
  const updateNumber = Number.isFinite(m) ? m + 1 : 0;
  db.prepare(
    `INSERT INTO arena_updates (
      id, title, body, updateNumber, createdByUserId, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, title, body, updateNumber, userId, now, now);
  return mapArenaUpdateRow(
    db
      .prepare(
        `SELECT id, title, body, updateNumber, createdAt, updatedAt
         FROM arena_updates
         WHERE id = ?`,
      )
      .get(id),
  );
}

function deleteArenaUpdate(db, updateId) {
  const normalizedId = String(updateId || "").trim();
  const result = db
    .prepare("DELETE FROM arena_updates WHERE id = ?")
    .run(normalizedId);
  if (result.changes !== 1) {
    throw new ArenaHttpError(
      404,
      "Arena update not found.",
      "ARENA_UPDATE_NOT_FOUND",
    );
  }
  return { deletedUpdateId: normalizedId };
}

module.exports = {
  normalizeArenaUpdateText,
  mapArenaUpdateRow,
  getArenaUpdates,
  createArenaUpdate,
  deleteArenaUpdate,
};
