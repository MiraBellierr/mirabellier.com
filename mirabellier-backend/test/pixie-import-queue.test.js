const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const { initializeSchema } = require("../lib/db");
const { createPixieImportQueue } = require("../lib/pixie-import-queue");

function createTestDb() {
  const db = new Database(":memory:");
  initializeSchema(db);
  return db;
}

const silent = { log() {}, warn() {}, error() {} };

test("enqueue dedupes an importKey that already finished successfully", async () => {
  const db = createTestDb();
  let runs = 0;
  const queue = createPixieImportQueue({
    db,
    runImport: async () => {
      runs += 1;
      return { videoId: `v${runs}` };
    },
    logger: silent,
  });

  const first = queue.enqueue({ url: "https://www.tiktok.com/@a/video/1", importKey: "tiktok-feed:1" });
  assert.equal(first.status, "queued");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(queue.get(first.id).status, "done");
  assert.equal(runs, 1);

  const second = queue.enqueue({ url: "https://www.tiktok.com/@a/video/1", importKey: "tiktok-feed:1" });

  assert.equal(runs, 1, "a done importKey must not run the download again");
  assert.equal(second.id, first.id, "the finished row is handed back");
  assert.equal(second.status, "done");

  const rows = queue.list(10);
  assert.equal(rows.length, 1, "no duplicate queue row was inserted");
});

test("enqueue dedupes an importKey that is still queued", () => {
  const db = createTestDb();
  const queue = createPixieImportQueue({
    db,
    runImport: async () => new Promise(() => {}),
    logger: silent,
  });

  const a = queue.enqueue({ url: "https://www.tiktok.com/@a/video/1", importKey: "tiktok-feed:2" });
  const b = queue.enqueue({ url: "https://www.tiktok.com/@a/video/1", importKey: "tiktok-feed:2" });

  assert.equal(a.id, b.id);
  assert.equal(queue.list(10).length, 1);
});

test("a failed importKey can be queued again (and retried)", async () => {
  const db = createTestDb();
  let attempt = 0;
  const queue = createPixieImportQueue({
    db,
    runImport: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("boom");
      return { videoId: "v2" };
    },
    logger: silent,
  });

  const first = queue.enqueue({ url: "https://www.tiktok.com/@a/video/1", importKey: "tiktok-feed:3" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(queue.get(first.id).status, "error");

  const retried = queue.retry(first.id);
  assert.equal(retried.status, "queued");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(queue.get(first.id).status, "done");

  // A fresh enqueue for the same key now also short-circuits on the done row.
  const again = queue.enqueue({ url: "https://www.tiktok.com/@a/video/1", importKey: "tiktok-feed:3" });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(again.id, first.id);
  assert.equal(attempt, 2);
});
