#!/usr/bin/env node
/**
 * One-time rename of the Arena "element" trait from the six classic elements to
 * the six Combat Styles (improve.md §9 follow-up). Does a plain string swap on
 * the raw JSON text of the character data files so formatting is preserved and a
 * 41 MB file does not need to be parsed and re-serialised.
 *
 * Idempotent: after the first run the old strings are gone, so re-running is a
 * no-op.
 *
 * Usage:  node scripts/migrate-elements-to-styles.cjs [file ...]
 * Default files: data/mal-characters.json, data/mal-characters-backup.json
 */
const fs = require("fs");
const path = require("path");

const MAP = {
  Fire: "Might",
  Water: "Swift",
  Earth: "Ward",
  Wind: "Ruse",
  Light: "Surge",
  Dark: "Skill",
};

const files =
  process.argv.length > 2
    ? process.argv.slice(2)
    : [
        path.resolve(__dirname, "..", "data", "mal-characters.json"),
        path.resolve(__dirname, "..", "data", "mal-characters-backup.json"),
      ];

let hadError = false;
for (const file of files) {
  if (!fs.existsSync(file)) {
    console.warn(`skip (not found): ${file}`);
    continue;
  }
  const before = fs.readFileSync(file, "utf8");
  let after = before;
  const counts = {};
  for (const [oldValue, newValue] of Object.entries(MAP)) {
    // Match `"element": "Fire"` and `"element":"Fire"`.
    const re = new RegExp(`("element"\\s*:\\s*)"${oldValue}"`, "g");
    let n = 0;
    after = after.replace(re, (_m, prefix) => {
      n += 1;
      return `${prefix}"${newValue}"`;
    });
    if (n) counts[`${oldValue}->${newValue}`] = n;
  }

  if (after === before) {
    console.log(`no changes: ${path.basename(file)} (already migrated?)`);
    continue;
  }

  // Sanity check: the result must still parse.
  try {
    JSON.parse(after);
  } catch (err) {
    hadError = true;
    console.error(`ABORT ${path.basename(file)}: result is not valid JSON — ${err.message}`);
    continue;
  }

  fs.writeFileSync(file, after);
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  console.log(`migrated ${path.basename(file)}: ${total} elements`, counts);
}

process.exit(hadError ? 1 : 0);
