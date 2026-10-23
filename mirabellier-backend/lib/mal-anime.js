const axios = require("axios");

const MAL_API_BASE = "https://api.myanimelist.net/v2";
const CURRENTLY_WATCHING_FEED_KEY = "currently-watching";
const DEFAULT_REFRESH_MINUTES = 5;
const CONFIG_ERROR_CODE = "MAL_CONFIG_MISSING";

let pendingCurrentlyWatchingRefresh = null;

function readConfig() {
  const refreshMinutes = Number(process.env.MAL_ANIME_REFRESH_MINUTES);

  return {
    clientId: String(process.env.MAL_CLIENT_ID || "").trim(),
    username: String(process.env.MAL_USERNAME || "").trim(),
    refreshMinutes:
      Number.isFinite(refreshMinutes) && refreshMinutes > 0
        ? Math.floor(refreshMinutes)
        : DEFAULT_REFRESH_MINUTES,
  };
}

function createConfigError() {
  const error = new Error(
    "MyAnimeList config missing. Set MAL_CLIENT_ID and MAL_USERNAME in mirabellier-backend/.env.",
  );
  error.code = CONFIG_ERROR_CODE;
  return error;
}

function normalizeSeason(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const season = typeof value.season === "string" ? value.season : "";
  const year = Number(value.year);

  if (!season || !Number.isFinite(year)) {
    return null;
  }

  return {
    season,
    year: Math.trunc(year),
  };
}

function readPreferredTitle(node) {
  const englishTitle =
    typeof node.alternative_titles?.en === "string"
      ? node.alternative_titles.en.trim()
      : "";
  const defaultTitle = typeof node.title === "string" ? node.title.trim() : "";

  return englishTitle || defaultTitle;
}

function normalizeItem(entry) {
  const node = entry?.node && typeof entry.node === "object" ? entry.node : {};
  const listStatus =
    entry?.list_status && typeof entry.list_status === "object"
      ? entry.list_status
      : {};
  const malId = Number(node.id);
  const totalEpisodes = Number(node.num_episodes);
  const watchedEpisodes = Number(listStatus.num_episodes_watched);
  const score = Number(listStatus.score);

  return {
    malId: Number.isFinite(malId) ? Math.trunc(malId) : 0,
    title: readPreferredTitle(node),
    url: Number.isFinite(malId)
      ? `https://myanimelist.net/anime/${Math.trunc(malId)}`
      : "",
    coverImage:
      typeof node.main_picture?.large === "string"
        ? node.main_picture.large
        : typeof node.main_picture?.medium === "string"
          ? node.main_picture.medium
          : null,
    mediaType: typeof node.media_type === "string" ? node.media_type : null,
    watchedEpisodes: Number.isFinite(watchedEpisodes)
      ? Math.max(Math.trunc(watchedEpisodes), 0)
      : 0,
    totalEpisodes:
      Number.isFinite(totalEpisodes) && totalEpisodes > 0
        ? Math.trunc(totalEpisodes)
        : null,
    score:
      Number.isFinite(score) && score > 0 ? Math.max(Math.trunc(score), 0) : null,
    updatedAt:
      typeof listStatus.updated_at === "string" ? listStatus.updated_at : null,
    startSeason: normalizeSeason(node.start_season),
  };
}

function sortItemsByUpdatedAt(items) {
  return [...items].sort((left, right) => {
    const leftTimestamp = left.updatedAt ? Date.parse(left.updatedAt) : 0;
    const rightTimestamp = right.updatedAt ? Date.parse(right.updatedAt) : 0;
    return rightTimestamp - leftTimestamp;
  });
}

function buildPayload(input) {
  return {
    source: "myanimelist",
    username: input.username,
    fetchedAt: input.fetchedAt,
    stale: Boolean(input.stale),
    items: Array.isArray(input.items) ? input.items : [],
  };
}

function parseSnapshotRow(row) {
  if (!row) {
    return null;
  }

  try {
    const parsedItems = JSON.parse(row.payloadJson);
    return buildPayload({
      username: row.username,
      fetchedAt: row.fetchedAt,
      stale: false,
      items: Array.isArray(parsedItems) ? parsedItems : [],
    });
  } catch {
    return null;
  }
}

function getStoredCurrentlyWatchingSnapshot(db) {
  const row = db
    .prepare(
      `SELECT feedKey, username, fetchedAt, payloadJson
       FROM myanimelist_anime_snapshots
       WHERE feedKey = ?`,
    )
    .get(CURRENTLY_WATCHING_FEED_KEY);

  return parseSnapshotRow(row);
}

function isSnapshotFresh(snapshot, refreshMinutes) {
  const fetchedAtMs = Date.parse(snapshot?.fetchedAt || "");
  if (!Number.isFinite(fetchedAtMs)) {
    return false;
  }

  return Date.now() - fetchedAtMs < refreshMinutes * 60 * 1000;
}

function saveCurrentlyWatchingSnapshot(db, payload) {
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO myanimelist_anime_snapshots (
      feedKey,
      username,
      fetchedAt,
      payloadJson,
      createdAt,
      updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(feedKey) DO UPDATE SET
      username = excluded.username,
      fetchedAt = excluded.fetchedAt,
      payloadJson = excluded.payloadJson,
      updatedAt = excluded.updatedAt`,
  ).run(
    CURRENTLY_WATCHING_FEED_KEY,
    payload.username,
    payload.fetchedAt,
    JSON.stringify(payload.items),
    now,
    now,
  );
}

async function fetchCurrentlyWatchingFromMal(config) {
  const response = await axios.get(
    `${MAL_API_BASE}/users/${encodeURIComponent(config.username)}/animelist`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mirabellier/1.0 (+https://mirabellier.com)",
        "X-MAL-CLIENT-ID": config.clientId,
      },
      params: {
        status: "watching",
        sort: "list_updated_at",
        limit: 1000,
        fields:
          "list_status,num_episodes,main_picture,media_type,start_season,alternative_titles",
      },
      timeout: 15000,
    },
  );

  const items = Array.isArray(response?.data?.data)
    ? response.data.data.map(normalizeItem).filter((item) => item.malId > 0)
    : [];

  return buildPayload({
    username: config.username,
    fetchedAt: new Date().toISOString(),
    stale: false,
    items: sortItemsByUpdatedAt(items),
  });
}

async function refreshCurrentlyWatchingSnapshot(db, config) {
  if (!pendingCurrentlyWatchingRefresh) {
    pendingCurrentlyWatchingRefresh = (async () => {
      const payload = await fetchCurrentlyWatchingFromMal(config);
      saveCurrentlyWatchingSnapshot(db, payload);
      return payload;
    })().finally(() => {
      pendingCurrentlyWatchingRefresh = null;
    });
  }

  return pendingCurrentlyWatchingRefresh;
}

async function getCurrentlyWatchingAnimeFeed(db) {
  const config = readConfig();
  if (!config.clientId || !config.username) {
    throw createConfigError();
  }

  const snapshot = getStoredCurrentlyWatchingSnapshot(db);
  if (snapshot && isSnapshotFresh(snapshot, config.refreshMinutes)) {
    return snapshot;
  }

  try {
    return await refreshCurrentlyWatchingSnapshot(db, config);
  } catch (error) {
    if (snapshot) {
      return {
        ...snapshot,
        stale: true,
      };
    }

    throw error;
  }
}

module.exports = {
  CONFIG_ERROR_CODE,
  getCurrentlyWatchingAnimeFeed,
};
