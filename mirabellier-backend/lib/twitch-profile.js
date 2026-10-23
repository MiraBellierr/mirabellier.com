const {
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
  readConfig,
} = require("./twitch-api");

const PROFILE_TTL_MS = 10 * 60 * 1000;

const profileCache = new Map();

function buildProfilePayload(input) {
  return {
    fetchedAt: new Date().toISOString(),
    stale: Boolean(input.stale),
    user: input.user,
    followers: input.followers,
    channelInfo: input.channelInfo,
    schedule: input.schedule,
    clips: Array.isArray(input.clips) ? input.clips : [],
    live: input.live,
    game: input.game,
  };
}

function normalizeChannelInfo(raw) {
  if (!raw) return null;
  return {
    title: typeof raw.title === "string" ? raw.title : "",
    gameName: typeof raw.game_name === "string" ? raw.game_name : "",
    language: typeof raw.broadcaster_language === "string" ? raw.broadcaster_language : "",
  };
}

function normalizeVacation(raw) {
  if (!raw) return null;
  return {
    startAt: typeof raw.start_time === "string" ? raw.start_time : "",
    endAt: typeof raw.end_time === "string" ? raw.end_time : "",
  };
}

async function fetchChannelProfile(config, channel) {
  const settle = (promise) =>
    promise.then(
      (value) => ({ ok: true, value }),
      () => ({ ok: false }),
    );

  const [users, followers, channelInfo, schedule, clips, streams] = await Promise.all([
    settle(getUsersByLogins(config, [channel.login])),
    settle(getChannelFollowers(config, channel.broadcasterId)),
    settle(getChannelInfo(config, channel.broadcasterId)),
    settle(getScheduleSegments(config, channel.broadcasterId)),
    settle(getTopClips(config, channel.broadcasterId, { first: 8 })),
    settle(getStreamsByLogins(config, [channel.login])),
  ]);

  const userRaw = users.ok ? users.value[0] || null : null;
  const liveRaw = streams.ok ? streams.value[0] || null : null;
  const live = liveRaw ? normalizeStream(liveRaw) : null;

  let game = null;
  if (live && live.gameId) {
    const games = await settle(getGamesByIds(config, [live.gameId]));
    const gameRaw = games.ok ? games.value[0] || null : null;
    game = gameRaw ? normalizeGame(gameRaw) : null;
  }

  return buildProfilePayload({
    user: userRaw ? normalizeUser(userRaw) : null,
    followers: followers.ok ? followers.value : null,
    channelInfo: channelInfo.ok ? normalizeChannelInfo(channelInfo.value) : null,
    schedule: schedule.ok
      ? {
          segments: schedule.value.segments.map(normalizeScheduleSegment),
          vacation: normalizeVacation(schedule.value.vacation),
        }
      : { segments: [], vacation: null },
    clips: clips.ok ? clips.value.map(normalizeClip) : [],
    live,
    game,
  });
}

async function getChannelProfile(db, channel) {
  const config = readConfig();
  if (!hasConfig(config)) {
    const error = new Error(
      "Twitch config missing. Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in mirabellier-backend/.env.",
    );
    error.code = "TWITCH_CONFIG_MISSING";
    throw error;
  }

  const cached = profileCache.get(channel.login);
  if (cached && Date.now() - cached.fetchedAt < PROFILE_TTL_MS) {
    return cached.payload;
  }

  try {
    const payload = await fetchChannelProfile(config, channel);
    profileCache.set(channel.login, { fetchedAt: Date.now(), payload });
    return payload;
  } catch (error) {
    if (cached) {
      return { ...cached.payload, stale: true };
    }
    throw error;
  }
}

module.exports = {
  getChannelProfile,
};
