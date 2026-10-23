const test = require("node:test");
const assert = require("node:assert/strict");

const {
  drawArenaCard,
  ensureArenaCardPool,
  getArenaCharacterCatalog,
  rarityForCharacterId,
  rarityFromCharacterRank,
} = require("../lib/arena-characters");

test("local MAL character catalog preserves favorites ranking", async () => {
  const catalog = getArenaCharacterCatalog();
  const meta = await ensureArenaCardPool();

  assert.ok(catalog.characters.length > 1000);
  assert.equal(meta.count, catalog.characters.length);
  assert.equal(meta.source, "mal-characters.json");
  assert.equal(catalog.characters[0].popularity, 1);
  assert.ok(
    catalog.characters[0].favorites >=
      catalog.characters[catalog.characters.length - 1].favorites,
  );
});

test("local card draws and rarity use catalog position", async () => {
  const catalog = getArenaCharacterCatalog();
  const first = await drawArenaCard(null, () => 0);
  const last = await drawArenaCard(null, () => 0.999999999);

  assert.equal(first.malId, catalog.characters[0].malId);
  assert.equal(last.malId, catalog.characters[catalog.characters.length - 1].malId);
  assert.equal(rarityForCharacterId(first.malId), "UR");
  assert.equal(rarityForCharacterId(last.malId), "C");
  assert.equal(rarityFromCharacterRank(5, 100), "SSR");
});
