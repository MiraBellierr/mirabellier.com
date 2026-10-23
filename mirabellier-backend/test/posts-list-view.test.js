const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const express = require("express");
const Database = require("better-sqlite3");

const registerPostsRoutes = require("../routes/posts");

function text(value) {
  return { type: "text", text: value };
}

function paragraph(value) {
  return { type: "paragraph", content: [text(value)] };
}

function doc(...content) {
  return { type: "doc", content };
}

// Spin the posts router up on a bare app with an in-memory DB, mirroring
// post-og-route.test.js. The list view must serialize summaries (no tiptap
// `content`, no comment bodies) and derive excerpt/reading/counts server-side.
function startServer() {
  const db = new Database(":memory:");
  db.prepare(
    `CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, avatar TEXT)`,
  ).run();
  db.prepare(
    `CREATE TABLE posts (
      id TEXT PRIMARY KEY, title TEXT, content TEXT, userId TEXT, author TEXT,
      shortDescription TEXT, thumbnail TEXT, audioUrl TEXT, series TEXT,
      tags TEXT, likes TEXT, comments TEXT, createdAt TEXT, updatedAt TEXT
    )`,
  ).run();

  db.prepare(
    `INSERT INTO posts (id, title, content, userId, author, shortDescription, thumbnail, series, tags, likes, comments, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "p1",
    "A Rich Post",
    JSON.stringify(
      doc(
        paragraph(
          Array.from({ length: 220 }, (_, i) => `word${i}`).join(" "),
        ),
      ),
    ),
    "u1",
    null,
    null,
    "/images/thumb.png",
    "My Series",
    JSON.stringify(["life", "notes"]),
    JSON.stringify(["user-1", "user-2"]),
    JSON.stringify([
      { id: "c1", userId: "u1", text: "hello", createdAt: "2026-01-01" },
      {
        id: "c2",
        userId: null,
        text: "reply",
        parentId: "c1",
        createdAt: "2026-01-02",
      },
    ]),
    "2026-09-10T08:00:00.000Z",
    "2026-09-11T09:00:00.000Z",
  );

  db.prepare(
    `INSERT INTO users (id, username, avatar) VALUES (?, ?, ?)`,
  ).run("u1", "mira", "/avatars/mira.png");

  const app = express();
  registerPostsRoutes(app, {
    db,
    getUserById: (id) => (id === "u1" ? { id: "u1", username: "mira", avatar: "/avatars/mira.png" } : null),
    userPublic: (user) => user,
    authFromReq: () => null,
  });

  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, db, port });
    });
  });
}

function getJson(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
        });
      });
    }).on("error", reject);
  });
}

test("GET /posts?view=list returns summaries without content or comment bodies", async () => {
  const { server, db, port } = await startServer();
  try {
    const res = await getJson(port, "/posts?view=list");
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);

    const [post] = res.body;
    assert.equal(post.id, "p1");
    assert.equal(post.title, "A Rich Post");
    assert.equal(post.author, "mira");
    assert.equal(post.authorAvatar, "/avatars/mira.png");
    assert.equal("content" in post, false);
    assert.equal("comments" in post, false);
    assert.equal("likes" in post, false);

    // Derived fields the SPA renders directly.
    assert.equal(post.likeCount, 2);
    assert.equal(post.commentCount, 2);
    assert.equal(post.readingMinutes, 1); // 222 words at 200 wpm → rounds to 1
    assert.equal(post.series, "My Series");
    assert.deepEqual(post.tags, ["life", "notes"]);
    assert.equal(post.excerpt.startsWith("word0 word1"), true);
    assert.equal(post.excerpt.length <= 320, true);
    assert.equal(post.thumbnail, "/images/thumb.png");
    assert.equal(post.createdAt, "2026-09-10T08:00:00.000Z");
    assert.equal(post.updatedAt, "2026-09-11T09:00:00.000Z");

    // Public list data is cacheable (unlike the bare route): short shared TTL
    // plus stale-while-revalidate, and no CDN opt-out.
    assert.match(
      res.headers["cache-control"],
      /^public, max-age=60, stale-while-revalidate=300$/,
    );
    assert.equal(res.headers["surrogate-control"], undefined);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});

test("GET /posts (bare) still returns full documents", async () => {
  const { server, db, port } = await startServer();
  try {
    const res = await getJson(port, "/posts");
    assert.equal(res.status, 200);

    const [post] = res.body;
    assert.equal(typeof post.content, "object");
    assert.equal(Array.isArray(post.likes), true);
    assert.equal(Array.isArray(post.comments), true);
    assert.equal(post.comments.length, 1);
    assert.equal(post.comments[0].children.length, 1);

    // The editor reads the bare route while editing — it must stay no-store.
    assert.match(res.headers["cache-control"], /^no-store/);
    assert.equal(res.headers["surrogate-control"], "no-store");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});

test("unrecognized view falls back to the full payload", async () => {
  const { server, db, port } = await startServer();
  try {
    const res = await getJson(port, "/posts?view=full");
    assert.equal(res.status, 200);
    assert.equal("content" in res.body[0], true);
    assert.match(res.headers["cache-control"], /^no-store/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
