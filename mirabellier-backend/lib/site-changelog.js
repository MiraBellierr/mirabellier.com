// Validation + shaping for the public /changelog page. Entries are owner-authored
// rows in the `site_changelog` table: an owner-set entryDate, a title, and a
// freeform body (plain text, newlines significant).

const MAX_TITLE_LENGTH = 140;
const MAX_BODY_LENGTH = 5000;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Drop C0 controls, DEL, and C1 controls (keep tab / newline); a paste from a
// rich editor can otherwise smuggle these into stored copy.
function stripControlChars(text) {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code === 9 || code === 10 || code === 13) {
      out += ch;
      continue;
    }
    if (code < 32 || code === 127 || (code >= 128 && code <= 159)) {
      continue;
    }
    out += ch;
  }
  return out;
}

function cleanLine(value, maxLength) {
  return stripControlChars(String(value == null ? "" : value))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanBody(value, maxLength) {
  return stripControlChars(String(value == null ? "" : value))
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeEntryDate(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return todayIsoDate();
  if (!ISO_DATE_RE.test(raw)) return null;
  // Reject impossible calendar dates (e.g. 2026-02-31).
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    return null;
  }
  return raw;
}

/**
 * Turn a request body into a stored entry field set, or return `{ error }`.
 * `id` / timestamps are set by the caller.
 */
function buildChangelogEntry(body) {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be an object" };
  }

  const title = cleanLine(body.title, MAX_TITLE_LENGTH);
  const text = cleanBody(body.body, MAX_BODY_LENGTH);
  const entryDate = normalizeEntryDate(body.entryDate ?? body.date);

  if (!title) return { error: "A title is required" };
  if (!text) return { error: "A body is required" };
  if (entryDate === null) return { error: "entryDate must be YYYY-MM-DD" };

  return { entry: { entryDate, title, body: text } };
}

function mapChangelogRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    entryDate: row.entryDate,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

function normalizeListLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.trunc(parsed), MAX_LIST_LIMIT);
}

module.exports = {
  MAX_TITLE_LENGTH,
  MAX_BODY_LENGTH,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  stripControlChars,
  buildChangelogEntry,
  mapChangelogRow,
  normalizeListLimit,
  normalizeEntryDate,
};
