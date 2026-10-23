const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const { initializeSchema } = require("../lib/db");
const {
  addAuthor,
  buildImportKey,
  getAuthorByHandle,
  isValidHandle,
  listAuthors,
  pollTikTokFeedOnce,
  removeAuthor,
  seedAuthorsFromEnv,
  updateAuthor,
} = require("../lib/tiktok-feed-scheduler");

function createTestDb() {
  const db = new Database(":memory:");
  initializeSchema(db);
  return db;
}

const silent = { log() {}, warn() {}, error() {} };

// Mirrors what fetchFirstTikTokProfileVideo actually returns (the normalized
// resolver shape, not a raw TikTok item_list entry).
function buildFeedItem(overrides = {}) {
  const videoId = overrides.videoId || "7682726244105882900";
  return {
    videoId,
    handle: "coolcreator",
    username: "Cool Creator",
    caption: "cat video #cats #funny",
    durationSeconds: 8,
    url: `https://www.tiktok.com/@coolcreator/video/${videoId}`,
    tags: ["cats", "funny"],
    avatarUrl: "https://p16-common-sign.tiktokcdn.com/avatar.jpeg",
    verified: false,
    ...overrides,
  };
}

// Offline stand-in for the yt-dlp resolver: each handle maps to the item
// returned for it; a handle mapped to "throw" simulates a failure, and an
// absent handle simulates "no video found".
function makeResolver(byHandle, calls = []) {
  const resolver = async (handle) => {
    calls.push(handle);
    const entry = byHandle[handle];
    if (entry === "throw") throw new Error(`boom ${handle}`);
    if (!entry) return { error: `no video for ${handle}` };
    return { item: entry };
  };
  resolver.calls = calls;
  return resolver;
}

function createFakeQueue() {
  const queued = [];
  return {
    queued,
    enqueue: (params) => {
      queued.push(params);
      return { id: `imq_${queued.length}` };
    },
    list: () => [],
  };
}

test("isValidHandle accepts real TikTok handles and rejects junk", () => {
  assert.equal(isValidHandle("mira"), true);
  assert.equal(isValidHandle("mira_01"), true);
  assert.equal(isValidHandle("cool.creator"), true);
  assert.equal(isValidHandle("a"), false, "too short");
  assert.equal(isValidHandle("has space"), false);
  assert.equal(isValidHandle("has/slash"), false);
  assert.equal(isValidHandle("https://tiktok.com/@mira"), false);
  assert.equal(isValidHandle(""), false);
});

test("addAuthor normalizes the handle and rejects duplicates", () => {
  const db = createTestDb();
  const added = addAuthor(db, { handle: "@CoolCreator", addedBy: "u1" });
  assert.equal(added.author.handle, "coolcreator");
  assert.equal(added.author.enabled, 1);

  assert.equal(addAuthor(db, { handle: "coolcreator" }).error, "already-tracked");
  assert.equal(addAuthor(db, { handle: "@COOLCREATOR" }).error, "already-tracked");
  assert.equal(addAuthor(db, { handle: "bad handle!" }).error, "invalid-handle");
  assert.equal(listAuthors(db).length, 1);
});

test("updateAuthor toggles enabled and updates cached profile fields", () => {
  const db = createTestDb();
  const { author } = addAuthor(db, { handle: "coolcreator" });

  const paused = updateAuthor(db, author.id, { enabled: false });
  assert.equal(paused.author.enabled, 0);
  assert.equal(listAuthors(db, { enabledOnly: true }).length, 0);

  const resumed = updateAuthor(db, author.id, {
    enabled: true,
    displayName: "Cool Creator",
    avatarUrl: "https://cdn/avatar.jpeg",
  });
  assert.equal(resumed.author.enabled, 1);
  assert.equal(resumed.author.displayName, "Cool Creator");
  assert.equal(listAuthors(db, { enabledOnly: true }).length, 1);

  assert.equal(updateAuthor(db, 99999, { enabled: false }).error, "not-found");
});

test("removeAuthor deletes the row", () => {
  const db = createTestDb();
  const { author } = addAuthor(db, { handle: "coolcreator" });

  assert.equal(removeAuthor(db, author.id).ok, true);
  assert.equal(getAuthorByHandle(db, "coolcreator"), undefined);
  assert.equal(removeAuthor(db, author.id).error, "not-found");
});

test("buildImportKey namespaces the TikTok video id", () => {
  assert.equal(buildImportKey("123"), "tiktok-feed:123");
  assert.equal(buildImportKey(""), null);
  assert.equal(buildImportKey(undefined), null);
});

