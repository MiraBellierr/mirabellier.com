const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const {
  removeArenaMaterials,
} = require("../scripts/remove-arena-materials.cjs");

test("material migration deletes only materials and is idempotent", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE arena_inventory (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      itemId TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
  const insert = db.prepare(
    `INSERT INTO arena_inventory (
      id, userId, itemId, quantity, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const now = new Date().toISOString();
  insert.run("material-1", "u1", "driftwood_shard", 7, now, now);
  insert.run("material-2", "u1", "azure_ore", 2, now, now);
  insert.run("gear-1", "u1", "rustblade_weapon", 1, now, now);
  insert.run("consumable-1", "u1", "red_tonic", 3, now, now);

  const preview = removeArenaMaterials(db);
  assert.deepEqual(preview, {
    apply: false,
    rows: 0,
    quantity: 0,
    deletedRows: 0,
  });
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM arena_inventory").get().count,
    4,
  );

  const applied = removeArenaMaterials(db, { apply: true });
  assert.equal(applied.deletedRows, 0);
  assert.deepEqual(
    db
      .prepare("SELECT itemId, quantity FROM arena_inventory ORDER BY itemId")
      .all(),
    [
      { itemId: "azure_ore", quantity: 2 },
      { itemId: "driftwood_shard", quantity: 7 },
      { itemId: "red_tonic", quantity: 3 },
      { itemId: "rustblade_weapon", quantity: 1 },
    ],
  );

  const repeated = removeArenaMaterials(db, { apply: true });
  assert.equal(repeated.rows, 0);
  assert.equal(repeated.quantity, 0);
  assert.equal(repeated.deletedRows, 0);
});
