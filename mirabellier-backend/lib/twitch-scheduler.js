const {
  getArchiveVideos,
  getStreamsByLogins,
  getUsersByLogins,
  hasConfig,
  normalizeStream,
  normalizeUser,
  normalizeVideo,
  readConfig,
} = require("./twitch-api");
const { sendLiveNotification } = require("./twitch-push");

const POLL_INTERVAL_MS = 20 * 1000;
const VOD_MERGE_WINDOW_MS = 15 * 60 * 1000;
const BACKFILL_MAX_DAYS = 180;

let pollTimer = null;
let pollingPromise = null;

function readPollIntervalMs() {
  const seconds = Number(process.env.TWITCH_POLL_INTERVAL_SECONDS);
  if (Number.isFinite(seconds) && seconds >= 10) {
    return Math.floor(seconds) * 1000;
  }
  return POLL_INTERVAL_MS;
}

function nowIso() {
  return new Date().toISOString();
}

function listEnabledChannels(db) {
  return db
    .prepare(
      `SELECT * FROM twitch_channels WHERE enabled = 1 ORDER BY displayName ASC`,
    )
    .all();
}

function getChannelByLogin(db, login) {
  return db
    .prepare("SELECT * FROM twitch_channels WHERE login = ?")
    .get(String(login || "").toLowerCase());
}

function getOpenEvent(db, channelId) {
  return db
    .prepare(
      `SELECT * FROM twitch_stream_events
       WHERE channelId = ? AND endedAt IS NULL
       ORDER BY startedAt DESC LIMIT 1`,
    )
    .get(channelId);
}

function getChannelEvents(db, channelId, limit = 2000) {
  return db
    .prepare(
      `SELECT * FROM twitch_stream_events
       WHERE channelId = ?
       ORDER BY startedAt DESC
       LIMIT ?`,
    )
    .all(channelId, limit);
}

function hasNearbyStart(sortedStarts, targetMs, windowMs) {
  let low = 0;
  let high = sortedStarts.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (Math.abs(sortedStarts[mid] - targetMs) < windowMs) {
      return true;
    }
    if (sortedStarts[mid] < targetMs) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return false;
}

function insertStreamEvent(db, channelId, { startedAt, endedAt, durationMinutes, source }) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO twitch_stream_events (
      channelId, startedAt, endedAt, durationMinutes, source, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  return insert.run(
    channelId,
    startedAt,
    endedAt,
    durationMinutes,
    source,
    nowIso(),
  );
}

function closeOpenEvent(db, channelId, endedAtMs) {
  const openEvent = getOpenEvent(db, channelId);
  if (!openEvent) return false;

  const startedAtMs = Date.parse(openEvent.startedAt);
  const durationMinutes = Number.isFinite(startedAtMs)
    ? Math.max(1, Math.round((endedAtMs - startedAtMs) / (60 * 1000)))
    : null;

  db.prepare(
    `UPDATE twitch_stream_events
     SET endedAt = ?, durationMinutes = ?
     WHERE id = ?`,
  ).run(new Date(endedAtMs).toISOString(), durationMinutes, openEvent.id);

  return true;
}

function updateChannelLiveInfo(db, channelId, liveInfo) {
  if (!liveInfo) {
    db.prepare(
      `UPDATE twitch_channels
       SET lastGameName = NULL, lastViewerCount = NULL
       WHERE id = ? AND (lastGameName IS NOT NULL OR lastViewerCount IS NOT NULL)`,
    ).run(channelId);
    return;
  }

  db.prepare(
    `UPDATE twitch_channels
     SET lastGameName = ?, lastViewerCount = ?
     WHERE id = ?`,
  ).run(liveInfo.gameName || null, liveInfo.viewerCount ?? null, channelId);
}

function syncStreamState(db, channel, stream) {
  const channelId = channel.id;

  if (!stream) {
    closeOpenEvent(db, channelId, Date.now());
    updateChannelLiveInfo(db, channelId, null);
    return { channelId, status: "offline" };
  }

  if (stream.startedAtMs <= 0) {
    return { channelId, status: "unknown" };
  }

  const openEvent = getOpenEvent(db, channelId);

  if (!openEvent) {
    insertStreamEvent(db, channelId, {
      startedAt: stream.startedAt,
      endedAt: null,
      durationMinutes: null,
      source: "poller",
    });
    updateChannelLiveInfo(db, channelId, {
      gameName: stream.gameName,
      viewerCount: stream.viewerCount,
    });
    return { channelId, status: "went-live" };
  }

  const openStartedAtMs = Date.parse(openEvent.startedAt);
  if (Number.isFinite(openStartedAtMs) && stream.startedAtMs < openStartedAtMs) {
    db.prepare("UPDATE twitch_stream_events SET startedAt = ? WHERE id = ?").run(
      stream.startedAt,
      openEvent.id,
    );
    updateChannelLiveInfo(db, channelId, {
      gameName: stream.gameName,
      viewerCount: stream.viewerCount,
    });
    return { channelId, status: "corrected-start" };
  }

  updateChannelLiveInfo(db, channelId, {
    gameName: stream.gameName,
    viewerCount: stream.viewerCount,
  });
  return { channelId, status: "live" };
}

