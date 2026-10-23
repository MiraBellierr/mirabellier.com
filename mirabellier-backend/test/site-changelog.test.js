const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildChangelogEntry,
  mapChangelogRow,
  normalizeListLimit,
  normalizeEntryDate,
  stripControlChars,
  MAX_TITLE_LENGTH,
  MAX_BODY_LENGTH,
  MAX_LIST_LIMIT,
  DEFAULT_LIST_LIMIT,
} = require("../lib/site-changelog");

test("buildChangelogEntry normalises title, body, and date", () => {
  const { entry, error } = buildChangelogEntry({
    title: "  New   changelog  page  ",
    body: "line one   \r\n\r\n\r\n\r\nline two\t\n",
    entryDate: "2026-09-10",
  });

  assert.equal(error, undefined);
  assert.equal(entry.title, "New changelog page");
  assert.equal(entry.body, "line one\n\nline two"); // 4 blank lines -> 1, trailing ws gone
  assert.equal(entry.entryDate, "2026-09-10");
});

test("buildChangelogEntry defaults the date and rejects bad input", () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(
    buildChangelogEntry({ title: "t", body: "b" }).entry.entryDate,
    today,
  );

  assert.equal(buildChangelogEntry(null).error, "Request body must be an object");
  assert.equal(buildChangelogEntry({ title: "", body: "b" }).error, "A title is required");
  assert.equal(buildChangelogEntry({ title: "t", body: "   " }).error, "A body is required");
  assert.equal(
    buildChangelogEntry({ title: "t", body: "b", entryDate: "2026-13-01" }).error,
    "entryDate must be YYYY-MM-DD",
  );
  assert.equal(
    buildChangelogEntry({ title: "t", body: "b", entryDate: "2026-02-30" }).error,
    "entryDate must be YYYY-MM-DD",
  );
});

test("buildChangelogEntry caps title and body length", () => {
  const { entry } = buildChangelogEntry({
    title: "x".repeat(MAX_TITLE_LENGTH + 50),
    body: "y".repeat(MAX_BODY_LENGTH + 500),
  });
  assert.equal(entry.title.length, MAX_TITLE_LENGTH);
  assert.equal(entry.body.length, MAX_BODY_LENGTH);
});

test("stripControlChars keeps tab/newline, drops C0/DEL/C1", () => {
  const dirty = `a${String.fromCharCode(0)}b${String.fromCharCode(7)}\tc\nd${String.fromCharCode(127)}${String.fromCharCode(0x85)}`;
  assert.equal(stripControlChars(dirty), "ab\tc\nd");
});

test("normalizeListLimit clamps to sane bounds", () => {
  assert.equal(normalizeListLimit(undefined), DEFAULT_LIST_LIMIT);
  assert.equal(normalizeListLimit("0"), DEFAULT_LIST_LIMIT);
  assert.equal(normalizeListLimit("-5"), DEFAULT_LIST_LIMIT);
  assert.equal(normalizeListLimit("7"), 7);
  assert.equal(normalizeListLimit("9999"), MAX_LIST_LIMIT);
});

test("normalizeEntryDate accepts valid ISO dates and rejects the rest", () => {
  assert.equal(normalizeEntryDate("2026-09-10"), "2026-09-10");
  assert.equal(normalizeEntryDate(""), new Date().toISOString().slice(0, 10));
  assert.equal(normalizeEntryDate("10/09/2026"), null);
  assert.equal(normalizeEntryDate("2026-2-9"), null);
});

test("mapChangelogRow shapes a row and tolerates nulls", () => {
  assert.equal(mapChangelogRow(null), null);
  assert.deepEqual(
    mapChangelogRow({
      id: "cl-1",
      entryDate: "2026-09-10",
      title: "t",
      body: "b",
      createdAt: "2026-09-10T00:00:00.000Z",
      updatedAt: "2026-09-10T00:00:00.000Z",
    }),
    {
      id: "cl-1",
      entryDate: "2026-09-10",
      title: "t",
      body: "b",
      createdAt: "2026-09-10T00:00:00.000Z",
      updatedAt: "2026-09-10T00:00:00.000Z",
    },
  );
});
