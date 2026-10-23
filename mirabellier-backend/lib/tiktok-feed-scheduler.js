// Auto-import the newest video from each tracked TikTok creator, on a timer.
//
// Creators live in the `tiktok_feed_authors` table and are managed from the
// admin Pixies page. TikTok signature-gates its recommend feed and answers
// plain fetches with an empty body or a SlardarWAF challenge page, so the
// anonymous home feed is not usable — each author is resolved through yt-dlp
// (lib/social.js), which negotiates both.
//
// Each tick polls a rotating batch of authors (so a long list does not turn
// into one enormous request burst) and hands new clips to the durable Pixies
// import queue. `importKey` is the TikTok video id, so a clip that stays on
// top of a profile is only ever imported once.

const {
  fetchFirstTikTokProfileVideo,
} = require("./social");

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;
const DEFAULT_BATCH_SIZE = 5;
// A creator posting all day should not flood the queue; cap what one tick can
// enqueue per author (we only ever look at the newest clip anyway).
const AUTHORS_BATCH_MAX = 25;

let pollTimer = null;
let pollingPromise = null;
// Index of the next author to start from, so a big list is covered evenly
// across ticks instead of always hammering the first N rows.
let rotationCursor = 0;

function readPollIntervalMs() {
  const seconds = Number(process.env.TIKTOK_FEED_INTERVAL_SECONDS);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.max(MIN_INTERVAL_MS, Math.floor(seconds) * 1000);
  }
  return DEFAULT_INTERVAL_MS;
}

function readBatchSize() {
  const raw = Number(process.env.TIKTOK_FEED_BATCH_SIZE);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.min(AUTHORS_BATCH_MAX, Math.floor(raw));
  }
  return DEFAULT_BATCH_SIZE;
}

