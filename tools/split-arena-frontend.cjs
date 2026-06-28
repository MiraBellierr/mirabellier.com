/**
 * Splits src/lib/arena-api.ts into domain modules under src/lib/arena/
 * Usage: node tools/split-arena-frontend.cjs
 */
const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "..", "src", "lib", "arena");
const SOURCE_PATH = path.join(__dirname, "..", "src", "lib", "arena-api.ts");

// Ensure target directory exists
fs.mkdirSync(SRC_DIR, { recursive: true });

const source = fs.readFileSync(SOURCE_PATH, "utf8");

// Find where types/helpers end and API functions begin
const firstApiFnMarker = "export async function fetchArenaProfile";
const firstApiFnIdx = source.indexOf(firstApiFnMarker);
if (firstApiFnIdx === -1) {
  console.error("Could not find first API function");
  process.exit(1);
}

// Split into "header" (types + helpers) and "functions"
const header = source.slice(0, firstApiFnIdx);
const functions = source.slice(firstApiFnIdx);

// ---------------------------------------------------------------------------
// 1. Create types.ts — all type/interface exports
// ---------------------------------------------------------------------------
// Extract everything from line 1 to the ArenaApiError class (exclusive)
const classMarker = "\nexport class ArenaApiError";
const classIdx = header.indexOf(classMarker);
const typesContent = header.slice(0, classIdx).trimStart() + "\n";

const typesPath = path.join(SRC_DIR, "types.ts");
fs.writeFileSync(typesPath, typesContent, "utf8");
console.log("Wrote types.ts");

// ---------------------------------------------------------------------------
// 2. Create errors.ts — ArenaApiError + internal helpers
// ---------------------------------------------------------------------------
// Everything from ArenaApiError through makeAuthHeaders
const errorsContent = `import type { ArenaProfile, ArenaFightResponse, ArenaActiveFight, ArenaLeaderboardResponse } from "./types";
export type { ArenaMetric } from "./types";

${header.slice(classIdx + 1)}
`;

const errorsPath = path.join(SRC_DIR, "errors.ts");
fs.writeFileSync(errorsPath, errorsContent, "utf8");
console.log("Wrote errors.ts");

// ---------------------------------------------------------------------------
// 3. Create domain API modules
// ---------------------------------------------------------------------------
const MODULES = {
  "profile.ts": [
    "fetchArenaProfile",
  ],
  "cards.ts": [
    "drawArenaCard", "drawArenaPack",
  ],
  "collection.ts": [
    "fetchArenaCollection", "selectArenaCollectionCard", "toggleArenaCollectionCardFavorite",
  ],
  "archive.ts": [
    "fetchArenaArchive",
  ],
  "shop.ts": [
    "fetchArenaShop", "fetchArenaCardShop", "buyArenaShopCard", "buyArenaItem", "craftArenaRecipe",
  ],
  "equipment.ts": [
    "useArenaConsumable", "equipArenaItem", "unequipArenaSlot", "fodderArenaPiece",
    "saveEquipmentLoadout", "restoreEquipmentLoadout", "deleteEquipmentLoadout",
  ],
  "combat.ts": [
    "runArenaFight", "startPlaybackFight", "fetchFightState", "advanceFightTurn",
    "skipFight", "verifyArena",
  ],
  "market.ts": [
    "fetchArenaMarketListings", "fetchMyArenaMarketListings", "fetchArenaMarketPriceGuide",
    "createArenaMarketListing", "buyArenaMarketListing", "cancelArenaMarketListing",
  ],
  "trade.ts": [
    "searchArenaTradeUsers", "searchArenaTradeCards",
    "fetchArenaTradeListings", "fetchMyArenaTradeListings",
    "createArenaTradeListing", "cancelArenaTradeListing",
    "sendArenaTradeRequest", "fetchIncomingArenaTradeRequests",
    "acceptArenaTradeRequest", "denyArenaTradeRequest", "cancelArenaTradeRequest",
    "fetchArenaTradeRequestStatus", "fetchArenaTradeSession",
    "offerCardInArenaTrade", "removeCardFromArenaTrade",
    "offerCoinsInArenaTrade", "removeCoinsFromArenaTrade",
    "confirmArenaTrade", "unconfirmArenaTrade", "cancelArenaTradeSession",
  ],
  "notifications.ts": [
    "fetchArenaNotifications", "fetchArenaUnreadCount",
    "markArenaNotificationRead", "markAllArenaNotificationsRead",
  ],
  "updates.ts": [
    "fetchArenaUpdates", "createArenaUpdate", "deleteArenaUpdate",
  ],
  "leaderboard.ts": [
    "fetchArenaLeaderboard",
  ],
  "hall-of-fame.ts": [
    "fetchArenaHallOfFame",
  ],
  "skill-tree.ts": [
    "fetchArenaSkillTree", "activateArenaSkill", "resetArenaSkillTree",
  ],
  "mint.ts": [
    "fetchMintDuplicates", "mintRainbowCard",
  ],
  "tcg.ts": [
    "fetchTcgEligibleCards", "startTcgSoloGame", "joinTcgQueue", "leaveTcgQueue",
    "checkTcgQueue", "submitTcgDeck", "fetchTcgGameState", "submitTcgAction",
  ],
};

// Build a map of function name → source code
const fnMap = {};
// Find all "export async function NAME" blocks
const fnRegex = /export async function (\w+)/g;
let match;
while ((match = fnRegex.exec(functions)) !== null) {
  const fnName = match[1];
  fnMap[fnName] = match.index;
}

