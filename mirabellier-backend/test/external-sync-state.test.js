const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const { initializeSchema } = require("../lib/db");
const {
  getExternalSyncTime,
  recordExternalSync,
} = require("../lib/external-sync-state");
const { collectSitemapEntries, resolveHsrLastmod } = require("../lib/sitemap");

function createTestDb() {
  const db = new Database(":memory:");
  initializeSchema(db);
  return db;
}

test("recordExternalSync upserts and getExternalSyncTime reads it back", () => {
  const db = createTestDb();

  assert.equal(getExternalSyncTime(db, "hsr"), null);

  assert.equal(
    recordExternalSync(db, "hsr", "2026-09-23T04:00:00.000Z"),
    true,
  );
  assert.equal(getExternalSyncTime(db, "hsr"), "2026-09-23T04:00:00.000Z");

  recordExternalSync(db, "hsr", "2026-09-24T04:00:00.000Z");
  assert.equal(getExternalSyncTime(db, "hsr"), "2026-09-24T04:00:00.000Z");

  // A second sync key is tracked independently.
  recordExternalSync(db, "other", "2026-01-01T00:00:00.000Z");
  assert.equal(getExternalSyncTime(db, "hsr"), "2026-09-24T04:00:00.000Z");
});

test("sync state helpers never throw on a missing table or handle", () => {
  const db = new Database(":memory:"); // no schema
  assert.equal(recordExternalSync(db, "hsr"), false);
  assert.equal(getExternalSyncTime(db, "hsr"), null);
  assert.equal(recordExternalSync(null, "hsr"), false);
  assert.equal(getExternalSyncTime(null, "hsr"), null);
  assert.equal(recordExternalSync(db, ""), false);
});

test("resolveHsrLastmod returns a date only once a sync has been recorded", () => {
  const db = createTestDb();
  assert.equal(resolveHsrLastmod(db), null);

  recordExternalSync(db, "hsr", "2026-09-23T04:12:00.000Z");
  assert.equal(resolveHsrLastmod(db), "2026-09-23");
});

test("/hsr is listed in the sitemap and dated by the recorded sync", () => {
  const db = createTestDb();
  recordExternalSync(db, "hsr", "2026-09-23T04:12:00.000Z");

  const entries = collectSitemapEntries(db);
  const hsr = entries.find((entry) => entry.url === "https://mirabellier.com/hsr");
  assert.ok(hsr, "expected /hsr in the sitemap");
  assert.equal(hsr.lastmod, "2026-09-23");
  assert.equal(hsr.changefreq, "daily");
});

test("/hsr has no lastmod before the first recorded sync", () => {
  const db = createTestDb();

  const entries = collectSitemapEntries(db);
  const hsr = entries.find((entry) => entry.url === "https://mirabellier.com/hsr");
  assert.ok(hsr, "expected /hsr in the sitemap");
  assert.equal(hsr.lastmod, undefined);
});