function isDisabled() {
  const raw = String(process.env.TIKTOK_FEED_DISABLED || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function buildImportKey(videoId) {
  return videoId ? `tiktok-feed:${videoId}` : null;
}

// Optional: TIKTOK_FEED_AUTHOR=mira,hunter — seeded into the table on boot so
// an existing deployment keeps working without touching the admin page.
function readEnvAuthorHandles() {
  return String(process.env.TIKTOK_FEED_AUTHOR || "")
    .split(",")
    .map((entry) => entry.trim().replace(/^@/, ""))
    .filter(Boolean);
}

// ── Author store ─────────────────────────────────────────────────────────
// Kept in a small module so both the scheduler and the admin routes share one
// implementation. `db` is passed in on every call (tests use :memory:).

function normalizeHandle(raw) {
  return String(raw || "").trim().replace(/^@/, "");
}

function isValidHandle(handle) {
  // TikTok handles are letters/digits/underscore/dot, 2-24 chars. The dot is
  // allowed for legacy handles; anything else would be a malformed URL.
  return /^[a-zA-Z0-9_.]{2,24}$/.test(handle);
}

function listAuthors(db, { enabledOnly = false } = {}) {
  const where = enabledOnly ? "WHERE enabled = 1" : "";
  return db
    .prepare(
      `SELECT * FROM tiktok_feed_authors ${where}
       ORDER BY enabled DESC, lastCheckedAt IS NOT NULL, lastCheckedAt ASC, handle ASC`,
    )
    .all();
}

function getAuthorByHandle(db, handle) {
  return db
    .prepare("SELECT * FROM tiktok_feed_authors WHERE handle = ?")
    .get(normalizeHandle(handle).toLowerCase());
}

function getAuthorById(db, id) {
  return db.prepare("SELECT * FROM tiktok_feed_authors WHERE id = ?").get(id);
}

function addAuthor(db, { handle, displayName, avatarUrl, addedBy } = {}) {
  const clean = normalizeHandle(handle).toLowerCase();
  if (!isValidHandle(clean)) return { error: "invalid-handle" };
  if (getAuthorByHandle(db, clean)) return { error: "already-tracked" };

  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO tiktok_feed_authors
         (handle, displayName, avatarUrl, enabled, addedBy, createdAt, updatedAt)
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
    )
    .run(
      clean,
      String(displayName || "").trim() || null,
      String(avatarUrl || "").trim() || null,
      addedBy || null,
      now,
      now,
    );
  return { author: getAuthorById(db, result.lastInsertRowid) };
}

function updateAuthor(db, id, fields = {}) {
  const current = getAuthorById(db, id);
  if (!current) return { error: "not-found" };

  const next = {
    displayName:
      fields.displayName === undefined
        ? current.displayName
        : String(fields.displayName || "").trim() || null,
    avatarUrl:
      fields.avatarUrl === undefined
        ? current.avatarUrl
        : String(fields.avatarUrl || "").trim() || null,
    enabled:
      fields.enabled === undefined ? current.enabled : fields.enabled ? 1 : 0,
  };

  db.prepare(
    `UPDATE tiktok_feed_authors
        SET displayName = ?, avatarUrl = ?, enabled = ?, updatedAt = ?
      WHERE id = ?`,
  ).run(next.displayName, next.avatarUrl, next.enabled, new Date().toISOString(), id);

  return { author: getAuthorById(db, id) };
}

function removeAuthor(db, id) {
  const current = getAuthorById(db, id);
  if (!current) return { error: "not-found" };
  db.prepare("DELETE FROM tiktok_feed_authors WHERE id = ?").run(id);
  return { ok: true, handle: current.handle };
}

function recordAuthorCheck(db, id, { videoId, status, error, countImport = false }) {
  db.prepare(
    `UPDATE tiktok_feed_authors
        SET lastCheckedAt = ?, lastVideoId = ?, lastStatus = ?, lastError = ?,
            importedCount = importedCount + ?,
            updatedAt = ?
      WHERE id = ?`,
  ).run(
    new Date().toISOString(),
    videoId || null,
    status || null,
    error || null,
    countImport ? 1 : 0,
    new Date().toISOString(),
    id,
  );
}

// ── Polling ──────────────────────────────────────────────────────────────

// Resolve one author's newest clip and enqueue it. Never throws.
// `resolveAuthor` is injectable so tests can run offline; production uses the
// yt-dlp path from lib/social.js.
async function pollAuthorOnce({
  db,
  importQueue,
  author,
  logger = console,
  resolveAuthor = fetchFirstTikTokProfileVideo,
}) {
  let result = null;
  try {
    result = await resolveAuthor(author.handle);
  } catch (err) {
    result = { error: err?.message || "profile-fetch-failed" };
  }

  // TikTok/yt-dlp extraction fails intermittently (a cold challenge, a slow
  // page). One immediate retry clears most of those, and a failure here would
  // otherwise cost the creator a full poll interval.
  if (!result || result.error || !result.item) {
    try {
      const retried = await resolveAuthor(author.handle);
      if (retried && !retried.error && retried.item) {
        result = retried;
      }
    } catch {
      // Keep the first error — it is the more informative one.
    }
  }

  if (!result || result.error || !result.item) {
    const error = result?.error || "no-video-found";
    recordAuthorCheck(db, author.id, { status: "error", error });
    logger.warn?.(`[tiktok-feed] @${author.handle}: ${error}`);
    return { ok: false, handle: author.handle, error };
  }

  const item = result.item;
  const importKey = buildImportKey(item.videoId);

  // Already handled this clip in an earlier tick — refresh the cached profile
  // bits and move on without touching the queue.
  if (author.lastStatus === "imported" && author.lastVideoId === item.videoId) {
    updateAuthor(db, author.id, {
      displayName: author.displayName || item.username,
      avatarUrl: author.avatarUrl,
    });
    recordAuthorCheck(db, author.id, {
      videoId: item.videoId,
      status: "imported",
    });
    return { ok: true, handle: author.handle, skipped: "already-imported" };
  }

  const entry = importQueue.enqueue({
    url: item.url,
    platform: "tiktok",
    title: item.caption || "",
    tags: item.tags || [],
    username: item.username || author.handle,
    avatarUrl: item.avatarUrl || "",
    verified: item.verified === true,
    importKey,
  });

  // Cache the profile details the admin page shows.
  updateAuthor(db, author.id, {
    displayName: author.displayName || item.username || null,
    avatarUrl: author.avatarUrl || item.avatarUrl || null,
  });
  recordAuthorCheck(db, author.id, {
    videoId: item.videoId,
    status: "imported",
    countImport: true,
  });

  logger.log?.(
    `[tiktok-feed] queued ${item.url} as @${item.username || author.handle} (import ${entry?.id || "?"})`,
  );
  return { ok: true, handle: author.handle, item, entry };
}

/**
 * One scheduler tick: poll a rotating batch of enabled authors.
 * Returns a summary object so tests and logs can see what happened.
 */
async function pollTikTokFeedOnce({
  db,
  importQueue,
  logger = console,
  batchSize,
  resolveAuthor = fetchFirstTikTokProfileVideo,
} = {}) {
  if (!db) return { ok: false, error: "no-database" };
  if (!importQueue) return { ok: false, error: "import-queue-unavailable" };

  const authors = listAuthors(db, { enabledOnly: true });
  if (authors.length === 0) {
    return {
      ok: true,
      checked: 0,
      total: 0,
      skipped: "no-authors",
    };
  }

  const limit = batchSize || readBatchSize();
  const start = rotationCursor % authors.length;
  const batch = [];
  for (let i = 0; i < Math.min(limit, authors.length); i += 1) {
    batch.push(authors[(start + i) % authors.length]);
  }
  rotationCursor = (start + batch.length) % authors.length;

  const results = [];
  for (const author of batch) {
    results.push(
      await pollAuthorOnce({ db, importQueue, author, logger, resolveAuthor }),
    );
  }

  const queued = results.filter((r) => r.ok && r.entry).length;
  const failed = results.filter((r) => !r.ok).length;
  return { ok: true, checked: results.length, total: authors.length, queued, failed, results };
}

function startTikTokFeedScheduler({ db, importQueue, logger = console } = {}) {
  if (pollTimer) {
    return;
  }

  if (isDisabled()) {
    logger.log?.("[tiktok-feed] Scheduler disabled via TIKTOK_FEED_DISABLED.");
    return;
  }

  if (!db || !importQueue) {
    logger.warn?.(
      "[tiktok-feed] Scheduler not started: database or Pixies import queue unavailable.",
    );
    return;
  }

  const runPoll = () => {
    if (pollingPromise) return;
    pollingPromise = pollTikTokFeedOnce({ db, importQueue, logger })
      .then((result) => {
        if (result.ok === false && result.error) {
          logger.warn?.(`[tiktok-feed] Poll failed: ${result.error}`);
        }
      })
      .catch((error) => {
        logger.error?.("[tiktok-feed] Poll crashed:", error?.message || error);
      })
      .finally(() => {
        pollingPromise = null;
      });
  };

  // Kick one poll right away so a fresh deploy imports without waiting a full
  // interval, then settle into the regular cadence.
  runPoll();
  pollTimer = setInterval(runPoll, readPollIntervalMs());
  pollTimer.unref?.();
}

function stopTikTokFeedScheduler() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// Seed the table from TIKTOK_FEED_AUTHOR once, so an existing single-author
// deployment keeps importing after the move to the multi-author table.
function seedAuthorsFromEnv(db, logger = console) {
  const handles = readEnvAuthorHandles();
  if (handles.length === 0) return 0;
  let added = 0;
  for (const handle of handles) {
    const result = addAuthor(db, { handle, addedBy: "env" });
    if (result.author) added += 1;
  }
  if (added > 0) {
    logger.log?.(
      `[tiktok-feed] seeded ${added} author(s) from TIKTOK_FEED_AUTHOR`,
    );
  }
  return added;
}

module.exports = {
  AUTHORS_BATCH_MAX,
  addAuthor,
  buildImportKey,
  getAuthorByHandle,
  getAuthorById,
  isDisabled,
  isValidHandle,
  listAuthors,
  normalizeHandle,
  pollAuthorOnce,
  pollTikTokFeedOnce,
  readBatchSize,
  readEnvAuthorHandles,
  readPollIntervalMs,
  recordAuthorCheck,
  removeAuthor,
  seedAuthorsFromEnv,
  startTikTokFeedScheduler,
  stopTikTokFeedScheduler,
  updateAuthor,
};