test("pollTikTokFeedOnce imports the newest clip for every enabled author", async (t) => {
  const db = createTestDb();
  addAuthor(db, { handle: "first" });
  addAuthor(db, { handle: "second" });

  const first = buildFeedItem({ videoId: "111111111111111111", desc: "from first" });
  const second = buildFeedItem({ videoId: "222222222222222222", desc: "from second" });
  const resolver = makeResolver({ first, second });

  const queue = createFakeQueue();
  const result = await pollTikTokFeedOnce({
    db,
    importQueue: queue,
    logger: silent,
    resolveAuthor: resolver,
  });

  assert.equal(result.ok, true);
  assert.equal(result.checked, 2);
  assert.equal(result.queued, 2);
  assert.equal(queue.queued.length, 2);

  const keys = queue.queued.map((entry) => entry.importKey).sort();
  assert.deepEqual(keys, ["tiktok-feed:111111111111111111", "tiktok-feed:222222222222222222"]);
  for (const entry of queue.queued) {
    assert.equal(entry.platform, "tiktok");
  }
});

test("pollTikTokFeedOnce skips disabled authors", async (t) => {
  const db = createTestDb();
  const { author } = addAuthor(db, { handle: "paused" });
  updateAuthor(db, author.id, { enabled: false });
  addAuthor(db, { handle: "active" });

  const calls = [];
  const resolver = makeResolver(
    {
      active: buildFeedItem({ videoId: "333333333333333333" }),
      paused: buildFeedItem({ videoId: "444444444444444444" }),
    },
    calls,
  );

  const queue = createFakeQueue();
  const result = await pollTikTokFeedOnce({
    db,
    importQueue: queue,
    logger: silent,
    resolveAuthor: resolver,
  });

  assert.equal(result.checked, 1);
  assert.deepEqual(calls, ["active"]);
  assert.equal(queue.queued.length, 1);
});

test("pollTikTokFeedOnce does not re-queue a clip that is still the newest", async (t) => {
  const db = createTestDb();
  addAuthor(db, { handle: "steady" });
  const resolver = makeResolver({ steady: buildFeedItem({ videoId: "555555555555555555" }) });

  const queue = createFakeQueue();
  const firstRun = await pollTikTokFeedOnce({
    db,
    importQueue: queue,
    logger: silent,
    resolveAuthor: resolver,
  });
  assert.equal(firstRun.queued, 1);
  assert.equal(queue.queued.length, 1);

  // Same newest video on the next tick: nothing new to import.
  const secondRun = await pollTikTokFeedOnce({
    db,
    importQueue: queue,
    logger: silent,
    resolveAuthor: resolver,
  });
  assert.equal(secondRun.checked, 1);
  assert.equal(secondRun.queued, 0);
  assert.equal(secondRun.results[0].skipped, "already-imported");
  assert.equal(queue.queued.length, 1, "no duplicate download for the same clip");
  assert.equal(getAuthorByHandle(db, "steady").importedCount, 1);
});

test("pollTikTokFeedOnce imports a brand new clip for the same author", async () => {
  const db = createTestDb();
  addAuthor(db, { handle: "prolific" });

  const queue = createFakeQueue();
  const first = makeResolver({ prolific: buildFeedItem({ videoId: "666666666666666666" }) });
  await pollTikTokFeedOnce({
    db,
    importQueue: queue,
    logger: silent,
    resolveAuthor: first,
  });

  // The creator posts again: a new video id shows up on top.
  const second = makeResolver({ prolific: buildFeedItem({ videoId: "777777777777777777" }) });
  const run = await pollTikTokFeedOnce({
    db,
    importQueue: queue,
    logger: silent,
    resolveAuthor: second,
  });

  assert.equal(run.queued, 1);
  assert.equal(queue.queued.length, 2);
  assert.equal(queue.queued[1].importKey, "tiktok-feed:777777777777777777");
});

test("pollTikTokFeedOnce records a per-author error and keeps polling others", async () => {
  const db = createTestDb();
  addAuthor(db, { handle: "broken" });
  addAuthor(db, { handle: "healthy" });
  const resolver = makeResolver({
    broken: "throw",
    healthy: buildFeedItem({ videoId: "888888888888888888" }),
  });

  const queue = createFakeQueue();
  const result = await pollTikTokFeedOnce({
    db,
    importQueue: queue,
    logger: silent,
    resolveAuthor: resolver,
  });

  assert.equal(result.checked, 2);
  assert.equal(result.queued, 1);
  assert.equal(result.failed, 1);
  assert.equal(queue.queued.length, 1, "one bad author must not block the rest");

  const broken = getAuthorByHandle(db, "broken");
  assert.equal(broken.lastStatus, "error");
  assert.match(broken.lastError, /boom broken/);
  assert.equal(broken.importedCount, 0);

  const healthy = getAuthorByHandle(db, "healthy");
  assert.equal(healthy.lastStatus, "imported");
  assert.equal(healthy.lastVideoId, "888888888888888888");
  assert.equal(healthy.importedCount, 1);
});

