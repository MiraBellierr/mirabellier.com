#!/usr/bin/env node

const path = require("path");
const Database = require("better-sqlite3");
const fs = require("fs");

// Combat Styles (formerly elements). Legacy one-time backfill — kept in sync with
// `lib/arena-constants.js` so a re-run produces current-format values.
const ELEMENTS = ["Might", "Swift", "Skill", "Ruse", "Surge", "Ward"];

const DEFAULT_DB_FILE = path.resolve(__dirname, "..", "database.sqlite3");
const DEFAULT_CATALOG_FILE = path.resolve(
  __dirname,
  "..",
  "data",
  "mal-characters.json",
);

function hashElement(malId) {
  let h = malId * 2654435761;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = (h >> 16) ^ h;
  return ELEMENTS[Math.abs(h) % ELEMENTS.length];
}

function loadCatalog(catalogFile) {
  if (!fs.existsSync(catalogFile)) {
    console.error(`Catalog not found: ${catalogFile}. Run add-element-to-catalog first.`);
    process.exit(1);
  }
  const catalog = JSON.parse(fs.readFileSync(catalogFile, "utf8"));
  const map = new Map();
  for (const character of catalog.characters) {
    const id = Number(character?.id);
    if (Number.isFinite(id) && id > 0) {
      map.set(id, character.element || hashElement(id));
    }
  }
  return map;
}

function needsElement(cardJson) {
  if (!cardJson) return false;
  try {
    const card = JSON.parse(cardJson);
    return Number.isFinite(Number(card.malId)) && !card.element;
  } catch {
    return false;
  }
}

function addElementToCard(cardJson, elementMap) {
  try {
    const card = JSON.parse(cardJson);
    const malId = Number(card.malId);
    if (!Number.isFinite(malId) || card.element) return null;
    const element = elementMap.get(malId) || hashElement(malId);
    card.element = element;
    return JSON.stringify(card);
  } catch {
    return null;
  }
}

function main() {
  const dbFile = process.argv[2]
    ? path.resolve(process.argv[2])
    : DEFAULT_DB_FILE;

  const catalogFile = process.argv[3]
    ? path.resolve(process.argv[3])
    : DEFAULT_CATALOG_FILE;

  if (!fs.existsSync(dbFile)) {
    console.error(`Database not found: ${dbFile}`);
    process.exit(1);
  }

  console.log("Loading element catalog...");
  const elementMap = loadCatalog(catalogFile);

  const db = new Database(dbFile);
  db.pragma("journal_mode = WAL");

  let updated = 0;
  let skipped = 0;

  // 1. arena_card_collection
  console.log("Updating arena_card_collection...");
  const cards = db.prepare("SELECT id, cardJson FROM arena_card_collection").all();
  const updateCard = db.prepare("UPDATE arena_card_collection SET cardJson = ?, updatedAt = datetime('now') WHERE id = ?");
  for (const row of cards) {
    if (!needsElement(row.cardJson)) {
      skipped += 1;
      continue;
    }
    const newJson = addElementToCard(row.cardJson, elementMap);
    if (newJson) {
      updateCard.run(newJson, row.id);
      updated += 1;
    } else {
      skipped += 1;
    }
  }
  console.log(`  ${updated} updated, ${skipped} skipped`);

  // 2. arena_profiles (selectedCardJson)
  console.log("Updating arena_profiles (selectedCardJson)...");
  let profileUpdated = 0;
  let profileSkipped = 0;
  const profiles = db.prepare("SELECT userId, selectedCardJson FROM arena_profiles WHERE selectedCardJson IS NOT NULL").all();
  const updateProfile = db.prepare("UPDATE arena_profiles SET selectedCardJson = ?, updatedAt = datetime('now') WHERE userId = ?");
  for (const row of profiles) {
    if (!needsElement(row.selectedCardJson)) {
      profileSkipped += 1;
      continue;
    }
    const newJson = addElementToCard(row.selectedCardJson, elementMap);
    if (newJson) {
      updateProfile.run(newJson, row.userId);
      profileUpdated += 1;
    } else {
      profileSkipped += 1;
    }
  }
  console.log(`  ${profileUpdated} updated, ${profileSkipped} skipped`);

  // 3. arena_daily_card_offers
  console.log("Updating arena_daily_card_offers...");
  let offersUpdated = 0;
  let offersSkipped = 0;
  const offers = db.prepare("SELECT offerId, cardJson FROM arena_daily_card_offers").all();
  const updateOffer = db.prepare("UPDATE arena_daily_card_offers SET cardJson = ?, updatedAt = datetime('now') WHERE offerId = ?");
  for (const row of offers) {
    if (!needsElement(row.cardJson)) {
      offersSkipped += 1;
      continue;
    }
    const newJson = addElementToCard(row.cardJson, elementMap);
    if (newJson) {
      updateOffer.run(newJson, row.offerId);
      offersUpdated += 1;
    } else {
      offersSkipped += 1;
    }
  }
  console.log(`  ${offersUpdated} updated, ${offersSkipped} skipped`);

  // 4. arena_market_listings
  console.log("Updating arena_market_listings...");
  let marketUpdated = 0;
  let marketSkipped = 0;
  const listings = db.prepare("SELECT id, cardJson FROM arena_market_listings").all();
  const updateListing = db.prepare("UPDATE arena_market_listings SET cardJson = ?, updatedAt = datetime('now') WHERE id = ?");
  for (const row of listings) {
    if (!needsElement(row.cardJson)) {
      marketSkipped += 1;
      continue;
    }
    const newJson = addElementToCard(row.cardJson, elementMap);
    if (newJson) {
      updateListing.run(newJson, row.id);
      marketUpdated += 1;
    } else {
      marketSkipped += 1;
    }
  }
  console.log(`  ${marketUpdated} updated, ${marketSkipped} skipped`);

  db.close();

  const totalUpdated = updated + profileUpdated + offersUpdated + marketUpdated;
  const totalSkipped = skipped + profileSkipped + offersSkipped + marketSkipped;
  console.log(`\nDone. ${totalUpdated} cards updated, ${totalSkipped} already had elements or skipped.`);
}

main();
