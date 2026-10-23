// Daily Honkai: Star Rail data refresh from prydwen.gg.
//
// The sync is expensive (headless Chromium, one Cloudflare-gated page per
// character), so this scheduler runs it at most once per cadence and never
// overlaps runs. `HSR_SYNC_DISABLED=1` turns it off; `HSR_SYNC_INTERVAL_HOURS`
// moves the cadence.

const { syncHsrData } = require("./hsr-sync");
const { db: defaultDb } = require("./db");
const { recordExternalSync } = require("./external-sync-state");

const DEFAULT_INTERVAL_HOURS = 24;
const MIN_INTERVAL_HOURS = 1;

let syncTimer = null;
let runningPromise = null;
let started = false;
let lastResult = null;

function readIntervalMs() {
  const hours = Number(process.env.HSR_SYNC_INTERVAL_HOURS);
  const resolved =
    Number.isFinite(hours) && hours >= MIN_INTERVAL_HOURS
      ? hours
      : DEFAULT_INTERVAL_HOURS;
  return resolved * 60 * 60 * 1000;
}

function readFullRefreshDays() {
  const days = Number(process.env.HSR_SYNC_FULL_DAYS);
  return Number.isFinite(days) && days > 0 ? days : undefined;
}

function readConcurrency() {
  const value = Number(process.env.HSR_SYNC_CONCURRENCY);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function isDisabled() {
  const raw = String(process.env.HSR_SYNC_DISABLED || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

async function runHsrSync({ logger = console, db = defaultDb, ...options } = {}) {
  if (runningPromise) return runningPromise;

  runningPromise = syncHsrData({
    logger,
    fullRefreshDays: readFullRefreshDays(),
    concurrency: readConcurrency(),
    ...options,
  })
    .then((result) => {
      lastResult = result;
      // The JSON lives outside SQLite; this stamp is what the sitemap dates
      // `/hsr` by. Only recorded on a clean run so a partial sync cannot
      // advertise a freshness the files do not have.
      if (result?.ok && db) {
        recordExternalSync(db, "hsr");
      }
      if (!result.ok) {
        logger.warn?.(
          `[hsr] sync finished with ${result.failed} failure(s): ` +
            result.errors.map((entry) => `${entry.slug} (${entry.error})`).join(", "),
        );
      }
      return result;
    })
    .catch((error) => {
      logger.error?.("[hsr] sync crashed:", error?.message || error);
      return { ok: false, error: error?.message || "sync-crashed" };
    })
    .finally(() => {
      runningPromise = null;
    });

  return runningPromise;
}

function startHsrSyncScheduler(options = {}) {
  if (started) {
    return { ok: false, error: "already-started" };
  }
  started = true;

  const logger = options.logger || console;

  if (isDisabled()) {
    logger.log?.("[hsr] scheduler disabled via HSR_SYNC_DISABLED.");
    return { ok: false, error: "disabled" };
  }

  const intervalMs = readIntervalMs();
  logger.log?.(
    `[hsr] scheduler started; syncing every ${Math.round(intervalMs / 3600000)}h`,
  );

  const tick = async () => {
    const result = await runHsrSync({ ...options, logger });
    return result;
  };

  // Kick off immediately so a fresh deploy gets data without waiting a day,
  // then settle into the cadence. `unref` keeps the timer from holding the
  // process open in tests and tooling.
  void tick();
  syncTimer = setInterval(tick, intervalMs);
  syncTimer.unref?.();

  return { ok: true, intervalMs };
}

function stopHsrSyncScheduler() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  started = false;
}

function getHsrSyncState() {
  return {
    started,
    running: Boolean(runningPromise),
    intervalMs: readIntervalMs(),
    lastResult,
  };
}

module.exports = {
  DEFAULT_INTERVAL_HOURS,
  MIN_INTERVAL_HOURS,
  getHsrSyncState,
  isDisabled,
  readConcurrency,
  readFullRefreshDays,
  readIntervalMs,
  runHsrSync,
  startHsrSyncScheduler,
  stopHsrSyncScheduler,
};
