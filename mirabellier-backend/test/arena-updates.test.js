const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const {
  ArenaHttpError,
} = require("../lib/arena/utils");
const {
  createArenaUpdate,
  deleteArenaUpdate,
  getArenaUpdates,
} = require("../lib/arena/updates");

function createDb() {
  const db = new Database(":memory:");
  db.prepare(
    `CREATE TABLE arena_updates (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      updateNumber INTEGER,
      createdByUserId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`,
  ).run();
  return db;
}

test("arena updates are validated, listed newest first, and deletable", () => {
  const db = createDb();
  assert.throws(
    () => createArenaUpdate(db, "u1", { title: "", body: "Message" }),
    (error) =>
      error instanceof ArenaHttpError &&
      error.code === "ARENA_UPDATE_TITLE_REQUIRED",
  );
  const first = createArenaUpdate(db, "u1", {
    title: "First update",
    body: "Arena is open.",
  });
  const second = createArenaUpdate(db, "u1", {
    title: "Second update",
    body: "The market is live.",
  });
  assert.equal(first.version, "1.0.0");
  assert.equal(second.version, "1.0.1");
  const updates = getArenaUpdates(db, { limit: 5 });
  assert.equal(updates[0].id, second.id);
  assert.equal(updates[0].version, "1.0.1");
  assert.equal(updates[1].id, first.id);
  assert.equal(updates[1].version, "1.0.0");
  assert.deepEqual(deleteArenaUpdate(db, first.id), {
    deletedUpdateId: first.id,
  });
  assert.equal(getArenaUpdates(db).length, 1);
});

test("arena update versions are monotonic and survive deletes", () => {
  const db = createDb();
  const a = createArenaUpdate(db, "u1", { title: "A", body: "x" });
  const b = createArenaUpdate(db, "u1", { title: "B", body: "x" });
  createArenaUpdate(db, "u1", { title: "C", body: "x" });
  assert.equal(a.version, "1.0.0");
  assert.equal(b.version, "1.0.1");

  deleteArenaUpdate(db, b.id);
  const d = createArenaUpdate(db, "u1", { title: "D", body: "x" });
  assert.equal(d.version, "1.0.3"); // C was 1.0.2; deleting B does not free 1.0.1
});
