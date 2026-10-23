const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const { initializeSchema } = require("../lib/db");
const { getSiteStats } = require("../lib/site-stats");

function createTestDb() {
  const db = new Database(":memory:");
  initializeSchema(db);
  return db;
}

test("all-zero stats on an empty database", () => {
  const db = createTestDb();
  const stats = getSiteStats(db);
  assert.deepEqual(stats, {
    postsCount: 0,
    guestbookCount: 0,
    guestbookMoods: [],
    topGuestbookMood: null,
    qotdQuestionsCount: 0,
    qotdAnswersCount: 0,
    arenaFightsCount: 0,
    arenaWinsCount: 0,
    pixiesCount: 0,
    usersCount: 0,
    sinceDate: null,
  });
});

test("counts posts, users, and Pixies", () => {
  const db = createTestDb();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users (id, username, createdAt) VALUES (?, ?, ?)").run("u1", "mira", now);
  db.prepare("INSERT INTO posts (id, title, content, userId, createdAt, updatedAt) VALUES (?, ?, '{}', ?, ?, ?)").run(
    "p1", "Hello", "u1", now, now,
  );
  db.prepare("INSERT INTO posts (id, title, content, userId, createdAt, updatedAt) VALUES (?, ?, '{}', ?, ?, ?)").run(
    "p2", "World", "u1", now, now,
  );
  db.prepare(
    "INSERT INTO user_videos (id, userId, title, filename, mimeType, createdAt) VALUES (?, ?, ?, 'a.mp4', 'video/mp4', ?)",
  ).run("v1", "u1", "clip", now);

  const stats = getSiteStats(db);
  assert.equal(stats.postsCount, 2);
  assert.equal(stats.usersCount, 1);
  assert.equal(stats.pixiesCount, 1);
});

test("guestbook mood breakdown is ordered by count, ties broken alphabetically", () => {
  const db = createTestDb();
  const now = new Date().toISOString();
  const sign = (id, mood) =>
    db
      .prepare(
        "INSERT INTO guestbook_entries (id, author, message, mood, createdAt) VALUES (?, 'a', 'hi', ?, ?)",
      )
      .run(id, mood, now);

  sign("g1", "cozy");
  sign("g2", "cozy");
  sign("g3", "sparkly");
  sign("g4", "chaotic");
  sign("g5", "chaotic");
  sign("g6", "sunny");

  const stats = getSiteStats(db);
  assert.equal(stats.guestbookCount, 6);
  assert.equal(stats.topGuestbookMood, "chaotic"); // tied with cozy at 2, "chaotic" < "cozy"
  assert.deepEqual(stats.guestbookMoods, [
    { mood: "chaotic", count: 2 },
    { mood: "cozy", count: 2 },
    { mood: "sparkly", count: 1 },
    { mood: "sunny", count: 1 },
  ]);
});

test("QOTD and Arena counts, including win/loss split", () => {
  const db = createTestDb();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO daily_questions (recordedDate, prompt, createdAt, updatedAt) VALUES (?, ?, ?, ?)").run(
    "2026-01-01", "favourite season?", now, now,
  );
  db.prepare(
    "INSERT INTO daily_question_answers (id, recordedDate, identityType, identityKey, answer, createdAt) VALUES (?, ?, 'user', 'u1', 'autumn', ?)",
  ).run("a1", "2026-01-01", now);
  db.prepare("INSERT INTO users (id, username, createdAt) VALUES (?, ?, ?)").run("u1", "mira", now);
  db.prepare("INSERT INTO arena_fights (id, userId, result, roundsJson, createdAt) VALUES (?, ?, 'win', '[]', ?)").run(
    "f1", "u1", now,
  );
  db.prepare("INSERT INTO arena_fights (id, userId, result, roundsJson, createdAt) VALUES (?, ?, 'loss', '[]', ?)").run(
    "f2", "u1", now,
  );

  const stats = getSiteStats(db);
  assert.equal(stats.qotdQuestionsCount, 1);
  assert.equal(stats.qotdAnswersCount, 1);
  assert.equal(stats.arenaFightsCount, 2);
  assert.equal(stats.arenaWinsCount, 1);
});

test("sinceDate is the earliest content date across sources", () => {
  const db = createTestDb();
  db.prepare("INSERT INTO users (id, username, createdAt) VALUES (?, ?, ?)").run(
    "u1", "mira", "2026-05-01T00:00:00.000Z",
  );
  db.prepare("INSERT INTO posts (id, title, content, userId, createdAt, updatedAt) VALUES (?, ?, '{}', ?, ?, ?)").run(
    "p1", "later", "u1", "2026-06-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z",
  );
  db.prepare(
    "INSERT INTO guestbook_entries (id, author, message, mood, createdAt) VALUES (?, 'a', 'hi', 'sparkly', ?)",
  ).run("g1", "2026-02-15T00:00:00.000Z"); // earliest
  db.prepare("INSERT INTO daily_questions (recordedDate, prompt, createdAt, updatedAt) VALUES (?, ?, ?, ?)").run(
    "2026-04-01", "q?", "2026-04-01T00:00:00.000Z", "2026-04-01T00:00:00.000Z",
  );

  const stats = getSiteStats(db);
  assert.equal(stats.sinceDate, "2026-02-15T00:00:00.000Z");
});
