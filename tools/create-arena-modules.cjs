/**
 * Creates domain re-export modules under src/lib/arena/
 */
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "src", "lib", "arena");
fs.mkdirSync(DIR, { recursive: true });

const modules = {
  "profile.ts": {
    exports: ["fetchArenaProfile"],
    types: ["ArenaProfile"],
  },
  "cards.ts": {
    exports: ["drawArenaCard", "drawArenaPack"],
    types: [],
  },
  "collection.ts": {
    exports: ["fetchArenaCollection", "selectArenaCollectionCard", "toggleArenaCollectionCardFavorite"],
    types: ["ArenaCollectionResponse", "ArenaCard"],
  },
  "archive.ts": {
    exports: ["fetchArenaArchive"],
    types: ["ArenaArchiveResponse"],
  },
  "shop.ts": {
    exports: ["fetchArenaShop", "fetchArenaCardShop", "buyArenaShopCard", "buyArenaItem", "craftArenaRecipe"],
    types: ["ArenaShopResponse", "ArenaCardShopResponse", "ArenaCardShopPurchaseResponse"],
  },
  "equipment.ts": {
    exports: ["useArenaConsumable", "equipArenaItem", "unequipArenaSlot", "fodderArenaPiece", "saveEquipmentLoadout", "restoreEquipmentLoadout", "deleteEquipmentLoadout"],
    types: [],
  },
  "combat.ts": {
    exports: ["runArenaFight", "startPlaybackFight", "fetchFightState", "advanceFightTurn", "skipFight", "verifyArena"],
    types: ["ArenaFightResponse", "ArenaActiveFight", "ArenaBattleTurn"],
  },
  "market.ts": {
    exports: ["fetchArenaMarketListings", "fetchMyArenaMarketListings", "fetchArenaMarketPriceGuide", "createArenaMarketListing", "buyArenaMarketListing", "cancelArenaMarketListing"],
    types: ["ArenaMarketListing", "ArenaMarketListingsResponse", "ArenaMarketPriceGuideResponse", "ArenaMarketIvBand", "ArenaMarketPrice"],
  },
  "trade.ts": {
    exports: ["searchArenaTradeUsers", "searchArenaTradeCards", "fetchArenaTradeListings", "fetchMyArenaTradeListings", "createArenaTradeListing", "cancelArenaTradeListing", "sendArenaTradeRequest", "fetchIncomingArenaTradeRequests", "acceptArenaTradeRequest", "denyArenaTradeRequest", "cancelArenaTradeRequest", "fetchArenaTradeRequestStatus", "fetchArenaTradeSession", "offerCardInArenaTrade", "removeCardFromArenaTrade", "offerCoinsInArenaTrade", "removeCoinsFromArenaTrade", "confirmArenaTrade", "unconfirmArenaTrade", "cancelArenaTradeSession"],
    types: ["ArenaTradeListing", "ArenaTradeListingsResponse", "ArenaTradeRequest", "ArenaTradeSession", "ArenaTradeUser"],
  },
  "notifications.ts": {
    exports: ["fetchArenaNotifications", "fetchArenaUnreadCount", "markArenaNotificationRead", "markAllArenaNotificationsRead"],
    types: ["ArenaNotification"],
  },
  "updates.ts": {
    exports: ["fetchArenaUpdates", "createArenaUpdate", "deleteArenaUpdate"],
    types: ["ArenaUpdate"],
  },
  "leaderboard.ts": {
    exports: ["fetchArenaLeaderboard"],
    types: ["ArenaLeaderboardResponse"],
  },
  "hall-of-fame.ts": {
    exports: ["fetchArenaHallOfFame"],
    types: ["ArenaHallOfFameResponse", "ArenaHallOfFameEntry", "ArenaHallOfFameMonth"],
  },
  "skill-tree.ts": {
    exports: ["fetchArenaSkillTree", "activateArenaSkill", "resetArenaSkillTree"],
    types: ["ArenaSkillTreeResponse", "ArenaSkillNode", "ArenaSkillBranch", "ArenaSkillAllocation"],
  },
  "mint.ts": {
    exports: ["fetchMintDuplicates", "mintRainbowCard"],
    types: ["ArenaMintDuplicateGroup", "ArenaMintResponse"],
  },
  "tcg.ts": {
    exports: ["fetchTcgEligibleCards", "startTcgSoloGame", "joinTcgQueue", "leaveTcgQueue", "checkTcgQueue", "submitTcgDeck", "fetchTcgGameState", "submitTcgAction"],
    types: ["TcgCard", "TcgBoard", "TcgPlayerState", "TcgGameState", "TcgQueueStatus"],
  },
};

for (const [filename, config] of Object.entries(modules)) {
  const lines = [];
  
  if (config.exports.length > 0) {
    lines.push(`export { ${config.exports.join(", ")} } from "../arena-api";`);
  }
  if (config.types.length > 0) {
    lines.push(`export type { ${config.types.join(", ")} } from "../arena-api";`);
  }
  
  const target = path.join(DIR, filename);
  fs.writeFileSync(target, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote ${filename}`);
}

console.log("Done! Created 19 domain re-export modules.");