// Check for missing functions
for (const [filename, fnNames] of Object.entries(MODULES)) {
  for (const name of fnNames) {
    if (!(name in fnMap)) {
      // Try non-async
      const nonAsyncRegex = new RegExp(`export function ${escapeRegex(name)}\\b`);
      const m = nonAsyncRegex.exec(functions);
      if (m) {
        fnMap[name] = m.index;
      } else {
        console.warn(`WARNING: Function "${name}" not found for ${filename}`);
      }
    }
  }
}

// Extract each function block
function extractFnBlock(source, startIdx) {
  let depth = 0;
  let inString = false;
  let stringChar = "";
  let inTemplate = false;
  let i = startIdx;
  
  // Find the opening brace
  while (i < source.length && source[i] !== "{") i++;
  if (i >= source.length) return "";
  
  for (; i < source.length; i++) {
    const ch = source[i];
    
    if (inString) {
      if (ch === "\\") { i++; continue; }
      if (ch === stringChar) inString = false;
      continue;
    }
    if (inTemplate) {
      if (ch === "\\") { i++; continue; }
      if (ch === "\`") inTemplate = false;
      continue;
    }
    
    if (ch === "\"" || ch === "'") { inString = true; stringChar = ch; continue; }
    if (ch === "\`") { inTemplate = true; continue; }
    
    // Skip regex literals
    if (ch === "/" && i > 0 && /[=\(\[,:!&|?+\-~]/.test(source[i-1])) {
      let j = i + 1;
      while (j < source.length && source[j] !== "/") {
        if (source[j] === "\\") j++;
        j++;
      }
      i = j;
      continue;
    }
    
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return source.slice(startIdx, i + 1);
      }
    }
  }
  
  console.warn("WARNING: Could not find closing brace for block at", startIdx);
  return "";
}

// Write each module
const modulePrefix = `import { joinApi } from "@/lib/config";
import { shouldSendBearerToken } from "@/lib/auth-session";
import { ArenaApiError, readApiError, makeAuthHeaders } from "./errors";
import type {
  ArenaProfile, ArenaCard, ArenaUpdate, ArenaFightResponse, ArenaActiveFight,
  ArenaShopResponse, ArenaCardShopResponse, ArenaCardShopPurchaseResponse,
  ArenaShopRecipe, ArenaShopItem, ArenaEquipmentPiece, ArenaEquipmentLoadout,
  ArenaCollectionResponse, ArenaSelectCollectionCardResponse,
  ArenaArchiveResponse, ArenaMarketListingsResponse, ArenaMarketListing,
  ArenaMarketPriceGuideResponse, ArenaMarketMutationResponse, ArenaMarketSort,
  ArenaMarketPrice, ArenaMarketIvBand, ArenaLeaderboardResponse,
  ArenaLeaderboardEntry, ArenaHallOfFameResponse, ArenaHallOfFameMonth,
  ArenaHallOfFameEntry, ArenaSkillTreeResponse, ArenaSkillBranch,
  ArenaSkillNode, ArenaSkillAllocation, ArenaTradeUser, ArenaTradeListing,
  ArenaTradeListingsResponse, ArenaTradeRequest, ArenaTradeSession,
  ArenaNotification, ArenaMintDuplicateGroup, ArenaMintResponse,
  ArenaDrawCardResponse, ArenaDrawPackResponse, ArenaFightResponse as ArenaFightResult,
  TcgCard, TcgBoard, TcgPlayerState, TcgGameState, TcgQueueStatus,
} from "./types";

`;

// Write each domain module
for (const [filename, fnNames] of Object.entries(MODULES)) {
  const blocks = [];
  for (const name of fnNames) {
    const idx = fnMap[name];
    if (idx === undefined) continue;
    const block = extractFnBlock(functions, idx);
    if (block) blocks.push(block);
  }
  
  // Remove "export " prefix since we re-export at bottom
  const body = blocks.map(b => b.replace(/^export /gm, "")).join("\n\n");
  
  const exports = fnNames.filter(n => fnMap[n] !== undefined);
  const exportLines = exports.map(n => `  ${n},`).join("\n");
  
  const content = modulePrefix + body + `\nexport {\n${exportLines}\n};\n`;
  
  const targetPath = path.join(SRC_DIR, filename);
  fs.writeFileSync(targetPath, content, "utf8");
  console.log(`Wrote ${filename} (${exports.length} functions)`);
}

// ---------------------------------------------------------------------------
// 4. Create barrel index.ts
// ---------------------------------------------------------------------------
const barrelExports = [
  "types", "errors", "profile", "cards", "collection", "archive",
  "shop", "equipment", "combat", "market", "trade",
  "notifications", "updates", "leaderboard", "hall-of-fame",
  "skill-tree", "mint", "tcg",
];

let barrel = `// Auto-generated barrel — re-exports everything from domain modules
export * from "./types";
export * from "./errors";
`;

for (const mod of barrelExports.slice(2)) { // skip types & errors (already above)
  barrel += `export * from "./${mod}";\n`;
}

const barrelPath = path.join(SRC_DIR, "index.ts");
fs.writeFileSync(barrelPath, barrel, "utf8");
console.log("Wrote index.ts (barrel)");

console.log("\nDone! Frontend arena modules created.");
console.log("Next: Update all imports from @/lib/arena-api to @/lib/arena");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
