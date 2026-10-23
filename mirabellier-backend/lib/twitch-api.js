const axios = require("axios");

const HELIX_BASE = "https://api.twitch.tv/helix";
const AUTH_BASE = "https://id.twitch.tv/oauth2/token";

const CONFIG_ERROR_CODE = "TWITCH_CONFIG_MISSING";
const API_ERROR_CODE = "TWITCH_UNAVAILABLE";

const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

let cachedToken = {
  accessToken: "",
  expiresAt: 0,
};
let pendingTokenRefresh = null;

function readConfig() {
  return {
    clientId: String(process.env.TWITCH_CLIENT_ID || "").trim(),
    clientSecret: String(process.env.TWITCH_CLIENT_SECRET || "").trim(),
  };
}

function hasConfig(config) {
  return Boolean(config.clientId && config.clientSecret);
}

function createConfigError() {
  const error = new Error(
    "Twitch config missing. Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in mirabellier-backend/.env.",
  );
  error.code = CONFIG_ERROR_CODE;
  return error;
}

function createApiError(message) {
  const error = new Error(message || "Twitch API request failed.");
  error.code = API_ERROR_CODE;
  return error;
}

async function refreshAccessToken(config) {
  if (pendingTokenRefresh) {
    return pendingTokenRefresh;
  }

  pendingTokenRefresh = (async () => {
    const response = await axios.post(
      AUTH_BASE,
      new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "client_credentials",
      }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: DEFAULT_REQUEST_TIMEOUT_MS,
      },
    );

    const accessToken = String(response?.data?.access_token || "");
    const expiresInSeconds = Number(response?.data?.expires_in);

    if (!accessToken) {
      throw createApiError("Twitch returned no access token.");
    }

    cachedToken = {
      accessToken,
      expiresAt: Date.now() + (Number.isFinite(expiresInSeconds) ? Math.max(expiresInSeconds - 120, 60) : 3000) * 1000,
    };

    return cachedToken.accessToken;
  })().finally(() => {
    pendingTokenRefresh = null;
  });

  return pendingTokenRefresh;
}

async function getAccessToken(config) {
  if (cachedToken.accessToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }

  return refreshAccessToken(config);
}

async function helixGet(config, path, params) {
  const accessToken = await getAccessToken(config);

  const response = await axios.get(`${HELIX_BASE}${path}`, {
    headers: {
      "Client-ID": config.clientId,
      Authorization: `Bearer ${accessToken}`,
    },
    params,
    timeout: DEFAULT_REQUEST_TIMEOUT_MS,
  });

  return response?.data || {};
}

async function getUsersByLogins(config, logins) {
  if (!Array.isArray(logins) || logins.length === 0) {
    return [];
  }

  const data = await helixGet(config, "/users", {
    login: logins.slice(0, 100),
  });

  return Array.isArray(data.data) ? data.data : [];
}

async function getChannelInfo(config, broadcasterId) {
  const data = await helixGet(config, "/channels", {
    broadcaster_id: broadcasterId,
  });

  return Array.isArray(data.data) ? data.data[0] || null : null;
}

async function getChannelFollowers(config, broadcasterId) {
  const data = await helixGet(config, "/channels/followers", {
    broadcaster_id: broadcasterId,
    first: 1,
  });

  const total = Number(data?.total);
  return Number.isFinite(total) ? total : null;
}

async function getScheduleSegments(config, broadcasterId) {
  const data = await helixGet(config, "/schedule", {
    broadcaster_id: broadcasterId,
    first: 25,
  });

  return {
    segments: Array.isArray(data?.data?.segments) ? data.data.segments : [],
    vacation:
      data?.data?.vacation && typeof data.data.vacation === "object"
        ? data.data.vacation
        : null,
  };
}

async function getTopClips(config, broadcasterId, options = {}) {
  const data = await helixGet(config, "/clips", {
    broadcaster_id: broadcasterId,
    first: Math.min(Math.max(options.first || 8, 1), 20),
  });

  return Array.isArray(data.data) ? data.data : [];
}

async function getGamesByIds(config, gameIds) {
  if (!Array.isArray(gameIds) || gameIds.length === 0) {
    return [];
  }

  const data = await helixGet(config, "/games", {
    id: gameIds.slice(0, 100),
  });

  return Array.isArray(data.data) ? data.data : [];
}

async function getStreamsByLogins(config, logins) {
  if (!Array.isArray(logins) || logins.length === 0) {
    return [];
  }

  const data = await helixGet(config, "/streams", {
    user_login: logins.slice(0, 100),
  });

  return Array.isArray(data.data) ? data.data : [];
}

