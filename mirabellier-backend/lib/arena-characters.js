const fs = require("fs");
const path = require("path");

const { RARITY_CONFIG, RARITY_ORDER, ELEMENTS } = require("./arena-constants");

const DEFAULT_CATALOG_FILE = path.resolve(
  __dirname,
  "..",
  "data",
  "mal-characters.json",
);
const CATALOG_FILE = process.env.MAL_CHARACTERS_FILE
  ? path.resolve(__dirname, "..", process.env.MAL_CHARACTERS_FILE)
  : DEFAULT_CATALOG_FILE;
const RARITY_WEIGHT_SUM = RARITY_ORDER.reduce(
  (sum, rarity) => sum + Number(RARITY_CONFIG[rarity]?.weight || 0),
  0,
);

let cachedCatalog = null;
let cachedModifiedAtMs = null;

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value), min), max);
}

function inferCharacterMeanScore(favorites) {
  const numeric = Number(favorites);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const inferred = 6 + Math.log10(numeric + 1) / 1.25;
  return Number(clamp(inferred, 6, 10).toFixed(2));
}

function makeCatalogError(message, cause) {
  const error = new Error(message);
  error.code = "MAL_POOL_EMPTY";
  if (cause) error.cause = cause;
  return error;
}

function normalizeCatalogCharacter(entry) {
  const malId = Number(entry?.id);
  const title = typeof entry?.name === "string" ? entry.name.trim() : "";
  const imageUrl =
    typeof entry?.imageUrl === "string" ? entry.imageUrl.trim() : "";
  const favorites = Number(entry?.favorites);
  const appearances = Array.isArray(entry?.appearances)
    ? entry.appearances
        .map((appearance) => ({
          name:
            typeof appearance?.name === "string"
              ? appearance.name.trim()
              : "",
          url:
            typeof appearance?.url === "string"
              ? appearance.url.trim()
              : "",
          type:
            typeof appearance?.type === "string"
              ? appearance.type.trim()
              : "",
        }))
        .filter((appearance) => appearance.name)
    : [];

  if (!Number.isFinite(malId) || malId <= 0 || !title || !imageUrl) {
    return null;
  }

  return {
    malId: Math.trunc(malId),
    title,
    url:
      typeof entry?.url === "string" && entry.url.trim()
        ? entry.url.trim()
        : `https://myanimelist.net/character/${Math.trunc(malId)}`,
    imageUrl,
    meanScore: inferCharacterMeanScore(favorites),
    popularity: null,
    favorites:
      Number.isFinite(favorites) && favorites >= 0
        ? Math.trunc(favorites)
        : null,
    nsfw: "unknown",
    element:
      typeof entry?.element === "string" && ELEMENTS.includes(entry.element)
        ? entry.element
        : null,
    appearances,
    from: (appearances
      .find(a => a.type === "anime" && a.name)
      || appearances[0]
      || {}).name || null,
  };
}

function readCatalogFile() {
  let stat;
  try {
    stat = fs.statSync(CATALOG_FILE);
  } catch (error) {
    throw makeCatalogError(
      `Arena character catalog was not found at ${CATALOG_FILE}.`,
      error,
    );
  }

  if (cachedCatalog && cachedModifiedAtMs === stat.mtimeMs) {
    return cachedCatalog;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8"));
  } catch (error) {
    throw makeCatalogError(
      `Arena character catalog could not be read from ${CATALOG_FILE}.`,
      error,
    );
  }

  if (!parsed || !Array.isArray(parsed.characters)) {
    throw makeCatalogError(
      `Arena character catalog at ${CATALOG_FILE} has no characters array.`,
    );
  }

  const characters = parsed.characters
    .map((entry) => normalizeCatalogCharacter(entry))
    .filter(Boolean)
    .map((character, index) => ({
      ...character,
      popularity: index + 1,
    }));
  if (characters.length === 0) {
    throw makeCatalogError("Arena character catalog contains no usable characters.");
  }
  for (let index = 1; index < characters.length; index += 1) {
    const previousFavorites = Number(characters[index - 1].favorites);
    const currentFavorites = Number(characters[index].favorites);
    if (
      Number.isFinite(previousFavorites) &&
      Number.isFinite(currentFavorites) &&
      currentFavorites > previousFavorites
    ) {
      throw makeCatalogError(
        `Arena character catalog is not sorted by favorites at rank ${index + 1}.`,
      );
    }
  }

  cachedCatalog = {
    file: CATALOG_FILE,
    generatedAt:
      typeof parsed.generatedAt === "string" ? parsed.generatedAt : null,
    characters,
    byMalId: new Map(characters.map((character) => [character.malId, character])),
  };
  cachedModifiedAtMs = stat.mtimeMs;
  return cachedCatalog;
}

function rarityFromCharacterRank(rank, totalCharacters) {
  const numericRank = Number(rank);
  const numericTotal = Number(totalCharacters);
  if (
    !Number.isFinite(numericRank) ||
    numericRank <= 0 ||
    !Number.isFinite(numericTotal) ||
    numericTotal <= 0
  ) {
    return "C";
  }

  const normalizedRank = Math.min(Math.trunc(numericRank), Math.trunc(numericTotal));
  let cumulativeWeight = 0;

  for (const rarity of [...RARITY_ORDER].reverse()) {
    cumulativeWeight += Number(RARITY_CONFIG[rarity]?.weight || 0);
    const upperRank = Math.ceil(
      (Math.trunc(numericTotal) * cumulativeWeight) / RARITY_WEIGHT_SUM,
    );
    if (normalizedRank <= upperRank) return rarity;
  }

  return "C";
}

function getArenaCharacterCatalog() {
  return readCatalogFile();
}

function getArenaCharacterById(malId) {
  const id = Number(malId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return readCatalogFile().byMalId.get(Math.trunc(id)) || null;
}

function rarityForCharacterId(malId) {
  const catalog = readCatalogFile();
  const character = catalog.byMalId.get(Math.trunc(Number(malId)));
  if (!character) return null;
  return rarityFromCharacterRank(character.popularity, catalog.characters.length);
}

async function ensureArenaCardPool() {
  const catalog = readCatalogFile();
  return {
    fetchedAt: catalog.generatedAt,
    count: catalog.characters.length,
    stale: false,
    source: "mal-characters.json",
  };
}

async function refreshArenaCardPool() {
  cachedCatalog = null;
  cachedModifiedAtMs = null;
  return ensureArenaCardPool();
}

async function drawArenaCard(_db, randomFn = Math.random) {
  const catalog = readCatalogFile();
  const roll = Number(randomFn());
  const normalizedRoll = Number.isFinite(roll) ? clamp(roll, 0, 0.999999999999) : 0;
  const index = Math.floor(normalizedRoll * catalog.characters.length);
  return { ...catalog.characters[index] };
}

async function fetchArenaPoolCandidates() {
  return readCatalogFile().characters.map((character) => ({ ...character }));
}

function isPoolFresh(meta) {
  return Boolean(meta && Number(meta.count) > 0);
}

module.exports = {
  CATALOG_FILE,
  drawArenaCard,
  ensureArenaCardPool,
  fetchArenaPoolCandidates,
  getArenaCharacterById,
  getArenaCharacterCatalog,
  isPoolFresh,
  rarityForCharacterId,
  rarityFromCharacterRank,
  refreshArenaCardPool,
};
