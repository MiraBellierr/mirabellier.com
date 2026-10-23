/**
 * Reset the Arena database — wipe player progression, cards, gear, fights,
 * market/trade activity, skill trees, titles and notifications.
 *
 * Rows are DELETEd, not tables DROPped, so the schema stays intact and the
 * backend keeps working without a restart.
 *
 * What is kept by default:
 *   - arena_updates              (editorial patch notes / broadcast)
 *   - arena_compensations        (admin compensation grants)
 *   - arena_compensation_claims
 *   Pass --all to clear those too.
 *
 * Usage:
 *   node scripts/reset-arena.cjs --dry            # show what would be deleted
 *   node scripts/reset-arena.cjs --yes            # LIVE full reset
 *   node scripts/reset-arena.cjs --yes --all      # ...also wipe updates/compensations
 *   node scripts/reset-arena.cjs --user <id> --yes  # reset one player only
 *   node scripts/reset-arena.cjs --yes --vacuum   # ...and reclaim disk space
 *
 * A live run needs --yes. Without it (and without --dry) the script prints the
 * plan and stops.
 */
const path = require("path");
const Database = require("better-sqlite3");

const DB_FILE =
  process.env.DB_FILE || path.join(__dirname, "..", "database.sqlite3");

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const isDry = has("--dry");
const wipeEditorial = has("--all");
const doVacuum = has("--vacuum");
const yes = has("--yes");

const userIndex = argv.indexOf("--user");
const userId =
  userIndex !== -1 && argv[userIndex + 1] && !argv[userIndex + 1].startsWith("--")
    ? argv[userIndex + 1]
    : null;
if (userIndex !== -1 && !userId) {
  console.error("--user needs a user id: --user <id>");
  process.exit(1);
}

// Per-user tables: table -> the columns that hold a user id. When --user is set
// only rows matching that id are removed; otherwise the whole table is cleared.
const USER_ID_COLUMNS = {
  arena_profiles: ["userId"],
  arena_inventory: ["userId"],
  arena_equipment_pieces: ["userId"],
  arena_equipment_loadouts: ["userId"],
  arena_fights: ["userId", "opponentUserId"],
  arena_card_collection: ["userId"],
  arena_card_affinity: ["userId"],
  arena_daily_card_offers: ["userId"],
  arena_daily_card_purchases: ["userId"],
  arena_skill_allocations: ["userId"],
  arena_titles: ["userId"],
  arena_active_fights: ["userId"],
  arena_notifications: ["userId"],
  arena_market_listings: ["sellerUserId", "buyerUserId"],
  arena_trade_listings: ["userId"],
  arena_trade_requests: ["askerId", "responderId"],
  arena_trade_sessions: ["askerId", "responderId"],
};

// No user column — only clearable in a full reset, skipped with --user.
const FULL_ONLY_TABLES = ["arena_mal_card_pool", "arena_hall_of_fame"];

// Editorial / admin — kept unless --all (and never touched with --user).
const EDITORIAL_TABLES = [
  "arena_updates",
  "arena_compensations",
  "arena_compensation_claims",
];

const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = OFF");

const tableExists = (name) =>
  !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);

const columnsOf = (name) =>
  db.prepare(`PRAGMA table_info(${name})`).all().map((c) => c.name);

const countRows = (name, where, params = []) =>
  db.prepare(`SELECT COUNT(*) AS n FROM ${name}${where ? ` WHERE ${where}` : ""}`).get(...params).n;

// ---- build the plan -----------------------------------------------------------

const plan = []; // { table, where, params, before }

for (const [table, idCols] of Object.entries(USER_ID_COLUMNS)) {
  if (!tableExists(table)) continue;
  const present = idCols.filter((c) => columnsOf(table).includes(c));
  let where = null;
  let params = [];
  if (userId) {
    if (present.length === 0) continue; // can't scope this one to a user
    where = present.map((c) => `${c} = ?`).join(" OR ");
    params = present.map(() => userId);
  }
  plan.push({ table, where, params, before: countRows(table, where, params) });
}

if (!userId) {
  for (const table of FULL_ONLY_TABLES) {
    if (!tableExists(table)) continue;
    plan.push({ table, where: null, params: [], before: countRows(table) });
  }
  if (wipeEditorial) {
    for (const table of EDITORIAL_TABLES) {
      if (!tableExists(table)) continue;
      plan.push({ table, where: null, params: [], before: countRows(table) });
    }
  }
}

// ---- report -----------------------------------------------------------------

const mode = isDry ? "DRY RUN (no changes)" : yes ? "LIVE" : "PREVIEW (pass --yes to run)";
console.log(`Database : ${DB_FILE}`);
console.log(`Scope    : ${userId ? `user ${userId}` : "ALL players"}`);
console.log(`Editorial: ${userId ? "n/a" : wipeEditorial ? "WIPE (--all)" : "kept"}`);
console.log(`Mode     : ${mode}`);
console.log("");

const totalRows = plan.reduce((s, p) => s + p.before, 0);
for (const p of plan) {
  const tag = p.before > 0 ? `${p.before}` : "-";
  console.log(`  ${p.table.padEnd(28)} ${tag}`);
}
console.log(`  ${"".padEnd(28)} ----`);
console.log(`  ${"total rows".padEnd(28)} ${totalRows}`);

if (isDry || !yes) {
  if (!isDry) console.log("\nNothing changed. Re-run with --yes to apply.");
  db.close();
  process.exit(0);
}

// ---- apply ----------------------------------------------------------------

let deleted = 0;
const run = db.transaction(() => {
  for (const p of plan) {
    const res = db
      .prepare(`DELETE FROM ${p.table}${p.where ? ` WHERE ${p.where}` : ""}`)
      .run(...p.params);
    deleted += res.changes;
    if (res.changes > 0) console.log(`  cleared ${res.changes} from ${p.table}`);
  }
});
run();

console.log(`\n✓ Deleted ${deleted} rows across ${plan.length} tables.`);

if (doVacuum) {
  console.log("Running VACUUM...");
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.exec("VACUUM");
  console.log("✓ VACUUM done.");
}

db.close();
