// Comment section for the pixies feature — extracted into a lib module in the
// same shape as lib/pixie-notifications.js: every function takes `db` first,
// prepares its own statements, returns plain data, and stays free of any
// req/res plumbing. Route handlers in routes/pixies.js are thin wrappers that
// translate a PixieCommentError into an HTTP status.

const { isOwner } = require("./authz");
const { localAvatarOrNull } = require("./avatar-png");
const { createPixieNotification } = require("./pixie-notifications");

const COMMENT_MAX_LENGTH = 500;

/** Typed failure so the route can map it to a status code (mirrors ArenaHttpError). */
class PixieCommentError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "PixieCommentError";
    this.status = status;
  }
}

function makeId() {
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

function parseLikes(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapCommentRow(row, viewerId) {
  const likes = parseLikes(row.likes);
  return {
    id: row.id,
    content: String(row.content || ""),
    createdAt: row.createdAt,
    parentId: row.parentId || null,
    likesCount: likes.length,
    likedByMe: Boolean(viewerId && likes.includes(viewerId)),
    replyCount: row.replyCount || 0,
    author: {
      id: row.authorId,
      username: row.authorUsername || "unknown",
      avatar: localAvatarOrNull(row.authorAvatar),
      verified: row.authorVerified === 1,
    },
  };
}

function getVideoStub(db, videoId) {
  return db
    .prepare(`SELECT id, userId FROM user_videos WHERE id = ?`)
    .get(String(videoId));
}

function getCommentById(db, commentId) {
  return db
    .prepare(
      `SELECT c.*, v.userId AS videoOwnerId
       FROM user_video_comments c
       LEFT JOIN user_videos v ON v.id = c.videoId
       WHERE c.id = ?`,
    )
    .get(String(commentId));
}

/** Top-level comments + one level of replies, flat, newest first. */
function listPixieComments(db, { videoId, viewerId = null }) {
  const video = getVideoStub(db, videoId);
  if (!video) throw new PixieCommentError(404, "not found");

  const rows = db
    .prepare(
      `SELECT c.id, c.content, c.createdAt, c.parentId, c.likes,
              u.id AS authorId, u.username AS authorUsername, u.avatar AS authorAvatar,
              u.verified AS authorVerified,
              (SELECT COUNT(*) FROM user_video_comments r WHERE r.parentId = c.id) AS replyCount
       FROM user_video_comments c
       LEFT JOIN users u ON u.id = c.userId
       WHERE c.videoId = ?
       ORDER BY c.createdAt DESC`,
    )
    .all(video.id);

  return rows.map((row) => mapCommentRow(row, viewerId));
}

/**
 * Add a comment or a reply. Fires "reply" / "comment" inbox notifications for
 * the affected users (never for the actor themselves). Returns the new comment
 * in the same shape the feed uses.
 */
function createPixieComment(db, { videoId, user, content: rawContent, parentId: rawParentId }) {
  const video = getVideoStub(db, videoId);
  if (!video) throw new PixieCommentError(404, "not found");

  const content = String(rawContent || "").trim();
  if (!content) throw new PixieCommentError(400, "Comment cannot be empty");
  if (content.length > COMMENT_MAX_LENGTH) {
    throw new PixieCommentError(400, "Comment is too long");
  }

  // The comment being replied to (may itself be a reply); used both to attach
  // the new row to the right root and to route the notification.
  let parentId = null;
  let repliedToComment = null;
  const parentIdInput = String(rawParentId || "").trim();
  if (parentIdInput) {
    const parent = getCommentById(db, parentIdInput);
    if (!parent || parent.videoId !== video.id) {
      throw new PixieCommentError(400, "Parent comment not found");
    }
    repliedToComment = parent;
    // One level only: a reply to a reply attaches to the same root.
    parentId = parent.parentId || parent.id;
  }

  const id = makeId();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO user_video_comments (id, videoId, userId, content, parentId, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, video.id, user.id, content, parentId, createdAt);

  try {
    const actor = { id: user.id, username: user.username, avatar: user.avatar };
    if (
      repliedToComment &&
      repliedToComment.userId &&
      repliedToComment.userId !== user.id
    ) {
      createPixieNotification(db, {
        userId: repliedToComment.userId,
        type: "reply",
        actor,
        videoId: video.id,
        commentId: id,
        preview: content,
      });
    }
    // Notify the video owner about any comment on their clip, unless they
    // authored it or already got the reply notification just above.
    if (
      video.userId &&
      video.userId !== user.id &&
      (!repliedToComment || video.userId !== repliedToComment.userId)
    ) {
      createPixieNotification(db, {
        userId: video.userId,
        type: "comment",
        actor,
        videoId: video.id,
        commentId: id,
        preview: content,
      });
    }
  } catch {
    // Never let a notification failure break commenting.
  }

  return {
    id,
    content,
    createdAt,
    parentId,
    likesCount: 0,
    likedByMe: false,
    replyCount: 0,
    author: {
      id: user.id,
      username: user.username,
      avatar: localAvatarOrNull(user.avatar),
    },
  };
}

/** Toggle the viewer's like on a comment. Fires a "comment_like" notification. */
function togglePixieCommentLike(db, { commentId, user }) {
  const comment = getCommentById(db, commentId);
  if (!comment) throw new PixieCommentError(404, "not found");

  const likes = parseLikes(comment.likes);
  const existingIndex = likes.indexOf(user.id);
  let liked = false;
  if (existingIndex >= 0) {
    likes.splice(existingIndex, 1);
  } else {
    likes.push(user.id);
    liked = true;
  }

  db.prepare(`UPDATE user_video_comments SET likes = ? WHERE id = ?`).run(
    JSON.stringify(likes),
    comment.id,
  );

  if (liked && comment.userId && comment.userId !== user.id) {
    try {
      createPixieNotification(db, {
        userId: comment.userId,
        type: "comment_like",
        actor: { id: user.id, username: user.username, avatar: user.avatar },
        videoId: comment.videoId,
        commentId: comment.id,
        preview: comment.content,
      });
    } catch {
      // Non-fatal.
    }
  }

  return { liked, likesCount: likes.length };
}

/** Delete a comment (its author, the video owner, or the site owner). */
function deletePixieComment(db, { commentId, user }) {
  const comment = getCommentById(db, commentId);
  if (!comment) throw new PixieCommentError(404, "not found");

  const isAuthor = comment.userId === user.id;
  const isVideoOwner = comment.videoOwnerId === user.id;
  if (!isAuthor && !isVideoOwner && !isOwner(user)) {
    throw new PixieCommentError(403, "forbidden");
  }

  db.prepare(`DELETE FROM user_video_comments WHERE id = ?`).run(comment.id);
  // Deleting a top-level comment removes its replies too.
  if (!comment.parentId) {
    db.prepare(`DELETE FROM user_video_comments WHERE parentId = ?`).run(
      comment.id,
    );
  }

  return { ok: true };
}

/** Wipe every comment on a video — used when the video itself is deleted. */
function deletePixieCommentsForVideo(db, videoId) {
  db.prepare(`DELETE FROM user_video_comments WHERE videoId = ?`).run(
    String(videoId),
  );
}

module.exports = {
  COMMENT_MAX_LENGTH,
  PixieCommentError,
  listPixieComments,
  createPixieComment,
  togglePixieCommentLike,
  deletePixieComment,
  deletePixieCommentsForVideo,
};
