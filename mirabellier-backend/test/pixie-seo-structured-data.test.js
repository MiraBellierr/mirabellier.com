const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const os = require("node:os");

const express = require("express");
const Database = require("better-sqlite3");

const { initializeSchema } = require("../lib/db");
const registerPixieRoutes = require("../routes/pixies");

// The crawler shells under /pixies embed JSON-LD. They used to be serialized
// with the HTML escaper, which turned `"` into `&quot;` *inside* the
// <script type="application/ld+json"> block — and HTML entities are not
// decoded in a script element, so Search Console reported
// "Parsing error: Missing '}' or object member name" for /pixies. These tests
// lock the wire format: whatever we send must JSON.parse() as-is.
const GOOGLEBOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

function startServer() {
  const db = new Database(":memory:");
  initializeSchema(db);

  db.prepare(
    `INSERT INTO users (id, username, avatar, verified)
     VALUES (@id, @username, @avatar, @verified)`,
  ).run({
    id: "u1",
    username: "mira",
    avatar: "/images/avatars/mira.png",
    verified: 1,
  });

  db.prepare(
    `INSERT INTO user_videos
       (id, userId, title, filename, mimeType, sizeBytes, durationSeconds,
        tags, likes, createdAt)
     VALUES (@id, @userId, @title, @filename, @mimeType, @sizeBytes,
             @durationSeconds, @tags, '[]', @createdAt)`,
  ).run({
    id: "vid1",
    userId: "u1",
    title: 'A "quoted" clip & <friends>',
    filename: "vid1.mp4",
    mimeType: "video/mp4",
    sizeBytes: 1234,
    durationSeconds: 12,
    tags: JSON.stringify(["cute", "clips"]),
    createdAt: "2026-09-10T08:00:00.000Z",
  });

  const app = express();
  registerPixieRoutes(app, {
    db,
    authFromReq: () => null,
    VIDEOS_DIR: os.tmpdir(),
    IMAGES_DIR: os.tmpdir(),
    videoUpload: { single: () => (_req, _res, next) => next() },
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
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

// Pull the ld+json payload straight out of the served HTML, the way a crawler
// does, without decoding HTML entities the way a browser-only parser would.
function extractLdJson(html) {
  const match = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  );
  assert.ok(match, "expected an application/ld+json script in the crawl shell");
  return match[1];
}

test("GET /pixies serves parseable CollectionPage JSON-LD to crawlers", async () => {
  const { server, port } = await startServer();
  try {
    const res = await request(port, "/pixies", {
      "user-agent": GOOGLEBOT_UA,
    });

    assert.equal(res.status, 200);
    const raw = extractLdJson(res.body);

    // The exact failure Search Console reported: this threw on `&quot;`.
    const parsed = JSON.parse(raw);
    assert.equal(parsed["@type"], "CollectionPage");
    assert.equal(parsed.name, "Pixies · Mirabellier");
    assert.equal(parsed.url, `http://127.0.0.1:${port}/pixies`);
    assert.equal(parsed.isPartOf["@type"], "WebSite");
  } finally {
    server.close();
  }
});

test("GET /pixies/<id> serves parseable VideoObject JSON-LD with tricky captions", async () => {
  const { server, port } = await startServer();
  try {
    const res = await request(port, "/pixies/vid1", {
      "user-agent": GOOGLEBOT_UA,
    });

    assert.equal(res.status, 200);
    const raw = extractLdJson(res.body);
    const parsed = JSON.parse(raw);

    assert.equal(parsed["@type"], "VideoObject");
    assert.equal(parsed.name, "@mira · Pixies");
    assert.equal(parsed.description, 'A "quoted" clip & <friends>');
    assert.equal(
      parsed.contentUrl,
      `http://127.0.0.1:${port}/videos/vid1.mp4`,
    );
    assert.equal(parsed.keywords, "cute, clips");
  } finally {
    server.close();
  }
});

test("crawl shells never emit HTML entities inside the ld+json block", async () => {
  const { server, port } = await startServer();
  try {
    for (const path of ["/pixies", "/pixies/vid1"]) {
      const res = await request(port, path, { "user-agent": GOOGLEBOT_UA });
      const raw = extractLdJson(res.body);
      assert.doesNotMatch(raw, /&quot;|&amp;|&lt;|&gt;/, path);
      // `<` / `>` must be \u003c-escaped so a caption can't close the script.
      assert.doesNotMatch(raw, /<\/script/i, path);
    }
  } finally {
    server.close();
  }
});

// Discord folds the entire head into its unfurl — `<title>`/description land
// as the card text and a JSON-LD VideoObject supplies the thumbnail — so a
// shared pixie used to render as a full article card with the video tucked
// underneath. The Discord shell must therefore carry the player metadata and
// nothing Discord can turn into card chrome, while every other crawler keeps
// the full page.
const DISCORD_UA = "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)";

test("GET /pixies/<id> serves Discordbot a player-only shell", async () => {
  const { server, port } = await startServer();
  try {
    const res = await request(port, "/pixies/vid1", {
      "user-agent": DISCORD_UA,
    });

    assert.equal(res.status, 200);

    // What makes Discord render the inline player.
    assert.match(res.body, /<meta property="og:video" content="[^"]*vid1\.mp4" \/>/);
    assert.match(res.body, /<meta property="og:video:url" content="[^"]*vid1\.mp4" \/>/);
    assert.match(res.body, /<meta property="og:video:secure_url" content="[^"]*vid1\.mp4" \/>/);
    assert.match(res.body, /<meta property="og:video:type" content="video\/mp4" \/>/);
    assert.match(res.body, /<meta property="og:video:width" content="\d+" \/>/);
    assert.match(res.body, /<meta property="og:video:height" content="\d+" \/>/);
    assert.match(res.body, /<meta property="og:type" content="video\.other" \/>/);

    // Nothing Discord can fold into a title/description/thumbnail.
    assert.doesNotMatch(res.body, /property="og:title"/i);
    assert.doesNotMatch(res.body, /property="og:description"/i);
    assert.doesNotMatch(res.body, /property="og:image"/i);
    assert.doesNotMatch(res.body, /property="og:site_name"/i);
    assert.doesNotMatch(res.body, /name="twitter:/i);
    assert.doesNotMatch(res.body, /name="description"/i);
    // A JSON-LD VideoObject would hand Discord the thumbnail + card text.
    assert.doesNotMatch(res.body, /application\/ld\+json/i);
  } finally {
    server.close();
  }
});

test("non-Discord crawlers still get the full pixie card", async () => {
  const { server, port } = await startServer();
  try {
    for (const ua of [
      GOOGLEBOT_UA,
      "Mozilla/5.0 (compatible; Twitterbot/1.0)",
      "Mozilla/5.0 (compatible; Slackbot-LinkExpanding 1.0)",
    ]) {
      const res = await request(port, "/pixies/vid1", { "user-agent": ua });
      assert.equal(res.status, 200);
      assert.match(res.body, /property="og:title"/i, ua);
      assert.match(res.body, /property="og:image"/i, ua);
      assert.match(res.body, /application\/ld\+json/i, ua);
      assert.match(res.body, /<meta name="description"/i, ua);
    }
  } finally {
    server.close();
  }
});
