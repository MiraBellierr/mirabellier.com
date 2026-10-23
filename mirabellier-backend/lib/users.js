const { db } = require("./db");
const crypto = require("crypto");
const { serializePublicUser } = require("./public-user");
const { sanitizeWebsite, sanitizeMediaUrl } = require("./sanitize-website");
const { mirrorAvatarToPng } = require("./avatar-png");
const { IMAGES_DIR } = require("./uploads");

const SESSION_SECRET = process.env.SESSION_SECRET;
const USER_UPDATE_FIELDS = ["avatar", "bio", "banner", "location", "website"];

// Session tokens are HMAC-signed with SESSION_SECRET (see signSessionId). With
// no secret configured, signing AND verification below degrade to no-ops and
// every token shape is accepted — a silent auth downgrade from one missing or
// typo'd env var. Fail the boot in production; in dev / tests keep the no-op
// path but say so out loud so it can't pass unnoticed.
if (!SESSION_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET is required in production: without it, session-token " +
        "signatures are disabled and any token shape is accepted.",
    );
  }
  console.warn(
    "[users] SESSION_SECRET is not set — session-token signatures are disabled. " +
      "This is acceptable for local dev and tests only.",
  );
}

// Profile field constraints. Username is ASCII-only (letters, digits, and
// . _ -) so visually-confusable Unicode (e.g. Cyrillic і for "i") cannot be
// used to impersonate another handle.
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;
const MAX_BIO_LENGTH = 500;
const MAX_LOCATION_LENGTH = 100;

// Server-side session lifetime. Kept in step with the auth cookie's Max-Age so a
// token cannot outlive its cookie. Defaults to 30 days.
const SESSION_TTL_MS = (() => {
  const seconds = Number.parseInt(
    process.env.SESSION_COOKIE_MAX_AGE_SECONDS || "",
    10,
  );
  return (Number.isFinite(seconds) && seconds > 0
    ? seconds
    : 60 * 60 * 24 * 30) * 1000;
})();

function signSessionId(id) {
  if (!SESSION_SECRET) return id;

  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(id)
    .digest("hex");
  return `${id}.${signature}`;
}

// When a signing secret is configured the signature is enforced: a token with
// no signature, a malformed signature, or a mismatch is rejected outright
// (constant-time compare). With no secret configured, signing is a no-op and
// every token shape is accepted — but the boot check above makes that path
// unreachable in production, so it only applies to local dev and tests.
function isValidSignedToken(token) {
  if (!SESSION_SECRET) return true;

  const separatorIndex = String(token).indexOf(".");
  if (separatorIndex === -1) return false;

  const id = token.slice(0, separatorIndex);
  const providedSignature = token.slice(separatorIndex + 1);
  const expectedSignature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(id)
    .digest("hex");

  let providedBuffer;
  let expectedBuffer;
  try {
    providedBuffer = Buffer.from(providedSignature, "hex");
    expectedBuffer = Buffer.from(expectedSignature, "hex");
  } catch {
    return false;
  }
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

// Only the SHA-256 of a session token is persisted, so a leaked database file
// (or an old backup) does not hand over usable session tokens.
function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function buildDiscordAvatarUrl(discordId, avatarHash) {
  if (!avatarHash) return null;
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png`;
}

function buildDiscordBannerUrl(discordId, bannerHash) {
  if (!bannerHash) return null;
  return `https://cdn.discordapp.com/banners/${discordId}/${bannerHash}.png?size=600`;
}

function makeToken() {
  const id = crypto.randomBytes(16).toString("hex");
  return signSessionId(id);
}

function userPublic(user) {
  return serializePublicUser(user);
}

function getUserByUsername(username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username);
}

function getUserByUsernameCaseInsensitive(username) {
  return db
    .prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
    .get(username);
}

function getUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function createSession(token, userId) {
  const now = Date.now();
  db.prepare(
    "INSERT INTO sessions (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)",
  ).run(
    hashToken(token),
    userId,
    new Date(now).toISOString(),
    new Date(now + SESSION_TTL_MS).toISOString(),
  );
}

function deleteSession(token) {
  if (!token) return;
  db.prepare("DELETE FROM sessions WHERE token = ?").run(hashToken(token));
}

// Drop every session for a user. Used on an identity change (username edit) so
// a stale cookie cannot keep riding the old identity; the caller re-issues a
// fresh session for the current device.
function revokeUserSessions(userId) {
  db.prepare("DELETE FROM sessions WHERE userId = ?").run(String(userId));
}

// Drop sessions that have expired (or predate the createdAt/expiresAt columns
// and can no longer be matched anyway).
function sweepExpiredSessions() {
  try {
    db.prepare(
      "DELETE FROM sessions WHERE expiresAt IS NULL OR expiresAt <= ?",
    ).run(new Date().toISOString());
  } catch {
    // Non-fatal: a failed sweep just means stale rows linger until the next one.
  }
}

function getUserByToken(token) {
  if (!token) return null;
  if (!isValidSignedToken(token)) return null;

  const tokenHash = hashToken(token);
  const row = db
    .prepare(
      "SELECT u.*, s.expiresAt AS __sessionExpiresAt FROM sessions s JOIN users u ON s.userId = u.id WHERE s.token = ?",
    )
    .get(tokenHash);
  if (!row) return null;

  const expiresAt = Date.parse(row.__sessionExpiresAt || "");
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(tokenHash);
    return null;
  }

  delete row.__sessionExpiresAt;
  return row;
}

