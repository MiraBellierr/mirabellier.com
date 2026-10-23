"use strict";

// Merges everything a user has *done* — posts, guestbook signatures, Pixie
// uploads, comments (blog + Pixie), follows, and Arena fights — into one
// chronological feed for /profile. Likes are deliberately left out: neither
// `posts.likes` nor `user_videos.likes` records *when* a like happened
// (they're bare arrays of liker ids), so there's no timestamp to sort by.
//
// Every source but blog comments is a plain indexed `WHERE userId = ?`
// query. Blog comments live nested inside `posts.comments` JSON blobs (see
// routes/auth.js `computePostInteractionAggregate` for the same shape), so
// finding "this user's comments" means walking every post's comment tree —
// cached with a TTL, same trick routes/auth.js already uses for the stats
// aggregate, so a profile view doesn't re-walk every post's comments on
// every hit.

const PER_SOURCE_LIMIT = 30;
const PREVIEW_MAX_LENGTH = 140;
const BLOG_COMMENT_CACHE_TTL_MS = 60_000;

let blogCommentEventsCache = null;

function trimPreview(value) {
  const text = String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= PREVIEW_MAX_LENGTH) return text;
  return `${text.slice(0, PREVIEW_MAX_LENGTH - 1)}…`;
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function walkCommentsForEvents(comments, postId, postTitle, byUser) {
  for (const comment of comments) {
    if (comment && comment.userId && comment.createdAt) {
      const list = byUser.get(comment.userId) || [];
      list.push({
        type: "blog_comment",
        createdAt: comment.createdAt,
        preview: trimPreview(comment.text),
        postTitle,
        href: `/blog/${postId}`,
      });
      byUser.set(comment.userId, list);
    }
    if (Array.isArray(comment?.children) && comment.children.length) {
      walkCommentsForEvents(comment.children, postId, postTitle, byUser);
    }
  }
}

function computeBlogCommentEventsByUser(db) {
  const rows = db.prepare("SELECT id, title, comments FROM posts").all();
  const byUser = new Map();
  for (const row of rows) {
    walkCommentsForEvents(parseJsonArray(row.comments), row.id, row.title, byUser);
  }
  return byUser;
}

function getBlogCommentEvents(db, userId, now = Date.now()) {
  if (
    !blogCommentEventsCache ||
    blogCommentEventsCache.db !== db ||
    now - blogCommentEventsCache.computedAt >= BLOG_COMMENT_CACHE_TTL_MS
  ) {
    blogCommentEventsCache = {
      db,
      computedAt: now,
      byUser: computeBlogCommentEventsByUser(db),
    };
  }
  return blogCommentEventsCache.byUser.get(userId) || [];
}

function eventsFromPosts(db, userId) {
  return db
    .prepare(
      `SELECT id, title, createdAt FROM posts
       WHERE userId = ? ORDER BY createdAt DESC LIMIT ?`,
    )
    .all(userId, PER_SOURCE_LIMIT)
    .map((row) => ({
      type: "post",
      createdAt: row.createdAt,
      title: row.title || "Untitled",
      href: `/blog/${row.id}`,
    }));
}

function eventsFromGuestbook(db, userId) {
  return db
    .prepare(
      `SELECT message, createdAt FROM guestbook_entries
       WHERE userId = ? ORDER BY createdAt DESC LIMIT ?`,
    )
    .all(userId, PER_SOURCE_LIMIT)
    .map((row) => ({
      type: "guestbook",
      createdAt: row.createdAt,
      preview: trimPreview(row.message),
      href: "/guestbook",
    }));
}

function eventsFromPixies(db, userId) {
  return db
    .prepare(
      `SELECT id, title, createdAt FROM user_videos
       WHERE userId = ? ORDER BY createdAt DESC LIMIT ?`,
    )
    .all(userId, PER_SOURCE_LIMIT)
    .map((row) => ({
      type: "pixie",
      createdAt: row.createdAt,
      title: row.title || "a Pixie",
      href: `/pixies/${row.id}`,
    }));
}

function eventsFromPixieComments(db, userId) {
  return db
    .prepare(
      `SELECT videoId, content, createdAt FROM user_video_comments
       WHERE userId = ? ORDER BY createdAt DESC LIMIT ?`,
    )
    .all(userId, PER_SOURCE_LIMIT)
    .map((row) => ({
      type: "pixie_comment",
      createdAt: row.createdAt,
      preview: trimPreview(row.content),
      href: `/pixies/${row.videoId}`,
    }));
}

function eventsFromFollows(db, userId) {
  return db
    .prepare(
      `SELECT u.username AS followingUsername, uf.createdAt
       FROM user_follows uf
       JOIN users u ON u.id = uf.followingId
       WHERE uf.followerId = ? ORDER BY uf.createdAt DESC LIMIT ?`,
    )
    .all(userId, PER_SOURCE_LIMIT)
    .map((row) => ({
      type: "follow",
      createdAt: row.createdAt,
      username: row.followingUsername,
      href: `/profile/${row.followingUsername}`,
    }));
}

function eventsFromArenaFights(db, userId) {
  return db
    .prepare(
      `SELECT id, result, createdAt FROM arena_fights
       WHERE userId = ? ORDER BY createdAt DESC LIMIT ?`,
    )
    .all(userId, PER_SOURCE_LIMIT)
    .map((row) => ({
      type: "arena_fight",
      createdAt: row.createdAt,
      result: row.result,
      // Now a real replay, not just the Arena hub — see suggestion #17.
      href: `/arena/fight/${row.id}`,
    }));
}

function getUserActivity(db, userId, { limit = 30 } = {}) {
  const events = [
    ...eventsFromPosts(db, userId),
    ...eventsFromGuestbook(db, userId),
    ...eventsFromPixies(db, userId),
    ...eventsFromPixieComments(db, userId),
    ...eventsFromFollows(db, userId),
    ...eventsFromArenaFights(db, userId),
    ...getBlogCommentEvents(db, userId),
  ];

  events.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  return events.slice(0, limit);
}

module.exports = {
  PER_SOURCE_LIMIT,
  getUserActivity,
};
