const { toInt, toPositiveInt, clamp } = require("./utils");
const { rarityFromCharacterRank, getArenaCharacterCatalog } = require("../arena-characters");
const { normalizeSelectedCard } = require("./cards");


function searchArenaUsers(db, query) {
  const term = String(query || "").trim();
  if (!term) return [];
  return db
    .prepare(
      `SELECT id, username, avatar
       FROM users
       WHERE username LIKE ? COLLATE NOCASE
       ORDER BY username ASC
       LIMIT 10`,
    )
    .all(`${term}%`);
}

function cardFromCatalogCharacter(character, catalogSize) {
  if (!character) return null;
  return {
    cardInstanceId: `wanted-${character.malId}`,
    malId: character.malId,
    title: character.title,
    url: character.url,
    imageUrl: character.imageUrl,
    meanScore: character.meanScore,
    popularity: character.popularity,
    favorites: character.favorites,
    nsfw: character.nsfw,
    rarity: rarityFromCharacterRank(character.popularity, catalogSize),
    element: character.element || null,
    from: character.from || null,
    iv: {
      power: 0,
      guard: 0,
      speed: 0,
      effectHit: 0,
      total: 0,
    },
    drawnAt: null,
  };
}

function getWantedTradeCard(malId) {
  const catalog = getArenaCharacterCatalog();
  const character = catalog.byMalId.get(toPositiveInt(malId, 0));
  return cardFromCatalogCharacter(character, catalog.characters.length);
}

function searchArenaTradeCards(query) {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return [];
  const catalog = getArenaCharacterCatalog();
  return catalog.characters
    .filter((character) => {
      const title = String(character.title || "").toLowerCase();
      const from = String(character.from || "").toLowerCase();
      return title.includes(term) || from.includes(term);
    })
    .slice(0, 20)
    .map((character) => cardFromCatalogCharacter(character, catalog.characters.length))
    .filter(Boolean);
}

function characterArchiveSearchNames(character) {
  const title = String(character?.title || "").trim();
  if (!title) return [];
  const names = [title];
  const commaIndex = title.indexOf(",");
  if (commaIndex > 0) {
    const familyName = title.slice(0, commaIndex).trim();
    const givenName = title.slice(commaIndex + 1).trim();
    if (familyName && givenName) {
      names.push(`${givenName} ${familyName}`);
      names.push(`${familyName} ${givenName}`);
    }
  }
  return names;
}

function characterMatchesArchiveSearch(character, term) {
  if (!term) return true;
  const names = characterArchiveSearchNames(character);
  const appearances = Array.isArray(character.appearances)
    ? character.appearances
    : [];
  return (
    names.some((name) => name.toLowerCase().includes(term)) ||
    appearances.some((appearance) =>
      String(appearance?.name || "").toLowerCase().includes(term),
    )
  );
}

function getOwnedArchiveMalIds(db, userId) {
  const rows = db
    .prepare("SELECT cardJson FROM arena_card_collection WHERE userId = ?")
    .all(userId);
  const owned = new Set();
  for (const row of rows) {
    const card = normalizeSelectedCard(row.cardJson);
    if (card?.malId) owned.add(card.malId);
  }
  return owned;
}

function getArenaArchivePayload(db, userId, options = {}) {
  const page = Math.max(toPositiveInt(options.page, 1), 1);
  const perPage = clamp(toPositiveInt(options.perPage, 24), 1, 100);
  const search = String(options.search || "").trim();
  const rawOwnership = String(options.ownership || "").trim();
  const ownership = ["owned", "not-owned"].includes(rawOwnership)
    ? rawOwnership
    : "all";
  const term = search.toLowerCase();
  const catalog = getArenaCharacterCatalog();
  const ownedMalIds = getOwnedArchiveMalIds(db, userId);
  const searchedCharacters = term
    ? catalog.characters.filter((character) =>
        characterMatchesArchiveSearch(character, term),
      )
    : catalog.characters;
  const characters = ownership === "all"
    ? searchedCharacters
    : searchedCharacters.filter((character) => {
        const isOwned = ownedMalIds.has(character.malId);
        return ownership === "owned" ? isOwned : !isOwned;
      });
  const total = characters.length;
  const totalPages = Math.max(Math.ceil(total / perPage), 1);
  const offset = (page - 1) * perPage;
  const cards = characters
    .slice(offset, offset + perPage)
    .map((character) => {
      const card = cardFromCatalogCharacter(character, catalog.characters.length);
      return card ? { ...card, owned: ownedMalIds.has(character.malId) } : null;
    })
    .filter(Boolean);

  return {
    cards,
    page,
    perPage,
    totalPages,
    total,
    search: search || undefined,
    ownership,
  };
}

module.exports = {
  searchArenaUsers,
  cardFromCatalogCharacter,
  getWantedTradeCard,
  searchArenaTradeCards,
  characterArchiveSearchNames,
  characterMatchesArchiveSearch,
  getOwnedArchiveMalIds,
  getArenaArchivePayload,
};
