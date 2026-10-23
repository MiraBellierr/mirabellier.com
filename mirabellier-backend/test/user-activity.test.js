const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const { initializeSchema } = require("../lib/db");
const { getUserActivity } = require("../lib/user-activity");

function createTestDb() {
  const db = new Database(":memory:");
  initializeSchema(db);
  return db;
}

function insertUser(db, id, username) {
  db.prepare("INSERT INTO users (id, username, createdAt) VALUES (?, ?, ?)").run(
    id,
    username,
    new Date().toISOString(),
  );
}

test("returns nothing for a user with no activity", () => {
  const db = createTestDb();
  insertUser(db, "u1", "mira");
  assert.deepEqual(getUserActivity(db, "u1"), []);
});

test("posts, guestbook, pixies, pixie comments, follows, and arena fights all show up", () => {
  const db = createTestDb();
  insertUser(db, "u1", "mira");
  insertUser(db, "u2", "friend");

  db.prepare(
    `INSERT INTO posts (id, title, content, userId, createdAt, updatedAt) VALUES (?, ?, '{}', ?, ?, ?)`,
  ).run("p1", "Hello world", "u1", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");

  db.prepare(
    `INSERT INTO guestbook_entries (id, userId, author, message, createdAt) VALUES (?, ?, ?, ?, ?)`,
  ).run("g1", "u1", "mira", "hi everyone!", "2026-01-02T00:00:00.000Z");

  db.prepare(
    `INSERT INTO user_videos (id, userId, title, filename, mimeType, createdAt) VALUES (?, ?, ?, 'a.mp4', 'video/mp4', ?)`,
  ).run("v1", "u1", "a clip", "2026-01-03T00:00:00.000Z");

  db.prepare(
    `INSERT INTO user_video_comments (id, videoId, userId, content, createdAt) VALUES (?, ?, ?, ?, ?)`,
  ).run("c1", "v1", "u1", "nice clip!", "2026-01-04T00:00:00.000Z");

  db.prepare(
    `INSERT INTO user_follows (followerId, followingId, createdAt) VALUES (?, ?, ?)`,
  ).run("u1", "u2", "2026-01-05T00:00:00.000Z");

  db.prepare(
    `INSERT INTO arena_fights (id, userId, result, roundsJson, createdAt) VALUES (?, ?, ?, '[]', ?)`,
  ).run("f1", "u1", "win", "2026-01-06T00:00:00.000Z");

  const events = getUserActivity(db, "u1");
  const types = events.map((e) => e.type);
  assert.deepEqual(types, [
    "arena_fight",
    "follow",
    "pixie_comment",
    "pixie",
    "guestbook",
    "post",
  ]);

  const follow = events.find((e) => e.type === "follow");
  assert.equal(follow.username, "friend");
  assert.equal(follow.href, "/profile/friend");

  const fight = events.find((e) => e.type === "arena_fight");
  assert.equal(fight.result, "win");
  assert.equal(fight.href, "/arena/fight/f1");

  const post = events.find((e) => e.type === "post");
  assert.equal(post.href, "/blog/p1");
  assert.equal(post.title, "Hello world");
});

test("finds blog comments nested at any depth, scoped to the right user", () => {
  const db = createTestDb();
  insertUser(db, "u1", "mira");
  insertUser(db, "u2", "other");
  insertUser(db, "author", "post-author");

  const comments = JSON.stringify([
    {
      id: "c1",
      userId: "u2",
      text: "top-level from someone else",
      createdAt: "2026-01-01T00:00:00.000Z",
      children: [
        {
          id: "c2",
          userId: "u1",
          text: "a reply from mira",
          createdAt: "2026-01-02T00:00:00.000Z",
          children: [],
        },
      ],
    },
  ]);

  db.prepare(
    `INSERT INTO posts (id, title, content, comments, userId, createdAt, updatedAt) VALUES (?, ?, '{}', ?, ?, ?, ?)`,
  ).run("p1", "A post", comments, "author", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");

  const mineEvents = getUserActivity(db, "u1");
  assert.equal(mineEvents.length, 1);
  assert.equal(mineEvents[0].type, "blog_comment");
  assert.equal(mineEvents[0].preview, "a reply from mira");
  assert.equal(mineEvents[0].href, "/blog/p1");

  const theirEvents = getUserActivity(db, "u2");
  assert.equal(theirEvents.length, 1);
  assert.equal(theirEvents[0].preview, "top-level from someone else");
});

test("merges every source and sorts newest first, capped to `limit`", () => {
  const db = createTestDb();
  insertUser(db, "u1", "mira");

  for (let i = 0; i < 5; i += 1) {
    db.prepare(
      `INSERT INTO posts (id, title, content, userId, createdAt, updatedAt) VALUES (?, ?, '{}', ?, ?, ?)`,
    ).run(`p${i}`, `post ${i}`, "u1", `2026-01-0${i + 1}T00:00:00.000Z`, `2026-01-0${i + 1}T00:00:00.000Z`);
  }

  const events = getUserActivity(db, "u1", { limit: 3 });
  assert.equal(events.length, 3);
  assert.deepEqual(
    events.map((e) => e.title),
    ["post 4", "post 3", "post 2"],
  );
});

test("a nonexistent user simply has no activity", () => {
  const db = createTestDb();
  assert.deepEqual(getUserActivity(db, "ghost"), []);
});
