import fs from 'fs';
import path from 'path';

const SRC = 'src/lib/arena-api.ts';
const OUT = 'src/lib/arena';

const lines = fs.readFileSync(SRC, 'utf-8').split('\n');
console.log('Total lines:', lines.length);

function findBlockEnd(startLine) {
  let depth = 0, started = false;
  for (let i = startLine; i < lines.length; i++) {
    for (let j = 0; j < lines[i].length; j++) {
      if (lines[i][j] === '{' || lines[i][j] === '(') { depth++; started = true; }
      if (lines[i][j] === '}' || lines[i][j] === ')') { depth--; }
    }
    if (started && depth === 0) {
      if (lines[i].trim().endsWith('};') || lines[i].trim().endsWith(');')) return i + 1;
      return i + 1;
    }
  }
  return lines.length;
}

const allExports = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  let m;
  if ((m = line.match(/^export type (\w+)\s*=/))) allExports.push({ name: m[1], start: i, end: findBlockEnd(i), kind: 'type' });
  else if ((m = line.match(/^export (async )?function (\w+)/))) allExports.push({ name: m[2], start: i, end: findBlockEnd(i), kind: 'fn' });
  else if ((m = line.match(/^export class (\w+)/))) allExports.push({ name: m[1], start: i, end: findBlockEnd(i), kind: 'class' });
}
console.log('Exports:', allExports.length);

const helpers = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line.match(/^(async )?function (\w+)/) && !line.startsWith('export')) {
    helpers.push({ name: line.match(/function (\w+)/)[1], start: i, end: findBlockEnd(i) });
  }
}
console.log('Helpers:', helpers.map(h => h.name).join(', '));

const consts = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim().match(/^const (DEFAULT_ELO_RATING|ELO_PROVISIONAL_MATCHES)\s*=/)) {
    consts.push({ start: i, end: i + 1 });
  }
}

const domains = {
  'shared.ts': {
    types: ['ArenaMetric','ArenaStatsBlock','ArenaStatBreakdown','ArenaPctStats','ArenaSubStat',
      'ArenaEquipmentPiece','ArenaSpriteRef','ArenaPassiveCondition','ArenaPassiveAction',
      'ArenaPassiveRule','ArenaConsumableRule','ArenaCardIv','ArenaCard','ArenaCardAffinity',
      'ArenaProfile','ArenaEquipmentLoadout','ArenaEquippedItem','ArenaBattleTurn',
      'ArenaBattleConsoleEvent','ArenaEloResult','ArenaBattleState','ArenaRecentFight',
      'ArenaFightOpponent','ArenaFightResponse','ArenaActiveFightBattle','ArenaActiveFight',
      'ArenaCollectionResponse','ArenaArchiveResponse','ArenaSelectCollectionCardResponse',
      'ArenaMarketIvBand','ArenaMarketPrice','ArenaMarketListing','ArenaMarketListingsResponse',
      'ArenaMarketMutationResponse','ArenaMarketPriceGuideResponse','ArenaMarketSort',
      'ArenaSkillBranchId','ArenaSkillBranch','ArenaSkillNode','ArenaSkillAllocation','ArenaSkillTreeResponse',
      'ArenaShopItem','ArenaShopTier','ArenaShopResponse','ArenaCardShopDailyOffer',
      'ArenaCardShopResponse','ArenaCardShopPurchaseResponse','ArenaShopRecipe',
      'ArenaLeaderboardResponse','ArenaHallOfFameEntry','ArenaHallOfFameMonth','ArenaHallOfFameResponse',
      'ArenaUpdate','ArenaNotification','ArenaTradeUser','ArenaTradeListing',
      'ArenaTradeListingsResponse','ArenaTradeRequest','ArenaTradeSession',
      'ArenaSacrificePreviewItem','ArenaSacrificePreview','ArenaSacrificeResponse',
      'ArenaMintDuplicateGroup','ArenaMintResponse',
      'TcgCard','TcgBoard','TcgPlayerState','TcgGameState','TcgQueueStatus'],
    classes: ['ArenaApiError'],
    helpers: ['toFiniteNumber','normalizeProfile','normalizeFightOpponent','normalizeActiveFight',
      'normalizeLeaderboard','readApiError','makeAuthHeaders'],
    consts: true,
  },
  'profile.ts': { fns: ['fetchArenaProfile'] },
  'updates.ts': { fns: ['fetchArenaUpdates','createArenaUpdate','deleteArenaUpdate'] },
  'notifications.ts': { fns: ['fetchArenaNotifications','fetchArenaUnreadCount','markArenaNotificationRead','markAllArenaNotificationsRead'] },
  'cards.ts': { fns: ['drawArenaCard','drawArenaPack'] },
  'collection.ts': { fns: ['fetchArenaCollection','selectArenaCollectionCard','toggleArenaCollectionCardFavorite','sacrificeArenaCollectionCards'] },
  'archive.ts': { fns: ['fetchArenaArchive'] },
  'combat.ts': { fns: ['runArenaFight','startPlaybackFight','fetchFightState','advanceFightTurn','skipFight','verifyArena'] },
  'equipment.ts': { fns: ['equipArenaItem','unequipArenaSlot','fodderArenaPiece','saveEquipmentLoadout','restoreEquipmentLoadout','deleteEquipmentLoadout'] },
  'shop.ts': { fns: ['fetchArenaShop','buyArenaItem','useArenaConsumable','craftArenaRecipe'] },
  'card-shop.ts': { fns: ['fetchArenaCardShop','buyArenaShopCard'] },
  'mint.ts': { fns: ['fetchMintDuplicates','mintRainbowCard'] },
  'market.ts': { fns: ['fetchArenaMarketListings','fetchMyArenaMarketListings','fetchArenaMarketPriceGuide','createArenaMarketListing','buyArenaMarketListing','cancelArenaMarketListing'] },
  'trade.ts': { fns: ['searchArenaTradeUsers','searchArenaTradeCards','fetchArenaTradeListings','fetchMyArenaTradeListings','createArenaTradeListing','cancelArenaTradeListing','sendArenaTradeRequest','fetchIncomingArenaTradeRequests','acceptArenaTradeRequest','denyArenaTradeRequest','cancelArenaTradeRequest','fetchArenaTradeRequestStatus','fetchArenaTradeSession','offerCardInArenaTrade','removeCardFromArenaTrade','offerCoinsInArenaTrade','removeCoinsFromArenaTrade','confirmArenaTrade','unconfirmArenaTrade','cancelArenaTradeSession'] },
  'leaderboard.ts': { fns: ['fetchArenaLeaderboard'] },
  'hall-of-fame.ts': { fns: ['fetchArenaHallOfFame'] },
  'skill-tree.ts': { fns: ['fetchArenaSkillTree','activateArenaSkill','resetArenaSkillTree'] },
  'tcg.ts': { fns: ['fetchTcgEligibleCards','startTcgSoloGame','joinTcgQueue','leaveTcgQueue','checkTcgQueue','submitTcgDeck','fetchTcgGameState','submitTcgAction'] },
};

