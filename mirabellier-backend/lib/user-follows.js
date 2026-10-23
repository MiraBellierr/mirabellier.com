// User follow graph — same module shape as lib/pixie-notifications.js and
// lib/pixie-comments.js: `db` first, statements prepared inline, plain data
// out, no req/res. A fresh follow drops a "follow" notification into the
// follow-ee's pixies inbox.

const { createPixieNotification } = require("./pixie-notifications");

/** Typed failure so the route can map it to a status code. */
class FollowError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "FollowError";
    this.status = status;
  }
}

function followerCount(db, userId) {
  return (
    db
      .prepare(`SELECT COUNT(*) AS count FROM user_follows WHERE followingId = ?`)
      .get(String(userId))?.count || 0
  );
}

function followingCount(db, userId) {
  return (
    db
      .prepare(`SELECT COUNT(*) AS count FROM user_follows WHERE followerId = ?`)
      .get(String(userId))?.count || 0
  );
}

/** Ids of every account `userId` follows (newest follow first). */
function getFollowingIds(db, userId) {
  if (!userId) return [];
  return db
    .prepare(
      `SELECT followingId FROM user_follows WHERE followerId = ? ORDER BY createdAt DESC`,
    )
    .all(String(userId))
    .map((row) => row.followingId);
}

/** Ids of every account that follows `userId`. */
function getFollowerIds(db, userId) {
  if (!userId) return [];
  return db
    .prepare(`SELECT followerId FROM user_follows WHERE followingId = ?`)
    .all(String(userId))
    .map((row) => row.followerId);
}

function isFollowing(db, followerId, followingId) {
  if (!followerId || !followingId) return false;
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM user_follows WHERE followerId = ? AND followingId = ?`,
      )
      .get(String(followerId), String(followingId)),
  );
}

/** Follow state of `targetId` from `viewer`'s point of view (viewer may be null). */
function getFollowState(db, viewer, targetId) {
  const exists = db
    .prepare(`SELECT id FROM users WHERE id = ?`)
    .get(String(targetId));
  if (!exists) throw new FollowError(404, "not found");

  return {
    following: viewer ? isFollowing(db, viewer.id, targetId) : false,
    followersCount: followerCount(db, targetId),
    followingCount: followingCount(db, targetId),
  };
}

/**
 * Toggle `follower`'s follow of `targetId`. Returns the resulting state.
 * Following someone new notifies them; unfollowing is silent.
 */
function toggleFollow(db, follower, targetId) {
  const target = String(targetId);
  if (!follower?.id) throw new FollowError(401, "unauthenticated");
  if (follower.id === target) {
    throw new FollowError(400, "You cannot follow yourself");
  }
  const targetUser = db.prepare(`SELECT id FROM users WHERE id = ?`).get(target);
  if (!targetUser) throw new FollowError(404, "not found");

  const already = isFollowing(db, follower.id, target);
  if (already) {
    db.prepare(
      `DELETE FROM user_follows WHERE followerId = ? AND followingId = ?`,
    ).run(follower.id, target);
    return { following: false, followersCount: followerCount(db, target) };
  }

  db.prepare(
    `INSERT OR IGNORE INTO user_follows (followerId, followingId, createdAt)
     VALUES (?, ?, ?)`,
  ).run(follower.id, target, new Date().toISOString());

  try {
    createPixieNotification(db, {
      userId: target,
      type: "follow",
      actor: {
        id: follower.id,
        username: follower.username,
        avatar: follower.avatar,
      },
    });
  } catch {
    // Never let a notification failure break the follow.
  }

  return { following: true, followersCount: followerCount(db, target) };
}

module.exports = {
  FollowError,
  getFollowState,
  toggleFollow,
  getFollowingIds,
  getFollowerIds,
  followerCount,
  followingCount,
  isFollowing,
};