function updateUserById(
  id,
  { username, avatar, bio, banner, location, website },
) {
  const user = getUserById(id);
  if (!user) return null;

  // An empty / whitespace username means "not provided" (a form that always
  // submits the field), not an attempt to blank it — skip it, don't 400.
  const nextUsername =
    username === undefined ? undefined : String(username).trim();
  if (nextUsername && nextUsername !== user.username) {
    if (!USERNAME_PATTERN.test(nextUsername)) {
      throw new Error("invalid username");
    }
    const existing = getUserByUsernameCaseInsensitive(nextUsername);
    if (existing && existing.id !== id) throw new Error("username taken");
    db.prepare("UPDATE users SET username = ? WHERE id = ?").run(
      nextUsername,
      id,
    );
  }

  // Never persist a raw client string for fields that are rendered as href/src.
  // An empty string is a deliberate "clear this field"; only `undefined` skips.
  const normalize = (value, sanitize) => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    return sanitize(value);
  };
  const capLength = (max) => (value) => String(value).slice(0, max);

  const updates = {
    avatar: normalize(avatar, sanitizeMediaUrl),
    bio: normalize(bio, capLength(MAX_BIO_LENGTH)),
    banner: normalize(banner, sanitizeMediaUrl),
    location: normalize(location, capLength(MAX_LOCATION_LENGTH)),
    website: normalize(website, sanitizeWebsite),
  };
  // One combined UPDATE for every changed field instead of a prepare + write
  // per field. `USER_UPDATE_FIELDS` is a hardcoded allowlist, so interpolating
  // the column names is safe; the values stay parameterized.
  const changedFields = USER_UPDATE_FIELDS.filter(
    (field) => updates[field] !== undefined,
  );
  if (changedFields.length > 0) {
    const setClause = changedFields.map((field) => `${field} = ?`).join(", ");
    db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`).run(
      ...changedFields.map((field) => updates[field]),
      id,
    );
  }

  return getUserById(id);
}

// Pick a username that is not already claimed (case-insensitively, matching the
// UNIQUE index and updateUserById's own collision check). Tries the preferred
// handle, then `discord_<id>`, then `discord_<id>_2`, `_3`, … so account
// creation can never dead-end on a name clash.
//
// The preferred handle is only used when it satisfies USERNAME_PATTERN.
// updateUserById enforces that pattern (ASCII-only, 3–30 chars) so a Cyrillic
// look-alike can't impersonate another handle; Discord allows Unicode and other
// lengths, so a raw Discord username would be a straight path around that exact
// control. When it fails the check we drop to `discord_<id>`.
function pickAvailableUsername(preferred, discordId) {
  const fallback = `discord_${discordId}`;
  const candidates =
    typeof preferred === "string" && USERNAME_PATTERN.test(preferred)
      ? [preferred, fallback]
      : [fallback];
  for (const candidate of candidates) {
    if (!getUserByUsernameCaseInsensitive(candidate)) return candidate;
  }
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${fallback}_${suffix}`;
    if (!getUserByUsernameCaseInsensitive(candidate)) return candidate;
  }
}

async function findOrCreateDiscordUser(discordProfile) {
  // Discord's CDN link is stable, but pointing the browser at it means every
  // Pixies feed render hits discordapp.com. Mirror it to a local PNG once (the
  // file is keyed on md5 of the URL, and the URL carries the avatar hash — so a
  // user changing their Discord avatar yields a new URL and a fresh mirror on
  // their next login). Falls back to the remote URL if the download fails.
  const remoteAvatar = buildDiscordAvatarUrl(
    discordProfile.id,
    discordProfile.avatar,
  );
  const avatar = remoteAvatar
    ? await mirrorAvatarToPng(remoteAvatar, IMAGES_DIR)
    : remoteAvatar;
  const banner = buildDiscordBannerUrl(
    discordProfile.id,
    discordProfile.banner,
  );

  // Check if user exists by Discord ID
  const existingUser = db
    .prepare("SELECT * FROM users WHERE discordId = ?")
    .get(discordProfile.id);

  if (existingUser) {
    if (avatar !== existingUser.avatar || banner !== existingUser.banner) {
      db.prepare("UPDATE users SET avatar = ?, banner = ? WHERE id = ?").run(
        avatar,
        banner,
        existingUser.id,
      );
      return getUserById(existingUser.id);
    }
    return existingUser;
  }

  // Create new user from Discord profile. `pickAvailableUsername` validates the
  // Discord handle against USERNAME_PATTERN and resolves collisions: `username`
  // is TEXT UNIQUE, so a first-time login whose handle already exists on the
  // site would otherwise throw a constraint error the strategy can only forward
  // as an opaque, permanent signup failure. It falls back to `discord_<id>`
  // (then `discord_<id>_2`, …) when the handle is invalid or taken.
  //
  // `users.id` is the TEXT PRIMARY KEY. A wall-clock value collides for two
  // accounts created in the same millisecond; use a random id (same style as
  // the session token above) so creation cannot dead-end on a key clash.
  const id = crypto.randomBytes(16).toString("hex");
  const username = pickAvailableUsername(
    discordProfile.username || `discord_${discordProfile.id}`,
    discordProfile.id,
  );
  const createdAt = new Date().toISOString();

  db.prepare(
    "INSERT INTO users (id, username, discordId, avatar, banner, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, username, discordProfile.id, avatar, banner, createdAt);

  return getUserById(id);
}

// Sweep once at boot, then hourly. Unref so the timer never keeps the process
// (or a test runner) alive on its own.
sweepExpiredSessions();
const sessionSweepTimer = setInterval(sweepExpiredSessions, 60 * 60 * 1000);
if (typeof sessionSweepTimer.unref === "function") sessionSweepTimer.unref();

module.exports = {
  makeToken,
  userPublic,
  getUserByUsername,
  getUserById,
  createSession,
  deleteSession,
  revokeUserSessions,
  getUserByToken,
  sweepExpiredSessions,
  updateUserById,
  findOrCreateDiscordUser,
};