async function backfillChannel(db, channelId) {
  const config = readConfig();
  if (!hasConfig(config)) {
    return { ok: false, error: "missing-config" };
  }

  const channel = db.prepare("SELECT * FROM twitch_channels WHERE id = ?").get(channelId);
  if (!channel || !channel.broadcasterId) {
    return { ok: false, error: "missing-broadcaster-id" };
  }

  const backfillState = db
    .prepare("SELECT * FROM twitch_backfill_state WHERE channelId = ?")
    .get(channelId);

  let cursor = backfillState?.cursor || null;
  let inserted = 0;
  let pages = 0;
  const cutoffMs = Date.now() - BACKFILL_MAX_DAYS * 24 * 60 * 60 * 1000;
  const knownStarts = getChannelEvents(db, channelId, 5000)
    .map((event) => Date.parse(event.startedAt))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  while (pages < 50) {
    const page = await getArchiveVideos(config, channel.broadcasterId, {
      first: 100,
      ...(cursor ? { after: cursor } : {}),
    });
    pages += 1;

    let reachedCutoff = false;
    for (const raw of page.videos) {
      const video = normalizeVideo(raw);
      if (video.startedAtMs <= 0) continue;
      if (video.startedAtMs < cutoffMs) {
        reachedCutoff = true;
        break;
      }
      if (hasNearbyStart(knownStarts, video.startedAtMs, VOD_MERGE_WINDOW_MS)) {
        continue;
      }

      const endedAtMs = video.endedAtMs || video.startedAtMs + 60 * 60 * 1000;
      insertStreamEvent(db, channelId, {
        startedAt: new Date(video.startedAtMs).toISOString(),
        endedAt: new Date(endedAtMs).toISOString(),
        durationMinutes: video.durationMinutes,
        source: "vod",
      });
      knownStarts.push(video.startedAtMs);
      knownStarts.sort((left, right) => left - right);
      inserted += 1;
    }

    cursor = page.pagination?.cursor || null;
    if (reachedCutoff || !cursor) break;
  }

  db.prepare(
    `INSERT INTO twitch_backfill_state (channelId, lastBackfilledAt, cursor)
     VALUES (?, ?, ?)
     ON CONFLICT(channelId) DO UPDATE SET
       lastBackfilledAt = excluded.lastBackfilledAt,
       cursor = excluded.cursor`,
  ).run(channelId, nowIso(), cursor);

  return { ok: true, inserted, pages };
}

async function pollChannelsOnce(db) {
  const config = readConfig();
  if (!hasConfig(config)) {
    return { ok: false, error: "missing-config" };
  }

  const channels = listEnabledChannels(db);
  if (channels.length === 0) {
    return { ok: true, checked: 0 };
  }

  const logins = channels.map((channel) => channel.login);
  const streams = await getStreamsByLogins(config, logins);
  const streamsByLogin = new Map(
    streams.map((raw) => {
      const stream = normalizeStream(raw);
      return [stream.login, stream];
    }),
  );

  const results = channels.map((channel) =>
    syncStreamState(db, channel, streamsByLogin.get(channel.login) || null),
  );

  const wentLive = results.filter((result) => result.status === "went-live");
  for (const result of wentLive) {
    const channel = channels.find((entry) => entry.id === result.channelId);
    const stream = channel ? streamsByLogin.get(channel.login) : null;
    if (!channel || !stream) continue;

    sendLiveNotification(db, channel.login, channel.displayName, stream)
      .then((outcome) => {
        if (outcome.sent > 0 || outcome.removed > 0) {
          console.log(
            `[twitch] push notifications for ${channel.login}: sent=${outcome.sent} removed=${outcome.removed}`,
          );
        }
      })
      .catch((error) => {
        console.error("[twitch] push notification failed:", error?.message || error);
      });
  }

  return { ok: true, checked: results.length, results };
}

function startTwitchScheduler(db) {
  if (pollTimer) {
    return;
  }

  const config = readConfig();
  if (!hasConfig(config)) {
    console.warn(
      "[twitch] Scheduler not started: TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET missing in mirabellier-backend/.env.",
    );
    return;
  }

  pollTimer = setInterval(() => {
    if (pollingPromise) return;
    pollingPromise = pollChannelsOnce(db)
      .catch((error) => {
        console.error("[twitch] Poll failed:", error?.message || error);
      })
      .finally(() => {
        pollingPromise = null;
      });
  }, readPollIntervalMs());
  pollTimer.unref?.();
}

function stopTwitchScheduler() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function ensureChannelUser(db, login, config) {
  const users = await getUsersByLogins(config, [login]);
  const raw = users[0];
  if (!raw) {
    return null;
  }
  return normalizeUser(raw);
}

module.exports = {
  backfillChannel,
  closeOpenEvent,
  ensureChannelUser,
  getChannelByLogin,
  getChannelEvents,
  getOpenEvent,
  insertStreamEvent,
  listEnabledChannels,
  pollChannelsOnce,
  startTwitchScheduler,
  stopTwitchScheduler,
  syncStreamState,
  updateChannelLiveInfo,
};
