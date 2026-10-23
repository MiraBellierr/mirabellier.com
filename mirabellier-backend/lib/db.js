const path = require("path");
const Database = require("better-sqlite3");
const fs = require("fs");
const { initializeSearchIndex } = require("./search-index");

const DB_FILE =
  process.env.DB_FILE || path.join(__dirname, "..", "database.sqlite3");

function ensureDbDirectoryExists(filePath) {
  const dbDir = path.dirname(filePath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

function configurePragmas(db) {
  // Write-Ahead Logging for better concurrency
  db.pragma("journal_mode = WAL");
  // Faster writes with minimal risk
  db.pragma("synchronous = NORMAL");
  // 64MB cache
  db.pragma("cache_size = -64000");
  // Store temp tables in memory
  db.pragma("temp_store = MEMORY");
  // 256MB memory-mapped I/O
  db.pragma("mmap_size = 268435456");
}

function createBaseTables(db) {
  db.prepare(
    `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    passwordHash TEXT,
    avatar TEXT,
    createdAt TEXT
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    userId TEXT,
    createdAt TEXT,
    expiresAt TEXT
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    title TEXT,
    content TEXT,
    userId TEXT,
    author TEXT,
    shortDescription TEXT,
    thumbnail TEXT,
    likes TEXT,
    comments TEXT,
    createdAt TEXT,
    updatedAt TEXT
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS anime (
    id TEXT PRIMARY KEY,
    title TEXT,
    url TEXT,
    img TEXT,
    ord INTEGER
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS myanimelist_anime_snapshots (
    feedKey TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    fetchedAt TEXT NOT NULL,
    payloadJson TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS quote_snapshots (
    recordedDate TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    sourceType TEXT NOT NULL,
    displayDate TEXT,
    publishedAt TEXT,
    fetchedAt TEXT NOT NULL,
    fallbackReason TEXT,
    quotesJson TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS guestbook_entries (
    id TEXT PRIMARY KEY,
    userId TEXT,
    author TEXT NOT NULL,
    message TEXT NOT NULL,
    website TEXT,
    mood TEXT,
    x INTEGER,
    y INTEGER,
    createdAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS daily_questions (
    recordedDate TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    createdByUserId TEXT,
    lockedAt TEXT,
    archivedAt TEXT,
    discordNotifiedAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS daily_question_answers (
    id TEXT PRIMARY KEY,
    recordedDate TEXT NOT NULL,
    userId TEXT,
    guestName TEXT,
    identityType TEXT NOT NULL,
    identityKey TEXT NOT NULL,
    answer TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )`,
  ).run();

  // Single hand-edited row (id = 'current') backing the /now page. The whole
  // "reading / watching / building" body lives in payloadJson so the shape can
  // change without a migration — same pattern as shrine_pages.payloadJson.
  db.prepare(
    `CREATE TABLE IF NOT EXISTS site_now (
    id TEXT PRIMARY KEY,
    payloadJson TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  ).run();

  // One row per external sync that feeds an SPA page but keeps its data outside
  // SQLite (the Honkai: Star Rail roster in data/hsr/). Gives the sitemap a real
  // per-page change date for /hsr without reading across the filesystem from
  // inside a DB query. `syncKey` is the page-level identifier, e.g. "hsr".
  db.prepare(
    `CREATE TABLE IF NOT EXISTS external_sync_state (
    syncKey TEXT PRIMARY KEY,
    syncedAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  ).run();

  // Single hand-edited row (id = 'current') backing the /links page: the
  // blogroll sections and the webring config. Whole body lives in payloadJson
  // so sections/entries can grow without a migration — same pattern as site_now.
  db.prepare(
    `CREATE TABLE IF NOT EXISTS site_links (
    id TEXT PRIMARY KEY,
    payloadJson TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  ).run();

  // Owner-authored entries for the public /changelog page. Shaped like
  // arena_updates (title + freeform body) plus an owner-set entryDate so the
  // list reads as "what shipped on <date>".
  db.prepare(
    `CREATE TABLE IF NOT EXISTS site_changelog (
    id TEXT PRIMARY KEY,
    entryDate TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    createdByUserId TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS shrine_pages (
    slug TEXT PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    excerpt TEXT,
    image TEXT,
    imageAlt TEXT,
    schemaType TEXT,
    aboutJson TEXT,
    keywordsJson TEXT,
    ctaLabel TEXT,
    priority TEXT,
    changefreq TEXT,
    payloadJson TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_profiles (
    userId TEXT PRIMARY KEY,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    coins INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    winStreak INTEGER NOT NULL DEFAULT 0,
    hp INTEGER NOT NULL DEFAULT 120,
    power INTEGER NOT NULL DEFAULT 12,
    guard INTEGER NOT NULL DEFAULT 12,
    speed INTEGER NOT NULL DEFAULT 10,
    effectHit INTEGER NOT NULL DEFAULT 3,
    lifetimeCoinsEarned INTEGER NOT NULL DEFAULT 0,
    eloRating INTEGER NOT NULL DEFAULT 1000,
    eloMatches INTEGER NOT NULL DEFAULT 0,
    peakElo INTEGER NOT NULL DEFAULT 1000,
    selectedCardJson TEXT,
    lastCardDrawDate TEXT,
    dailyCardDrawCount INTEGER NOT NULL DEFAULT 0,
    catalogVersion TEXT NOT NULL DEFAULT 'v1',
    effectsJson TEXT,
    lastFightAt TEXT,
    dailyOpponentCount INTEGER NOT NULL DEFAULT 0,
    lastOpponentDate TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_inventory (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    itemId TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_equipment_pieces (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    slot TEXT NOT NULL,
    mainStatType TEXT NOT NULL,
    mainStatValue REAL NOT NULL,
    enhancementLevel INTEGER NOT NULL DEFAULT 0,
    subStats TEXT NOT NULL,
    equipped INTEGER NOT NULL DEFAULT 0,
    locked INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  )`,
  ).run();

  // Migration: add locked column if missing
  try {
    db.prepare(`ALTER TABLE arena_equipment_pieces ADD COLUMN locked INTEGER NOT NULL DEFAULT 0`).run();
  } catch { /* column already exists */ }

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_equipment_loadouts (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    weaponPieceId TEXT,
    armorPieceId TEXT,
    charmPieceId TEXT,
    createdAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_fights (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    opponentUserId TEXT,
    result TEXT NOT NULL,
    roundsJson TEXT NOT NULL,
    xpDelta INTEGER NOT NULL DEFAULT 0,
    coinDelta INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_card_collection (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    cardInstanceId TEXT NOT NULL,
    cardJson TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_card_affinity (
    userId TEXT NOT NULL,
    malId INTEGER NOT NULL,
    fights INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    affinityLevel INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    PRIMARY KEY (userId, malId)
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_daily_card_offers (
    offerId TEXT PRIMARY KEY,
    userId TEXT NOT NULL DEFAULT '',
    offerDate TEXT NOT NULL,
    slot INTEGER NOT NULL,
    malId INTEGER NOT NULL,
    cardJson TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_daily_card_purchases (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    offerId TEXT NOT NULL,
    offerDate TEXT NOT NULL,
    purchasedAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_market_listings (
    id TEXT PRIMARY KEY,
    sellerUserId TEXT NOT NULL,
    buyerUserId TEXT,
    cardInstanceId TEXT NOT NULL,
    cardJson TEXT NOT NULL,
    cardTitle TEXT NOT NULL,
    malId INTEGER NOT NULL,
    rarity TEXT NOT NULL,
    ivTotal INTEGER NOT NULL,
    ivBand TEXT NOT NULL,
    price INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    soldAt TEXT,
    cancelledAt TEXT
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_updates (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    createdByUserId TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_compensations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT,
    payloadJson TEXT NOT NULL,
    createdByUserId TEXT NOT NULL,
    recipientCount INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  )`,
  ).run();
  const offerColumns = db.prepare("PRAGMA table_info(arena_daily_card_offers)").all();
  if (!offerColumns.some((column) => column.name === "userId")) {
    db.prepare("ALTER TABLE arena_daily_card_offers ADD COLUMN userId TEXT NOT NULL DEFAULT ''").run();
  }

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_compensation_claims (
    id TEXT PRIMARY KEY,
    compensationId TEXT NOT NULL,
    userId TEXT NOT NULL,
    claimedAt TEXT,
    createdAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_mal_card_pool (
    malId INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    imageUrl TEXT NOT NULL,
    meanScore REAL,
    popularity INTEGER,
    favorites INTEGER,
    nsfw TEXT,
    fetchedAt TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_active_fights (
    userId TEXT PRIMARY KEY,
    fightId TEXT NOT NULL,
    cursor INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'active',
    simulationJson TEXT NOT NULL,
    opponentJson TEXT NOT NULL,
    playerEffectsJson TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_skill_allocations (
    userId TEXT NOT NULL,
    nodeId TEXT NOT NULL,
    activatedAt TEXT NOT NULL,
    PRIMARY KEY (userId, nodeId)
  )`,
  ).run();

    db.prepare(
      `CREATE TABLE IF NOT EXISTS arena_trade_listings (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    cardInstanceId TEXT NOT NULL,
    cardJson TEXT NOT NULL,
    cardTitle TEXT NOT NULL,
    malId INTEGER NOT NULL,
    rarity TEXT NOT NULL,
    ivTotal INTEGER NOT NULL,
    element TEXT,
    wantedRarity TEXT,
    wantedElement TEXT,
    wantedCardJson TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    cancelledAt TEXT
  )`,
    ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_trade_requests (
    id TEXT PRIMARY KEY,
    askerId TEXT NOT NULL,
    responderId TEXT NOT NULL,
    listingId TEXT,
    askerCardInstanceId TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    respondedAt TEXT,
    cancelledAt TEXT
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_trade_sessions (
    id TEXT PRIMARY KEY,
    requestId TEXT NOT NULL,
    askerId TEXT NOT NULL,
    responderId TEXT NOT NULL,
    askerCardInstanceId TEXT,
    responderCardInstanceId TEXT,
    askerCardInstanceIdsJson TEXT,
    responderCardInstanceIdsJson TEXT,
    askerCoins INTEGER NOT NULL DEFAULT 0,
    responderCoins INTEGER NOT NULL DEFAULT 0,
    askerConfirmed INTEGER NOT NULL DEFAULT 0,
    responderConfirmed INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    completedAt TEXT
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_notifications (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    metadata TEXT,
    isRead INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_titles (
    userId TEXT NOT NULL,
    titleId TEXT NOT NULL,
    purchasedAt TEXT NOT NULL,
    PRIMARY KEY (userId, titleId)
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS arena_hall_of_fame (
    id TEXT PRIMARY KEY,
    month TEXT NOT NULL,
    entriesJson TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS twitch_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT UNIQUE NOT NULL,
    displayName TEXT NOT NULL,
    broadcasterId TEXT,
    profileImageUrl TEXT,
    addedBy TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS twitch_stream_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channelId INTEGER NOT NULL,
    startedAt TEXT NOT NULL,
    endedAt TEXT,
    durationMinutes INTEGER,
    source TEXT NOT NULL DEFAULT 'poller',
    createdAt TEXT NOT NULL,
    UNIQUE(channelId, startedAt)
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS twitch_predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channelId INTEGER NOT NULL,
    predictedAt TEXT NOT NULL,
    horizonHours INTEGER NOT NULL,
    nextStartAt TEXT,
    confidence REAL,
    actualStartedAt TEXT,
    createdAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS twitch_backfill_state (
    channelId INTEGER PRIMARY KEY,
    lastBackfilledAt TEXT,
    cursor TEXT
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS twitch_push_subscriptions (
    id TEXT PRIMARY KEY,
    userId TEXT,
    channelLogin TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    UNIQUE(endpoint, channelLogin)
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS user_videos (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    title TEXT,
    filename TEXT NOT NULL,
    mimeType TEXT NOT NULL,
    sizeBytes INTEGER NOT NULL DEFAULT 0,
    durationSeconds REAL,
    likes TEXT NOT NULL DEFAULT '[]',
    tags TEXT,
    createdAt TEXT NOT NULL
  )`,
  ).run();

  // Migration: idempotency key for social imports, so a backend restart between
  // "insert the row" and "poll the job" can't trigger a duplicate import.
  try {
    db.prepare(`ALTER TABLE user_videos ADD COLUMN importKey TEXT`).run();
  } catch { /* column already exists */ }

  // Migration: filename of the extracted first-frame poster (served from
  // /videos/ alongside the clip) so the player shows an opening still instead
  // of a black rectangle while the video buffers.
  try {
    db.prepare(`ALTER TABLE user_videos ADD COLUMN posterFilename TEXT`).run();
  } catch { /* column already exists */ }
  try {
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_videos_import_key
       ON user_videos (importKey) WHERE importKey IS NOT NULL`,
    ).run();
  } catch { /* index already exists */ }

  db.prepare(
    `CREATE TABLE IF NOT EXISTS user_video_comments (
    id TEXT PRIMARY KEY,
    videoId TEXT NOT NULL,
    userId TEXT NOT NULL,
    content TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS user_video_views (
    id TEXT PRIMARY KEY,
    videoId TEXT NOT NULL,
    userId TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )`,
  ).run();

  // Real-time inbox for the pixies feature: likes, comments, replies, and
  // moderation actions. Actor identity is denormalized so the inbox renders
  // without a join, and `preview` holds the comment/caption snippet.
  db.prepare(
    `CREATE TABLE IF NOT EXISTS pixie_notifications (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    type TEXT NOT NULL,
    actorId TEXT,
    actorUsername TEXT,
    actorAvatar TEXT,
    videoId TEXT,
    commentId TEXT,
    preview TEXT,
    isRead INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  )`,
  ).run();

  // Directed follow graph between users (follower → following). One row per
  // relationship; the composite primary key makes a duplicate follow a no-op.
  db.prepare(
    `CREATE TABLE IF NOT EXISTS user_follows (
    followerId TEXT NOT NULL,
    followingId TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    PRIMARY KEY (followerId, followingId)
  )`,
  ).run();

  // Generic Web Push subscriptions, keyed by an opaque `topic` string rather
  // than a feature-specific column — "blog:new-post", "qotd:new", and
  // "pixie:follows:<userId>" (one per account, fanned out on upload) all
  // live here. Twitch keeps its own dedicated `twitch_push_subscriptions`
  // table (unchanged) since it already shipped and has real subscriber rows.
  db.prepare(
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    userId TEXT,
    topic TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    UNIQUE(endpoint, topic)
  )`,
  ).run();

  // Durable queue for admin "download & import" jobs (TikTok / Instagram /
  // YouTube Shorts). Persisted so the admin can close or refresh the page and
  // the imports keep running, and so a backend restart can pick them back up
  // (`running` rows are reset to `queued` on boot; `importKey` dedupes the
  // resulting user_videos insert).
  db.prepare(
    `CREATE TABLE IF NOT EXISTS pixie_import_queue (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    platform TEXT,
    title TEXT,
    tags TEXT,
    username TEXT,
    avatarUrl TEXT,
    verified INTEGER NOT NULL DEFAULT 0,
    importKey TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    stage TEXT,
    message TEXT,
    progress REAL NOT NULL DEFAULT 0,
    error TEXT,
    videoId TEXT,
    enqueuedBy TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    startedAt TEXT,
    finishedAt TEXT
  )`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_pixie_import_queue_status
     ON pixie_import_queue (status, createdAt)`,
  ).run();

  // Creators whose newest TikTok clip is auto-imported on a timer (managed
  // from /admin/pixies). One row per handle; the scheduler polls each enabled
  // row and dedupes imports by the TikTok video id.
  db.prepare(
    `CREATE TABLE IF NOT EXISTS tiktok_feed_authors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    handle TEXT UNIQUE NOT NULL,
    displayName TEXT,
    avatarUrl TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    addedBy TEXT,
    lastCheckedAt TEXT,
    lastVideoId TEXT,
    lastStatus TEXT,
    lastError TEXT,
    importedCount INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_tiktok_feed_authors_enabled
     ON tiktok_feed_authors (enabled, lastCheckedAt)`,
  ).run();
}

function createTcgTables(db) {
  db.prepare(
    `CREATE TABLE IF NOT EXISTS tcg_games (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL DEFAULT 'queue',
    currentTurn INTEGER NOT NULL DEFAULT 0,
    currentPlayerId TEXT,
    player1Id TEXT NOT NULL,
    player2Id TEXT NOT NULL,
    player1Score INTEGER NOT NULL DEFAULT 0,
    player2Score INTEGER NOT NULL DEFAULT 0,
    winnerId TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS tcg_game_state (
    gameId TEXT PRIMARY KEY,
    stateJson TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS tcg_matchmaking (
    userId TEXT PRIMARY KEY,
    joinedAt TEXT NOT NULL
  )`,
  ).run();
}

// Real-user monitoring: Core Web Vitals samples and uncaught client errors,
// beaconed from the SPA by src/lib/telemetry.ts. Both tables are append-only
// and pruned to a 30-day window by routes/telemetry.js.
function createTelemetryTables(db) {
  db.prepare(
    `CREATE TABLE IF NOT EXISTS client_vitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receivedAt TEXT NOT NULL,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    rating TEXT,
    navigationType TEXT,
    path TEXT,
    connection TEXT,
    ua TEXT
  )`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_client_vitals_receivedAt
     ON client_vitals (receivedAt)`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_client_vitals_metric
     ON client_vitals (metric, receivedAt)`,
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS client_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receivedAt TEXT NOT NULL,
    kind TEXT NOT NULL,
    message TEXT,
    stack TEXT,
    source TEXT,
    lineno INTEGER,
    colno INTEGER,
    path TEXT,
    ua TEXT
  )`,
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_client_errors_receivedAt
     ON client_errors (receivedAt)`,
  ).run();
}

function ensureColumn(db, table, column, definition) {
  try {
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    const found = info.some((row) => row.name === column);
    if (!found) {
      db.prepare(
        `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`,
      ).run();
    }
  } catch {
    // Keep startup resilient if a migration step fails.
  }
}

function migrateLuckToEffectHit(db) {
  try {
    const info = db.prepare("PRAGMA table_info(arena_profiles)").all();
    const hasEffectHit = info.some((row) => row.name === "effectHit");
    const hasLuck = info.some((row) => row.name === "luck");
    if (hasEffectHit && hasLuck) {
      db.prepare("UPDATE arena_profiles SET effectHit = luck WHERE luck IS NOT NULL AND (effectHit = 3 OR effectHit IS NULL)").run();
    }
  } catch {
    // resilient
  }
}

// improve.md §8: weapon/armor main stats moved from flat power/guard to the
// percentage stats dmgPct/defendPct. Remap any legacy pieces once, rescaling the
// value onto the new roll range (power 1-10 -> dmgPct 6-14, guard 1-10 -> defendPct 8-18).
function migrateEquipmentMainStats(db) {
  try {
    const info = db.prepare("PRAGMA table_info(arena_equipment_pieces)").all();
    if (!info.some((row) => row.name === "mainStatType")) return;
    const legacy = db
      .prepare(
        `SELECT id, slot, mainStatType, mainStatValue
         FROM arena_equipment_pieces
         WHERE mainStatType IN ('power', 'guard', 'hp')`,
      )
      .all();
    if (legacy.length === 0) return;
    const update = db.prepare(
      "UPDATE arena_equipment_pieces SET mainStatType = ?, mainStatValue = ? WHERE id = ?",
    );
    const remap = db.transaction((rows) => {
      for (const row of rows) {
        const old = Number(row.mainStatValue) || 0;
        let type;
        let value;
        if (row.slot === "armor" || row.mainStatType === "guard") {
          type = "defendPct";
          value = Math.round(8 + Math.min(Math.max((old - 1) / 9, 0), 1) * 10);
        } else {
          type = "dmgPct";
          value = Math.round(6 + Math.min(Math.max((old - 1) / 9, 0), 1) * 8);
        }
        update.run(type, value, row.id);
      }
    });
    remap(legacy);
  } catch {
    // resilient
  }
}

// improve.md §9 follow-up: the card "element" trait was renamed from the six
// classic elements to six Combat Styles. Remap it inside every stored card JSON
// blob. Plain string swaps on the serialised JSON — idempotent (the WHERE skips
// rows that are already migrated).
const ELEMENT_TO_STYLE = {
  Fire: "Might",
  Water: "Swift",
  Earth: "Ward",
  Wind: "Ruse",
  Light: "Surge",
  Dark: "Skill",
};

function migrateElementsToStyles(db) {
  const targets = [
    ["arena_card_collection", "cardJson"],
    ["arena_profiles", "selectedCardJson"],
    ["arena_market_listings", "cardJson"],
    ["arena_trade_listings", "cardJson"],
    ["arena_trade_listings", "wantedCardJson"],
  ];
  const oldValues = Object.keys(ELEMENT_TO_STYLE);
  for (const [table, column] of targets) {
    try {
      let replaceExpr = column;
      for (const [oldValue, newValue] of Object.entries(ELEMENT_TO_STYLE)) {
        replaceExpr = `REPLACE(${replaceExpr}, '"element":"${oldValue}"', '"element":"${newValue}"')`;
      }
      const whereClause = oldValues
        .map((v) => `${column} LIKE '%"element":"${v}"%'`)
        .join(" OR ");
      db.prepare(
        `UPDATE ${table} SET ${column} = ${replaceExpr} WHERE ${whereClause}`,
      ).run();
    } catch {
      // Table/column may not exist in every environment — keep startup resilient.
    }
  }
}

// improve.md §11: the equipment sub-stat type `crit` was renamed to `critRate`
// long ago; new rolls only ever emit `critRate` and `SUB_STAT_POOL` no longer
// lists `crit`. Rewrite the remaining legacy rows once so the read-time alias in
// equipment.js can be retired. `subStats` is a JSON array of {type,value}; the
// closing quote in `"type":"crit"` keeps the swap off `critRate`/`critDmg`.
function migrateCritSubStatAlias(db) {
  try {
    const info = db.prepare("PRAGMA table_info(arena_equipment_pieces)").all();
    if (info.length === 0) return;
    if (info.some((row) => row.name === "mainStatType")) {
      db.prepare(
        "UPDATE arena_equipment_pieces SET mainStatType = 'critRate' WHERE mainStatType = 'crit'",
      ).run();
    }
    if (info.some((row) => row.name === "subStats")) {
      db.prepare(
        `UPDATE arena_equipment_pieces
         SET subStats = REPLACE(subStats, '"type":"crit"', '"type":"critRate"')
         WHERE subStats LIKE '%"type":"crit"%'`,
      ).run();
    }
  } catch {
    // resilient
  }
}

// Arena updates carry a monotonic `updateNumber` (0-based) that renders as a
// version tag "v1.0.<n>" on the Arena home page. Number any rows that predate the
// column in chronological order, continuing past whatever is already assigned so
// numbers stay stable even when older updates are deleted.
function backfillArenaUpdateNumbers(db) {
  try {
    const info = db.prepare("PRAGMA table_info(arena_updates)").all();
    if (!info.some((row) => row.name === "updateNumber")) return;
    const pending = db
      .prepare(
        `SELECT id FROM arena_updates
         WHERE updateNumber IS NULL
         ORDER BY createdAt ASC, rowid ASC`,
      )
      .all();
    if (pending.length === 0) return;
    const { m } = db
      .prepare("SELECT MAX(updateNumber) AS m FROM arena_updates")
      .get();
    let next = Number.isFinite(m) ? m + 1 : 0;
    const assign = db.prepare("UPDATE arena_updates SET updateNumber = ? WHERE id = ?");
    db.transaction((rows) => {
      for (const row of rows) assign.run(next++, row.id);
    })(pending);
  } catch {
    // resilient — the column may not exist in every environment
  }
}

function ensureColumns(db) {
  ensureColumn(db, "posts", "shortDescription", "TEXT");
  ensureColumn(db, "posts", "thumbnail", "TEXT");
  ensureColumn(db, "posts", "tags", "TEXT");
  ensureColumn(db, "posts", "likes", "TEXT");
  ensureColumn(db, "posts", "comments", "TEXT");
  ensureColumn(db, "posts", "updatedAt", "TEXT");
  ensureColumn(db, "posts", "series", "TEXT");
  ensureColumn(db, "posts", "audioUrl", "TEXT");

  ensureColumn(db, "users", "bio", "TEXT");
  ensureColumn(db, "users", "banner", "TEXT");
  ensureColumn(db, "users", "location", "TEXT");
  ensureColumn(db, "users", "website", "TEXT");
  ensureColumn(db, "users", "discordId", "TEXT");
  // Verified badge for placeholder authors created from a verified
  // TikTok/Instagram account by an admin import.
  ensureColumn(db, "users", "verified", "INTEGER NOT NULL DEFAULT 0");

  // Session rows are keyed by sha256(token); createdAt/expiresAt give them a
  // server-side lifetime. Rows predating these columns have NULL expiresAt
  // and are swept on the next pass (their plaintext-token key can no longer
  // be matched anyway).
  ensureColumn(db, "sessions", "createdAt", "TEXT");
  ensureColumn(db, "sessions", "expiresAt", "TEXT");

  ensureColumn(db, "user_videos", "tags", "TEXT");
  // Frame size of the stored delivery rendition, filled in by the upload /
  // import pipeline and the normalize backfill. Used for the video SEO card
  // (og:video:width/height) and to reason about the encode ladder.
  ensureColumn(db, "user_videos", "width", "INTEGER");
  ensureColumn(db, "user_videos", "height", "INTEGER");

  ensureColumn(
    db,
    "user_video_comments",
    "likes",
    "TEXT NOT NULL DEFAULT '[]'",
  );
  ensureColumn(db, "user_video_comments", "parentId", "TEXT");

  ensureColumn(db, "guestbook_entries", "x", "INTEGER");
  ensureColumn(db, "guestbook_entries", "y", "INTEGER");

  ensureColumn(db, "daily_questions", "lockedAt", "TEXT");
  ensureColumn(db, "daily_questions", "archivedAt", "TEXT");
  ensureColumn(db, "daily_questions", "discordNotifiedAt", "TEXT");
  ensureColumn(db, "daily_questions", "pushNotifiedAt", "TEXT");
  // The queue slot a carried-forward question originally came from. A question
  // stays live until answered; when it crosses a UTC day boundary unanswered its
  // row is re-dated to the current day and the queue behind it shifts forward
  // (see lib/question-of-the-day-active.js), so `recordedDate` is always the day
  // the question is shown/archived under. This column remembers the origin so
  // the UI can still say "still waiting for an answer" without printing the old
  // date. NULL = never carried.
  ensureColumn(db, "daily_questions", "carriedFromRecordedDate", "TEXT");

  ensureColumn(db, "shrine_pages", "description", "TEXT");
  ensureColumn(db, "shrine_pages", "excerpt", "TEXT");
  ensureColumn(db, "shrine_pages", "image", "TEXT");
  ensureColumn(db, "shrine_pages", "imageAlt", "TEXT");
  ensureColumn(db, "shrine_pages", "schemaType", "TEXT");
  ensureColumn(db, "shrine_pages", "aboutJson", "TEXT");
  ensureColumn(db, "shrine_pages", "keywordsJson", "TEXT");
  ensureColumn(db, "shrine_pages", "ctaLabel", "TEXT");
  ensureColumn(db, "shrine_pages", "priority", "TEXT");
  ensureColumn(db, "shrine_pages", "changefreq", "TEXT");
  ensureColumn(db, "shrine_pages", "payloadJson", "TEXT");
  ensureColumn(db, "shrine_pages", "updatedAt", "TEXT");

  ensureColumn(db, "arena_trade_listings", "note", "TEXT");
  ensureColumn(db, "arena_trade_listings", "wantedCardJson", "TEXT");
  ensureColumn(db, "arena_notifications", "metadata", "TEXT");
  ensureColumn(db, "arena_trade_requests", "listingId", "TEXT");

  ensureColumn(db, "arena_trade_sessions", "askerCoins", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "arena_trade_sessions", "responderCoins", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "arena_trade_sessions", "askerCardInstanceIdsJson", "TEXT");
  ensureColumn(db, "arena_trade_sessions", "responderCardInstanceIdsJson", "TEXT");

  ensureColumn(db, "arena_profiles", "level", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "arena_profiles", "xp", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "arena_profiles", "coins", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "arena_profiles", "wins", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "arena_profiles", "losses", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "arena_profiles", "winStreak", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "arena_profiles", "hp", "INTEGER NOT NULL DEFAULT 120");
  ensureColumn(db, "arena_profiles", "power", "INTEGER NOT NULL DEFAULT 12");
  ensureColumn(db, "arena_profiles", "guard", "INTEGER NOT NULL DEFAULT 12");
  ensureColumn(db, "arena_profiles", "speed", "INTEGER NOT NULL DEFAULT 10");
  ensureColumn(db, "arena_profiles", "effectHit", "INTEGER NOT NULL DEFAULT 3");
  migrateLuckToEffectHit(db);
  ensureColumn(
    db,
    "arena_profiles",
    "lifetimeCoinsEarned",
    "INTEGER NOT NULL DEFAULT 0",
  );
  ensureColumn(db, "arena_profiles", "eloRating", "INTEGER NOT NULL DEFAULT 1000");
  ensureColumn(db, "arena_profiles", "eloMatches", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "arena_profiles", "peakElo", "INTEGER NOT NULL DEFAULT 1000");
  ensureColumn(db, "arena_profiles", "selectedCardJson", "TEXT");
  ensureColumn(db, "arena_profiles", "lastCardDrawDate", "TEXT");
  ensureColumn(db, "arena_profiles", "dailyCardDrawCount", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "arena_profiles", "catalogVersion", "TEXT NOT NULL DEFAULT 'v1'");
  ensureColumn(db, "arena_profiles", "effectsJson", "TEXT");
  ensureColumn(db, "arena_profiles", "lastFightAt", "TEXT");
  ensureColumn(db, "arena_profiles", "dailyOpponentCount", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "arena_profiles", "lastOpponentDate", "TEXT");
  ensureColumn(db, "arena_profiles", "createdAt", "TEXT");
  ensureColumn(db, "arena_profiles", "updatedAt", "TEXT");
  ensureColumn(db, "arena_profiles", "tutorialComplete", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "arena_profiles", "defensiveWins", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "arena_profiles", "defensiveLosses", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "arena_profiles", "lastSkillResetAt", "TEXT");
  ensureColumn(db, "arena_profiles", "activeTitleId", "TEXT");
  ensureColumn(db, "arena_profiles", "loginStreak", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "arena_profiles", "lastLoginDate", "TEXT");
  ensureColumn(db, "arena_equipment_pieces", "enhancementLevel", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "arena_equipment_pieces", "setId", "TEXT");
  ensureColumn(db, "arena_equipment_pieces", "subStatBonuses", "TEXT");
  migrateEquipmentMainStats(db);
  migrateElementsToStyles(db);
  migrateCritSubStatAlias(db);
  ensureColumn(db, "arena_updates", "updateNumber", "INTEGER");
  backfillArenaUpdateNumbers(db);
  // Card snapshots for replay links (suggestion #17 follow-up) — nullable so
  // fights recorded before this shipped just render without card art.
  ensureColumn(db, "arena_fights", "playerCardJson", "TEXT");
  ensureColumn(db, "arena_fights", "opponentCardJson", "TEXT");
  ensureColumn(db, "arena_card_collection", "isFavorite", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "arena_card_affinity", "fights", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "arena_card_affinity", "wins", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "arena_card_affinity", "affinityLevel", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "arena_card_affinity", "createdAt", "TEXT");
  ensureColumn(db, "arena_card_affinity", "updatedAt", "TEXT");

  ensureColumn(db, "arena_mal_card_pool", "favorites", "INTEGER");
  ensureColumn(db, "arena_compensations", "message", "TEXT");
  ensureColumn(db, "arena_compensations", "payloadJson", "TEXT");
  ensureColumn(db, "arena_compensations", "recipientCount", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "arena_compensation_claims", "claimedAt", "TEXT");

  ensureColumn(db, "twitch_channels", "lastGameName", "TEXT");
  ensureColumn(db, "twitch_channels", "lastViewerCount", "INTEGER");
}

function createIndexes(db) {
  try {
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_posts_userId ON posts(userId)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_posts_createdAt ON posts(createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId)`,
    ).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_anime_ord ON anime(ord)`).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_myanimelist_anime_snapshots_fetchedAt ON myanimelist_anime_snapshots(fetchedAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_quote_snapshots_fetchedAt ON quote_snapshots(fetchedAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_guestbook_entries_createdAt ON guestbook_entries(createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_guestbook_entries_userId ON guestbook_entries(userId, createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_daily_questions_updatedAt ON daily_questions(updatedAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_site_changelog_entryDate ON site_changelog(entryDate DESC, createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_daily_question_answers_recordedDate_createdAt ON daily_question_answers(recordedDate, createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_question_answers_identity ON daily_question_answers(recordedDate, identityType, identityKey)`,
    ).run();
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_shrine_pages_path ON shrine_pages(path)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_profiles_level ON arena_profiles(level DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_profiles_coins ON arena_profiles(coins DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_profiles_updatedAt ON arena_profiles(updatedAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_profiles_elo ON arena_profiles(eloRating DESC, eloMatches DESC, peakElo DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_inventory_userId ON arena_inventory(userId)`,
    ).run();
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_arena_inventory_user_item ON arena_inventory(userId, itemId)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_eq_pieces_user ON arena_equipment_pieces(userId)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_eq_pieces_equipped ON arena_equipment_pieces(userId, slot, equipped)`,
    ).run();
    db.prepare(
      `DROP TABLE IF EXISTS arena_equipment`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_loadouts_user ON arena_equipment_loadouts(userId)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_skill_allocations_userId ON arena_skill_allocations(userId)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_titles_userId ON arena_titles(userId)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_fights_userId_createdAt ON arena_fights(userId, createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_card_collection_userId_createdAt ON arena_card_collection(userId, createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_arena_card_collection_user_card_instance ON arena_card_collection(userId, cardInstanceId)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_card_affinity_user_level ON arena_card_affinity(userId, affinityLevel DESC, fights DESC)`,
    ).run();
    db.prepare("DROP INDEX IF EXISTS idx_arena_daily_card_offers_date_slot").run();
    db.prepare("DROP INDEX IF EXISTS idx_arena_daily_card_offers_date_malId").run();
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_arena_daily_card_offers_user_date_slot ON arena_daily_card_offers(userId, offerDate, slot)`,
    ).run();
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_arena_daily_card_offers_user_date_malId ON arena_daily_card_offers(userId, offerDate, malId)`,
    ).run();
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_arena_daily_card_purchases_user_offer ON arena_daily_card_purchases(userId, offerId)`,
    ).run();
    db.prepare(
      `DELETE FROM arena_daily_card_purchases
       WHERE rowid NOT IN (
         SELECT MIN(rowid)
         FROM arena_daily_card_purchases
         GROUP BY offerId
       )`,
    ).run();
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_arena_daily_card_purchases_offer ON arena_daily_card_purchases(offerId)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_daily_card_purchases_user_date ON arena_daily_card_purchases(userId, offerDate)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_market_active_created ON arena_market_listings(status, createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_market_seller_status ON arena_market_listings(sellerUserId, status, createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_market_sales_average ON arena_market_listings(status, malId, ivBand, soldAt DESC)`,
    ).run();
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_arena_market_active_card ON arena_market_listings(cardInstanceId) WHERE status = 'active'`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_updates_createdAt ON arena_updates(createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_compensations_createdAt ON arena_compensations(createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_arena_comp_claim_user_comp ON arena_compensation_claims(userId, compensationId)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_comp_claim_user_claimed ON arena_compensation_claims(userId, claimedAt)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_trade_listings_active_created ON arena_trade_listings(status, createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_trade_listings_user_status ON arena_trade_listings(userId, status, createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_arena_trade_listings_active_card ON arena_trade_listings(cardInstanceId) WHERE status = 'active'`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_trade_requests_responder ON arena_trade_requests(responderId, status, createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_trade_requests_asker ON arena_trade_requests(askerId, status, createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_trade_sessions_participants ON arena_trade_sessions(askerId, responderId, status)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_notifications_user_unread ON arena_notifications(userId, isRead, createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arena_mal_card_pool_fetchedAt ON arena_mal_card_pool(fetchedAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_twitch_stream_events_channel_started ON twitch_stream_events(channelId, startedAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_twitch_predictions_channel_predicted ON twitch_predictions(channelId, predictedAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_twitch_push_subs_channel ON twitch_push_subscriptions(channelLogin)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_user_videos_createdAt ON user_videos(createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_user_videos_userId ON user_videos(userId, createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_user_video_comments_videoId ON user_video_comments(videoId, createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_user_video_comments_userId ON user_video_comments(userId, createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_video_views_user_video ON user_video_views(userId, videoId)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_pixie_notifications_user_unread ON pixie_notifications(userId, isRead, createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows(followingId, createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(followerId, createdAt DESC)`,
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_push_subscriptions_topic ON push_subscriptions(topic)`,
    ).run();
  } catch {
    // Startup should continue even if index creation fails.
  }
}

function initializeSchema(db) {
  createBaseTables(db);
  createTcgTables(db);
  createTelemetryTables(db);
  ensureColumns(db);
  createIndexes(db);
  initializeSearchIndex(db);
}

ensureDbDirectoryExists(DB_FILE);
const db = new Database(DB_FILE);
configurePragmas(db);
initializeSchema(db);

module.exports = {
  db,
  configurePragmas,
  createBaseTables,
  createIndexes,
  createTcgTables,
  createTelemetryTables,
  ensureColumns,
  initializeSchema,
};
