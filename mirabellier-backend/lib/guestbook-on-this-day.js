"use strict";

// "On this day" resurfaces guestbook notes that were pinned on today's calendar
// date (month + day, UTC) in a strictly earlier year, so an ageing board keeps a
// bit of living memory instead of only ever showing the newest 100 notes.

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 24;

const SELECT_COLUMNS =
  "id, userId, author, message, website, mood, x, y, createdAt";

function pad2(value) {
  return String(value).padStart(2, "0");
}

// createdAt is always an ISO string we generate ourselves
// (`new Date().toISOString()`), so slicing its fixed offsets is safe and dodges
// SQLite's version-dependent handling of the trailing "Z" in strftime().
//   "2024-09-10T12:34:56.789Z"
//    1..4 year   6..10 month-day   (1-indexed, to match SQLite substr)
function getOnThisDayKey(now = new Date()) {
  const date =
    now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  return {
    monthDay: `${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`,
    year: String(date.getUTCFullYear()),
  };
}

function normalizeOnThisDayLimit(value) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

// Notes pinned on the same month+day in a strictly earlier year, newest first.
function queryOnThisDayRows(db, { monthDay, year, limit }) {
  return db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM guestbook_entries
       WHERE substr(createdAt, 6, 5) = ?
         AND substr(createdAt, 1, 4) < ?
       ORDER BY createdAt DESC
       LIMIT ?`,
    )
    .all(monthDay, year, limit);
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  getOnThisDayKey,
  normalizeOnThisDayLimit,
  queryOnThisDayRows,
};
