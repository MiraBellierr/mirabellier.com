// ── Event type constants for WebSocket protocol ──

// Client → Server
const C2S = {
  ARENA_FIGHT_START: "arena:fight:start",
  ARENA_FIGHT_ADVANCE: "arena:fight:advance",
  ARENA_FIGHT_SKIP: "arena:fight:skip",
  ARENA_FIGHT_SPECTATE_JOIN: "arena:fight:spectate:join",
  ARENA_FIGHT_SPECTATE_LEAVE: "arena:fight:spectate:leave",
  ANIME_SUBSCRIBE: "anime:subscribe",
};

// Server → Client
const S2C = {
  ARENA_FIGHT_TURN: "arena:fight:turn",
  ARENA_FIGHT_FINISHED: "arena:fight:finished",
  ARENA_FIGHT_ERROR: "arena:fight:error",
  ARENA_FIGHT_SPECTATOR_UPDATE: "arena:fight:spectator-update",
  ARENA_NOTIFICATION_UNREAD_COUNT: "arena:notification:unread-count",
  ARENA_NOTIFICATION_NEW: "arena:notification:new",
  ARENA_TRADE_SESSION_UPDATE: "arena:trade:session-update",
  ARENA_TRADE_REQUEST_UPDATE: "arena:trade:request-update",
  ARENA_TRADE_REQUEST_NEW: "arena:trade:request-new",
  ARENA_TRADE_COMPLETED: "arena:trade:completed",
  ARENA_MARKET_CHANGED: "arena:market:changed",
  ARENA_TRADE_LISTING_CHANGED: "arena:trade:listing-changed",
  ARENA_SHOP_REFRESH: "arena:shop:refresh",
  TCG_QUEUE_MATCHED: "tcg:queue:matched",
  TCG_GAME_STATE: "tcg:game:state",
  TCG_GAME_FINISHED: "tcg:game:finished",
  ANIME_CURRENTLY_WATCHING: "anime:currently-watching",
  QUOTES_NEW_DAY: "quotes:new-day",
  QOTD_NEW_DAY: "qotd:new-day",
  PIXIE_NOTIFICATION_NEW: "pixie:notification:new",
  PIXIE_NOTIFICATION_UNREAD_COUNT: "pixie:notification:unread-count",
};

const ALL = { C2S, S2C };

module.exports = ALL;