function collectRanges(cfg) {
  const ranges = [];
  if (cfg.types) for (const n of cfg.types) { const e = allExports.find(x => x.name === n && x.kind === 'type'); if (e) ranges.push([e.start, e.end]); }
  if (cfg.classes) for (const n of cfg.classes) { const e = allExports.find(x => x.name === n && x.kind === 'class'); if (e) ranges.push([e.start, e.end]); }
  if (cfg.fns) for (const n of cfg.fns) { const e = allExports.find(x => x.name === n && x.kind === 'fn'); if (e) ranges.push([e.start, e.end]); }
  if (cfg.helpers) for (const n of cfg.helpers) { const h = helpers.find(x => x.name === n); if (h) ranges.push([h.start, h.end]); else { const e = allExports.find(x => x.name === n && x.kind === 'fn'); if (e) ranges.push([e.start, e.end]); } }
  if (cfg.consts) for (const c of consts) ranges.push([c.start, c.end]);
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    if (merged.length === 0 || r[0] > merged[merged.length - 1][1]) merged.push([...r]);
    else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
  }
  return merged;
}

for (const [filename, cfg] of Object.entries(domains)) {
  const ranges = collectRanges(cfg);
  let content = '';
  for (const [s, e] of ranges) content += lines.slice(s, e).join('\n') + '\n';
  content = content.replace(/\n{3,}/g, '\n\n').trim() + '\n';

  const isShared = filename === 'shared.ts';
  const needsJoinApi = content.includes('joinApi(');
  const needsAuth = content.includes('shouldSendBearerToken');

  let imports = '';
  if (needsJoinApi || (content.includes('fetch(') && !isShared)) imports += 'import { joinApi } from "@/lib/config";\n';
  if (needsAuth) imports += 'import { shouldSendBearerToken } from "@/lib/auth-session";\n';

  if (!isShared) {
    const allTypes = domains['shared.ts'].types || [];
    const usedTypes = allTypes.filter(t => new RegExp('\\b' + t + '\\b').test(content));
    if (usedTypes.length) imports += 'import type { ' + usedTypes.join(', ') + ' } from "./shared";\n';

    const sharedExports = [...(domains['shared.ts'].classes || []), ...(domains['shared.ts'].helpers || [])];
    const usedHelpers = sharedExports.filter(h => new RegExp('\\b' + h + '\\b').test(content));
    if (usedHelpers.length) imports += 'import { ' + usedHelpers.join(', ') + ' } from "./shared";\n';
  }

  const outPath = path.join(OUT, filename);
  const finalContent = imports + '\n' + content;
  fs.writeFileSync(outPath, finalContent, 'utf-8');
  console.log(filename + ': ' + finalContent.split('\n').length + ' lines');
}

let idx = '// Arena API — domain modules\n';
['shared','profile','cards','collection','archive','combat','equipment','shop','card-shop','mint','market','trade','leaderboard','hall-of-fame','skill-tree','notifications','updates','tcg'].forEach(d => idx += 'export * from "./' + d + '";\n');
fs.writeFileSync(path.join(OUT, 'index.ts'), idx, 'utf-8');
console.log('\nWrote index.ts. Delete arena-api.ts and run: npm run build');
