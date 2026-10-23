#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const BACKEND_ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(BACKEND_ROOT, ".env") });

const {
  getArenaCharacterCatalog,
  rarityFromCharacterRank,
} = require("../lib/arena-characters");

const CARD_JSON_TARGETS = [
  {
    name: "collected cards",
    table: "arena_card_collection",
    idColumn: "id",
    jsonColumn: "cardJson",
  },
  {
    name: "selected cards",
    table: "arena_profiles",
    idColumn: "userId",
    jsonColumn: "selectedCardJson",
  },
  {
    name: "daily card offers",
    table: "arena_daily_card_offers",
    idColumn: "offerId",
    jsonColumn: "cardJson",
  },
];

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function parseArgs(argv) {
  const options = {
    apply: false,
    dbFile: process.env.DB_FILE || path.join(BACKEND_ROOT, "database.sqlite3"),
    backupFile: "",
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.apply = false;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--db" || arg === "--backup") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a file path.`);
      }
      if (arg === "--db") options.dbFile = value;
      if (arg === "--backup") options.backupFile = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--db=")) {
      options.dbFile = arg.slice("--db=".length);
      continue;
    }
    if (arg.startsWith("--backup=")) {
      options.backupFile = arg.slice("--backup=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  options.dbFile = path.resolve(process.cwd(), options.dbFile);
  options.backupFile = options.backupFile
    ? path.resolve(process.cwd(), options.backupFile)
    : `${options.dbFile}.card-rarity-backup-${timestampForFile()}`;

  return options;
}

function printHelp() {
  console.log(`Update stored Arena card rarities using mal-characters.json rank.

Usage:
  npm run migrate:card-rarities
  npm run migrate:card-rarities -- --apply

Options:
  --dry-run          Preview changes without writing (default)
  --apply            Back up the database, then apply changes transactionally
  --db <path>        Override the SQLite database path
  --backup <path>    Override the generated backup path
  --help, -h         Show this help

Current rule:
  Top 1%             UR
  Next 4%            SSR
  Next 10%           SR
  Next 25%           R
  Remaining 60%      C
  Missing catalog ID Left unchanged`);
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function tableExists(db, table) {
  return Boolean(
    db
      .prepare(
        `SELECT 1
         FROM sqlite_master
         WHERE type = 'table' AND name = ?
         LIMIT 1`,
      )
      .get(table),
  );
}

function emptyTargetStats(target) {
  return {
    name: target.name,
    table: target.table,
    scanned: 0,
    changed: 0,
    unchanged: 0,
    skippedMissing: 0,
    invalidJson: 0,
  };
}

function collectTargetChanges(db, target) {
  const stats = emptyTargetStats(target);
  const catalog = getArenaCharacterCatalog();
  if (!tableExists(db, target.table)) {
    return { stats: { ...stats, missingTable: true }, changes: [] };
  }

  const table = quoteIdentifier(target.table);
  const idColumn = quoteIdentifier(target.idColumn);
  const jsonColumn = quoteIdentifier(target.jsonColumn);
  const rows = db
    .prepare(
      `SELECT ${idColumn} AS rowId, ${jsonColumn} AS cardJson
       FROM ${table}
       WHERE ${jsonColumn} IS NOT NULL AND TRIM(${jsonColumn}) <> ''`,
    )
    .all();
  const changes = [];

  for (const row of rows) {
    stats.scanned += 1;
    let card;
    try {
      card = JSON.parse(row.cardJson);
    } catch {
      stats.invalidJson += 1;
      continue;
    }

    if (!card || typeof card !== "object" || Array.isArray(card)) {
      stats.invalidJson += 1;
      continue;
    }

    const catalogCharacter = catalog.byMalId.get(Number(card.malId));
    if (!catalogCharacter) {
      stats.skippedMissing += 1;
      continue;
    }

    const nextRarity = rarityFromCharacterRank(
      catalogCharacter.popularity,
      catalog.characters.length,
    );
    const nextCard = {
      ...card,
      popularity: catalogCharacter.popularity,
      favorites: catalogCharacter.favorites,
      rarity: nextRarity,
    };
    if (
      card.rarity === nextRarity &&
      Number(card.popularity) === catalogCharacter.popularity &&
      Number(card.favorites) === catalogCharacter.favorites
    ) {
      stats.unchanged += 1;
      continue;
    }

    changes.push({
      rowId: row.rowId,
      cardJson: JSON.stringify(nextCard),
      from: card.rarity ?? null,
      to: nextRarity,
    });
    stats.changed += 1;
  }

  return { stats, changes };
}

function migrateArenaCardRarities(db, { apply = false } = {}) {
  const results = CARD_JSON_TARGETS.map((target) => ({
    target,
    ...collectTargetChanges(db, target),
  }));

  if (apply) {
    const applyChanges = db.transaction(() => {
      for (const result of results) {
        if (result.stats.missingTable || result.changes.length === 0) continue;
        const table = quoteIdentifier(result.target.table);
        const idColumn = quoteIdentifier(result.target.idColumn);
        const jsonColumn = quoteIdentifier(result.target.jsonColumn);
        const update = db.prepare(
          `UPDATE ${table}
           SET ${jsonColumn} = ?
           WHERE ${idColumn} = ?`,
        );
        for (const change of result.changes) {
          update.run(change.cardJson, change.rowId);
        }
      }
    });
    applyChanges();
  }

  return {
    apply,
    targets: results.map(({ stats }) => stats),
    totalScanned: results.reduce((sum, result) => sum + result.stats.scanned, 0),
    totalChanged: results.reduce((sum, result) => sum + result.stats.changed, 0),
    totalInvalidJson: results.reduce(
      (sum, result) => sum + result.stats.invalidJson,
      0,
    ),
    totalSkippedMissing: results.reduce(
      (sum, result) => sum + result.stats.skippedMissing,
      0,
    ),
  };
}

function printSummary(summary) {
  console.log(summary.apply ? "Migration applied." : "Dry run only; no rows were changed.");
  console.log("");
  for (const target of summary.targets) {
    if (target.missingTable) {
      console.log(`- ${target.name}: table missing, skipped`);
      continue;
    }
    console.log(
      `- ${target.name}: ${target.scanned} scanned, ${target.changed} to update, ` +
        `${target.unchanged} already current, ${target.skippedMissing} missing catalog IDs, ` +
        `${target.invalidJson} invalid JSON`,
    );
  }
  console.log("");
  console.log(
    `Total: ${summary.totalScanned} scanned, ${summary.totalChanged} ` +
      `${summary.apply ? "updated" : "would update"}.`,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!fs.existsSync(options.dbFile)) {
    throw new Error(`Database not found: ${options.dbFile}`);
  }

  const db = new Database(options.dbFile);
  try {
    if (options.apply) {
      fs.mkdirSync(path.dirname(options.backupFile), { recursive: true });
      await db.backup(options.backupFile);
      console.log(`Backup created: ${options.backupFile}`);
    }

    const summary = migrateArenaCardRarities(db, { apply: options.apply });
    printSummary(summary);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Card rarity migration failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  CARD_JSON_TARGETS,
  collectTargetChanges,
  migrateArenaCardRarities,
  parseArgs,
};