async function getArchiveVideos(config, broadcasterId, options = {}) {
  const data = await helixGet(config, "/videos", {
    user_id: broadcasterId,
    type: "archive",
    first: Math.min(Math.max(options.first || 100, 1), 100),
    ...(options.after ? { after: options.after } : {}),
  });

  return {
    videos: Array.isArray(data.data) ? data.data : [],
    pagination: data.pagination && typeof data.pagination === "object" ? data.pagination : {},
  };
}

function normalizeUser(raw) {
  return {
    broadcasterId: typeof raw.id === "string" ? raw.id : "",
    login: typeof raw.login === "string" ? raw.login.toLowerCase() : "",
    displayName: typeof raw.display_name === "string" ? raw.display_name : "",
    profileImageUrl: typeof raw.profile_image_url === "string" ? raw.profile_image_url : "",
    description: typeof raw.description === "string" ? raw.description : "",
    offlineImageUrl: typeof raw.offline_image_url === "string" ? raw.offline_image_url : "",
    viewCount: Number.isFinite(Number(raw.view_count)) ? Number(raw.view_count) : null,
    broadcasterType: typeof raw.broadcaster_type === "string" ? raw.broadcaster_type : "",
    createdAt: typeof raw.created_at === "string" ? raw.created_at : "",
  };
}

function normalizeStream(raw) {
  const startedAt = typeof raw.started_at === "string" ? raw.started_at : "";
  const startedAtMs = Date.parse(startedAt);

  return {
    broadcasterId: typeof raw.user_id === "string" ? raw.user_id : "",
    login: typeof raw.user_login === "string" ? raw.user_login.toLowerCase() : "",
    startedAt: Number.isFinite(startedAtMs) ? startedAt : "",
    startedAtMs: Number.isFinite(startedAtMs) ? startedAtMs : 0,
    title: typeof raw.title === "string" ? raw.title : "",
    gameId: typeof raw.game_id === "string" ? raw.game_id : "",
    gameName: typeof raw.game_name === "string" ? raw.game_name : "",
    viewerCount: Number.isFinite(Number(raw.viewer_count)) ? Number(raw.viewer_count) : 0,
    thumbnailUrl: typeof raw.thumbnail_url === "string" ? raw.thumbnail_url : "",
  };
}

function normalizeClip(raw) {
  const createdAtMs = Date.parse(typeof raw.created_at === "string" ? raw.created_at : "");
  const viewCount = Number(raw.view_count);

  return {
    id: typeof raw.id === "string" ? raw.id : "",
    title: typeof raw.title === "string" ? raw.title : "",
    viewCount: Number.isFinite(viewCount) ? viewCount : 0,
    durationSeconds: Number.isFinite(Number(raw.duration)) ? Number(raw.duration) : null,
    createdAt: Number.isFinite(createdAtMs) ? new Date(createdAtMs).toISOString() : "",
    thumbnailUrl: typeof raw.thumbnail_url === "string" ? raw.thumbnail_url : "",
    url: typeof raw.url === "string" ? raw.url : "",
  };
}

function normalizeScheduleSegment(raw) {
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    title: typeof raw.title === "string" ? raw.title : "",
    categoryName:
      raw.category && typeof raw.category.name === "string"
        ? raw.category.name
        : "",
    startAt: typeof raw.start_time === "string" ? raw.start_time : "",
    endAt: typeof raw.end_time === "string" ? raw.end_time : "",
    isRecurring: Boolean(raw.is_recurring),
    isVacation: Boolean(raw.canceled_until),
  };
}

function normalizeGame(raw) {
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    name: typeof raw.name === "string" ? raw.name : "",
    boxArtUrl: typeof raw.box_art_url === "string" ? raw.box_art_url : "",
  };
}

function normalizeVideo(raw) {
  const createdAt = typeof raw.created_at === "string" ? raw.created_at : "";
  const createdAtMs = Date.parse(createdAt);
  const durationSeconds = Number(raw.duration);

  return {
    id: typeof raw.id === "string" ? raw.id : "",
    startedAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
    endedAtMs: Number.isFinite(createdAtMs) && Number.isFinite(durationSeconds)
      ? createdAtMs + durationSeconds * 1000
      : 0,
    durationMinutes: Number.isFinite(durationSeconds)
      ? Math.round(durationSeconds / 60)
      : null,
    title: typeof raw.title === "string" ? raw.title : "",
  };
}

module.exports = {
  API_ERROR_CODE,
  CONFIG_ERROR_CODE,
  createApiError,
  createConfigError,
  getArchiveVideos,
  getChannelFollowers,
  getChannelInfo,
  getGamesByIds,
  getScheduleSegments,
  getStreamsByLogins,
  getTopClips,
  getUsersByLogins,
  hasConfig,
  normalizeClip,
  normalizeGame,
  normalizeScheduleSegment,
  normalizeStream,
  normalizeUser,
  normalizeVideo,
  readConfig,
};
