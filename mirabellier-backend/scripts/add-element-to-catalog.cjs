#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// Combat Styles (formerly elements). Legacy one-time seeder — kept in sync with
// `lib/arena-constants.js` so a re-run produces current-format values.
const ELEMENTS = ["Might", "Swift", "Skill", "Ruse", "Surge", "Ward"];

const DEFAULT_CATALOG_FILE = path.resolve(
  __dirname,
  "..",
  "data",
  "mal-characters.json",
);

function hashElement(malId) {
  let h = malId * 2654435761; // Knuth multiplicative hash
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = (h >> 16) ^ h;
  return ELEMENTS[Math.abs(h) % ELEMENTS.length];
}

function main() {
  const catalogFile = process.argv[2]
    ? path.resolve(process.argv[2])
    : DEFAULT_CATALOG_FILE;

  if (!fs.existsSync(catalogFile)) {
    console.error(`Catalog not found: ${catalogFile}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(catalogFile, "utf8");
  const catalog = JSON.parse(raw);

  if (!catalog || !Array.isArray(catalog.characters)) {
    console.error("Catalog has no characters array.");
    process.exit(1);
  }

  let assigned = 0;
  const counts = Object.fromEntries(ELEMENTS.map((e) => [e, 0]));

  for (const character of catalog.characters) {
    const malId = Number(character?.id);
    if (!Number.isFinite(malId) || malId <= 0) continue;

    const element = hashElement(malId);
    character.element = element;
    counts[element] += 1;
    assigned += 1;
  }

  catalog.generatedAt = new Date().toISOString();

  const tmpPath = `${catalogFile}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, catalogFile);

  console.log(`Assigned elements to ${assigned} characters in ${catalogFile}`);
  for (const [element, count] of Object.entries(counts)) {
    console.log(`  ${element}: ${count}`);
  }
}

main();
