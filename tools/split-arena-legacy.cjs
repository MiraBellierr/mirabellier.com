/**
 * Extracts domain modules from legacy-service.js by copying the entire file
 * and editing the exports for each module.
 * 
 * Usage: node tools/split-arena-legacy.cjs
 */
const fs = require("fs");
const path = require("path");

const ARENA_DIR = path.join(__dirname, "..", "mirabellier-backend", "lib", "arena");
const SOURCE_PATH = path.join(ARENA_DIR, "legacy-service.js");

const source = fs.readFileSync(SOURCE_PATH, "utf8");

// ---------------------------------------------------------------------------
// Module definitions: { filename: { exports: [...] } }
// Each module = full source of legacy-service.js with customized module.exports
// ---------------------------------------------------------------------------
const MODULES = {
  "effects.js": [
    "normalizeArenaEffects", "serializeEffects", "consumeWinBoosts",
    "consumeFightBoostDurations", "tryGrantBonusDraw", "applyFightEffectUsage",
    "getWonRoundRarityCoinReward", "clampEffectDuration",
  ],
  "cards.js": [
    "normalizeSelectedCard", "serializeSelectedCard", "insertCollectionCard",
    "createDrawnCard", "createPurchasedCard", "metadataBonuses", "cardIvStatBonus",
  ],
  "collection.js": [
    "countCollectionCards", "readCollectionCards", "getArenaCollectionPayload",
    "selectCollectionCard", "toggleCollectionCardFavorite",
    "drawDailyCard", "drawArenaPack",
  ],
  "archive.js": [
    "cardFromCatalogCharacter", "characterArchiveSearchNames",
    "characterMatchesArchiveSearch", "getOwnedArchiveMalIds",
    "getArenaArchivePayload",
  ],
  "equipment.js": [
    "getEquipmentPiecesRows", "getEquippedPiecesRows", "getEquippedPieceBySlot",
    "insertEquipmentPiece", "equipEquipmentPiece", "rollEquipmentPiece",
    "computeEquipmentStats", "weightedEquipmentBonus",
    "getEquipmentLoadouts", "saveEquipmentLoadout",
    "restoreEquipmentLoadout", "deleteEquipmentLoadout",
    "unequipEquipmentSlot", "fodderEquipmentPiece",
  ],
  "profile.js": [
    "mapArenaProfileRow", "createArenaProfile",
    "ensureArenaProfile", "toPublicProfile", "readRecentFights",
    "getArenaProfilePayload", "getDailyCardDrawsUsed", "canDrawDailyCard",
  ],
  "shop.js": [
    "getInventoryRows", "getInventoryMap", "getEquippedRows",
    "upsertInventoryItem", "upsertEquippedItem",
    "buildMaterialInventory", "buildShopCatalog",
    "getArenaShopPayload", "buyShopItem", "equipShopItem",
    "useConsumable", "craftShopRecipe",
    "applyConsumableEffect", "enforceAscensionCooldown",
  ],
  "card-shop.js": [
    "readDailyCardShopOffers", "ensureDailyCardShopOffers",
    "buildArenaCardShopPayload", "getArenaCardShopPayload",
    "rerollArenaCardShopOffers", "buyArenaShopCard",
  ],
  "combat.js": [
    "calculateRoundPower", "resolveRoundWinner", "applyLevelUps",
    "calculateWinXp", "calculateWinCoins", "assertFightCooldown",
    "loadCombatSnapshot", "resolveFightOpponentProfile",
    "buildFightStatBreakdown", "buildPublicFightOpponentSnapshot",
    "loadFightOpponent", "getNpcTemplateForLevel", "buildNpcOpponent",
    "selectOpponentForFight", "simulateFight", "runFight",
    "computeMaxHp", "computeEvasionChance", "calculateAttackOutcome",
    "evaluatePassiveWhen", "canFirePassiveAction",
    "buildPassiveRuntime", "consumeTempGuard", "runPassivesForTrigger",
    "chooseEloOpponent", "applyEloResult",
    "incrementDailyOpponentCount", "resetDailyOpponentCount",
    "resetAllDefenderCaps", "rollFightMaterialRewards",
  ],
  "playback.js": [
    "getActiveFightRow", "hasActiveFight", "deleteActiveFight",
    "parsePlaybackSimulation", "reconcilePlaybackFightRow",
    "getPlaybackFightState", "startPlaybackFight",
    "advancePlaybackFightTurn", "skipPlaybackFightToEnd",
    "finalizePlaybackFightRewards",
  ],
  "market.js": [
    "getMarketPrice", "getArenaMarketPriceGuide",
    "normalizeMarketListingRow", "getMarketListingById",
    "getArenaMarketListings", "getMyArenaMarketListings",
    "createArenaMarketListing", "cancelArenaMarketListing",
    "buyArenaMarketListing",
  ],
  "trade.js": [
    "searchArenaUsers", "searchArenaTradeCards",
    "getWantedTradeCard", "parseTradeCardIds", "uniqueTradeCardIds",
    "tradeCardIdsForSide", "serializeTradeCardIds", "primaryTradeCardId",
    "findActiveTradeSessionUsingCard", "loadTradeCardsForOwner",
    "normalizeTradeListingRow",
    "getArenaTradeListings", "getMyArenaTradeListings",
    "createArenaTradeListing", "cancelArenaTradeListing",
    "sendTradeRequest", "getIncomingTradeRequests",
    "acceptTradeRequest", "denyTradeRequest", "cancelTradeRequest",
    "getTradeSession", "clearSelectedCardsForCompletedTrade",
    "offerCardInTrade", "removeCardFromTrade",
    "offerCoinInTrade", "removeCoinFromTrade",
    "confirmTrade", "unconfirmTrade", "cancelTradeSession",
  ],
  "notifications.js": [
    "createArenaNotification", "getArenaNotifications",
    "getArenaNotificationUnreadCount", "markArenaNotificationRead",
    "markAllArenaNotificationsRead",
  ],
  "updates.js": [
    "normalizeArenaUpdateText", "mapArenaUpdateRow",
    "getArenaUpdates", "createArenaUpdate", "deleteArenaUpdate",
  ],
  "leaderboard.js": [
    "countLeaderboardEntries", "getLeaderboard",
  ],
  "hall-of-fame.js": [
    "snapshotAndResetElo", "getHallOfFame",
  ],
  "skill-tree.js": [
    "getSkillAllocationRows", "getSkillState",
    "getArenaSkillTreePayload", "activateArenaSkill", "resetArenaSkills",
  ],
  "mint.js": [
    "getMintDuplicates", "mintRainbowCard",
  ],
};

// Find the module.exports section
const exportsMarker = "\nmodule.exports = {";
const exportsIdx = source.indexOf(exportsMarker);
if (exportsIdx === -1) {
  console.error("Could not find module.exports");
  process.exit(1);
}

// Everything before module.exports
const bodyCode = source.slice(0, exportsIdx);

// Generate each module
for (const [filename, exportsList] of Object.entries(MODULES)) {
  const exportLines = exportsList.map(name => `  ${name},`).join("\n");
  const moduleExports = `\nmodule.exports = {\n${exportLines}\n};\n`;
  const content = bodyCode + moduleExports;
  
  const targetPath = path.join(ARENA_DIR, filename);
  fs.writeFileSync(targetPath, content, "utf8");
  console.log(`Wrote ${filename} (${exportsList.length} exports)`);
}

console.log("\nDone! Created 19 domain modules.");
console.log("Next: Create barrel index.js, update routes, delete legacy-service.js");