test("pollTikTokFeedOnce reports no-authors without failing", async () => {
  const db = createTestDb();
  const queue = createFakeQueue();
  const result = await pollTikTokFeedOnce({ db, importQueue: queue, logger: silent });

  assert.equal(result.ok, true);
  assert.equal(result.checked, 0);
  assert.equal(result.skipped, "no-authors");
});

test("pollAuthorOnce retries once when the first resolve flakes", async () => {
  const db = createTestDb();
  const { author } = addAuthor(db, { handle: "flaky" });

  let attempts = 0;
  const resolver = async () => {
    attempts += 1;
    if (attempts === 1) return { error: "transient extraction failure" };
    return { item: buildFeedItem({ videoId: "999999999999999999" }) };
  };

  const queue = createFakeQueue();
  const result = await pollTikTokFeedOnce({
    db,
    importQueue: queue,
    logger: silent,
    resolveAuthor: resolver,
  });

  assert.equal(attempts, 2, "the flake gets exactly one retry");
  assert.equal(result.queued, 1, "the retry salvages the import");
  assert.equal(getAuthorByHandle(db, "flaky").lastStatus, "imported");
});

test("pollAuthorOnce keeps the first error when the retry also fails", async () => {
  const db = createTestDb();
  const { author } = addAuthor(db, { handle: "broken" });

  let attempts = 0;
  const resolver = async () => {
    attempts += 1;
    return { error: attempts === 1 ? "first failure" : "second failure" };
  };

  const queue = createFakeQueue();
  await pollTikTokFeedOnce({
    db,
    importQueue: queue,
    logger: silent,
    resolveAuthor: resolver,
  });

  assert.equal(attempts, 2);
  assert.equal(queue.queued.length, 0);
  // The first error is the informative one, so that is what the page shows.
  assert.equal(getAuthorByHandle(db, "broken").lastError, "first failure");
});

test("pollTikTokFeedOnce refuses to run without a database or queue", async () => {
  assert.equal((await pollTikTokFeedOnce({})).error, "no-database");
  const noQueue = await pollTikTokFeedOnce({ db: createTestDb(), importQueue: null });
  assert.equal(noQueue.error, "import-queue-unavailable");
});

test("pollTikTokFeedOnce rotates a limited batch across ticks", async () => {
  const db = createTestDb();
  for (const handle of ["a1", "a2", "a3"]) {
    addAuthor(db, { handle });
  }

  const calls = [];
  const resolver = makeResolver(
    {
      a1: buildFeedItem({ videoId: "100000000000000001" }),
      a2: buildFeedItem({ videoId: "100000000000000002" }),
      a3: buildFeedItem({ videoId: "100000000000000003" }),
    },
    calls,
  );

  const queue = createFakeQueue();
  const first = await pollTikTokFeedOnce({
    db,
    importQueue: queue,
    logger: silent,
    batchSize: 2,
    resolveAuthor: resolver,
  });
  assert.equal(first.checked, 2);
  assert.equal(first.total, 3);

  const second = await pollTikTokFeedOnce({
    db,
    importQueue: queue,
    logger: silent,
    batchSize: 2,
    resolveAuthor: resolver,
  });
  assert.equal(second.checked, 2);

  // Across the two ticks every author must have been visited at least once.
  assert.deepEqual([...new Set(calls)].sort(), ["a1", "a2", "a3"]);
});

test("seedAuthorsFromEnv imports TIKTOK_FEED_AUTHOR comma lists once", () => {
  const db = createTestDb();
  const original = process.env.TIKTOK_FEED_AUTHOR;
  process.env.TIKTOK_FEED_AUTHOR = "@alpha, beta ,gamma";
  try {
    assert.equal(seedAuthorsFromEnv(db, silent), 3);
    assert.deepEqual(
      listAuthors(db).map((row) => row.handle).sort(),
      ["alpha", "beta", "gamma"],
    );
    // Re-running must not duplicate or throw.
    assert.equal(seedAuthorsFromEnv(db, silent), 0);
    assert.equal(listAuthors(db).length, 3);
  } finally {
    if (original === undefined) delete process.env.TIKTOK_FEED_AUTHOR;
    else process.env.TIKTOK_FEED_AUTHOR = original;
  }
});
