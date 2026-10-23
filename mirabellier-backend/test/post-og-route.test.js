const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const express = require("express");
const Database = require("better-sqlite3");

const registerPostsRoutes = require("../routes/posts");

// Spin the posts router up on a bare app with an in-memory DB, so the test
// exercises real Express 5 routing (including the `/og/post/:slug` + `.png`
// suffix) and the crawler HTML the route emits.
function startServer() {
  const db = new Database(":memory:");
  db.prepare(
    `CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, avatar TEXT)`,
  ).run();
  db.prepare(
    `CREATE TABLE posts (
      id TEXT PRIMARY KEY, title TEXT, content TEXT, userId TEXT, author TEXT,
      shortDescription TEXT, thumbnail TEXT, tags TEXT, likes TEXT, comments TEXT,
      createdAt TEXT, updatedAt TEXT
    )`,
  ).run();

  db.prepare(
    `INSERT INTO posts (id, title, author, shortDescription, thumbnail, tags, createdAt, updatedAt)
     VALUES (@id, @title, @author, @shortDescription, @thumbnail, @tags, @createdAt, @updatedAt)`,
  ).run({
    id: "1736500000000",
    title: "A Post Without A Thumbnail",
    author: "mira",
    shortDescription: "Short and sweet.",
    thumbnail: null,
    tags: JSON.stringify(["life", "notes"]),
    createdAt: "2026-09-10T08:00:00.000Z",
    updatedAt: "2026-09-11T09:00:00.000Z",
  });

  db.prepare(
    `INSERT INTO posts (id, title, author, thumbnail, tags, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "1736600000000",
    "A Post With A Thumbnail",
    "mira",
    "/images/custom.png",
    null,
    "2026-09-10T08:00:00.000Z",
    null,
  );

  const app = express();
  registerPostsRoutes(app, {
    db,
    getUserById: () => null,
    userPublic: () => null,
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

function request(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method: "GET", headers },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

const DISCORD_UA = "Mozilla/5.0 (compatible; Discordbot/2.0)";

test("GET /og/post/:slug.png renders a PNG and caches hard when versioned", async () => {
  const { server, port } = await startServer();
  try {
    const res = await request(
      port,
      "/og/post/a-post-without-a-thumbnail-1736500000000.png?v=20260911T090000000Z",
    );

    assert.equal(res.status, 200);
    assert.equal(res.headers["content-type"], "image/png");
    assert.deepEqual([...res.body.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    assert.equal(res.body.readUInt32BE(16), 1200);
    assert.equal(res.body.readUInt32BE(20), 630);
    assert.match(res.headers["cache-control"], /immutable/);
  } finally {
    server.close();
  }
});

test("GET /og/post/:slug.png without a version query is short-lived", async () => {
  const { server, port } = await startServer();
  try {
    const res = await request(
      port,
      "/og/post/a-post-without-a-thumbnail-1736500000000.png",
    );
    assert.equal(res.status, 200);
    assert.match(res.headers["cache-control"], /max-age=300/);
  } finally {
    server.close();
  }
});

test("GET /og/post/:slug.png 404s for an unknown post", async () => {
  const { server, port } = await startServer();
  try {
    const res = await request(port, "/og/post/nope-9999999999999.png");
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test("crawler HTML points a thumbnail-less post at the generated card", async () => {
  const { server, port } = await startServer();
  try {
    const res = await request(
      port,
      "/blog/a-post-without-a-thumbnail-1736500000000",
      { "user-agent": DISCORD_UA },
    );
    const html = res.body.toString("utf8");

    assert.equal(res.status, 200);
    assert.match(
      html,
      /<meta property="og:image" content="[^"]*\/og\/post\/a-post-without-a-thumbnail-1736500000000\.png\?v=20260911T090000000Z"/,
    );
    assert.match(html, /<meta property="og:image:width" content="1200"/);
    assert.match(html, /<meta property="og:image:height" content="630"/);
  } finally {
    server.close();
  }
});

test("crawler HTML keeps a hand-picked thumbnail and omits generated dimensions", async () => {
  const { server, port } = await startServer();
  try {
    const res = await request(
      port,
      "/blog/a-post-with-a-thumbnail-1736600000000",
      { "user-agent": DISCORD_UA },
    );
    const html = res.body.toString("utf8");

    assert.equal(res.status, 200);
    assert.match(html, /<meta property="og:image" content="[^"]*\/images\/custom\.png"/);
    assert.doesNotMatch(html, /\/og\/post\//);
    assert.doesNotMatch(html, /og:image:width/);
  } finally {
    server.close();
  }
});
