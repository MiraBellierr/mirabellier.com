const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const express = require("express");
const Database = require("better-sqlite3");

const registerGuestbookRoutes = require("../routes/guestbook");
const { NOTE_SIZE } = require("../lib/guestbook-position");

// The route verifies a Turnstile token before accepting a note. Tests must not
// reach Cloudflare, so the documented dev bypass is enabled for this file.
// `node --test` gives each test file its own process, so this cannot leak.
process.env.TURNSTILE_DEV_BYPASS = "true";

// End-to-end through the real route (not a stub), so the POST path that used to
// write (0, 0) is exercised: the sign form posted `x: 0, y: 0`, the API has to
// ignore that when the corner is taken, and every new note must land somewhere
// that does not overlap an existing one.
function makeApp(rows = []) {
  const db = new Database(":memory:");
  db.prepare(
    `CREATE TABLE guestbook_entries (
       id TEXT PRIMARY KEY,
       userId TEXT,
       author TEXT NOT NULL,
       message TEXT NOT NULL,
       website TEXT,
       mood TEXT,
       x INTEGER,
       y INTEGER,
       createdAt TEXT NOT NULL
     )`,
  ).run();

  const insert = db.prepare(
    "INSERT INTO guestbook_entries (id, userId, author, message, website, mood, x, y, createdAt) VALUES (?, NULL, ?, ?, NULL, ?, ?, ?, ?)",
  );
  for (const row of rows) {
    insert.run(
      row.id,
      row.author || "someone",
      row.message || "hi",
      row.mood || "sparkly",
      row.x,
      row.y,
      row.createdAt || "2026-01-01T00:00:00.000Z",
    );
  }

  const app = express();
  app.use(express.json());
  registerGuestbookRoutes(app, {
    db,
    authFromReq: () => null,
    getUserById: () => null,
    userPublic: () => null,
  });

  return { db, server: http.createServer(app) };
}

function request(server, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port: server.address().port,
        path,
        method,
        headers: payload
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            }
          : {},
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null }),
        );
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function withServer(rows, run) {
  return async () => {
    const { db, server } = makeApp(rows);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      await run({ db, server });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      db.close();
    }
  };
}

/** The exact body the sign form sends (no coordinates). */
const signBody = (i) => ({
  name: `visitor ${i}`,
  message: `note ${i}`,
  mood: "sparkly",
  turnstileToken: "x",
});

test(
  "a new note does not spawn on an existing one",
  withServer([{ id: "existing", author: "first", x: 48, y: 48 }], async ({ server }) => {
    const res = await request(server, "POST", "/guestbook", signBody(0));

    assert.equal(res.status, 201);
    assert.equal(
      Math.abs(res.body.x - 48) < NOTE_SIZE && Math.abs(res.body.y - 48) < NOTE_SIZE,
      false,
      `new note at ${res.body.x},${res.body.y} overlaps the existing one`,
    );
  }),
);

test(
  "the sign form's old 0,0 placeholder is ignored once the corner is taken",
  withServer([{ id: "corner", author: "first", x: 0, y: 0 }], async ({ server }) => {
    const res = await request(server, "POST", "/guestbook", {
      ...signBody(0),
      x: 0,
      y: 0,
    });

    assert.equal(res.status, 201);
    assert.notDeepEqual({ x: res.body.x, y: res.body.y }, { x: 0, y: 0 });
  }),
);

test(
  "many notes in a row never spawn on top of each other",
  withServer([], async ({ server }) => {
    const placed = [];
    for (let i = 0; i < 12; i += 1) {
      const res = await request(server, "POST", "/guestbook", signBody(i));
      assert.equal(res.status, 201, `post ${i} failed: ${JSON.stringify(res.body)}`);
      placed.push({ x: res.body.x, y: res.body.y });
    }

    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const overlaps =
          Math.abs(placed[i].x - placed[j].x) < NOTE_SIZE &&
          Math.abs(placed[i].y - placed[j].y) < NOTE_SIZE;
        assert.equal(
          overlaps,
          false,
          `note ${i} (${placed[i].x},${placed[i].y}) overlaps note ${j} (${placed[j].x},${placed[j].y})`,
        );
      }
    }

    // All distinct slots, not the same one re-saved.
    assert.equal(new Set(placed.map((p) => `${p.x},${p.y}`)).size, placed.length);
  }),
);

// A coordinate that IS free should still be honored, so a drag-to-place flow or
// an admin tool keeps working.
test(
  "a free client coordinate is still honored",
  withServer([], async ({ server }) => {
    const res = await request(server, "POST", "/guestbook", {
      ...signBody(0),
      x: 1200,
      y: 900,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.x, 1200);
    assert.equal(res.body.y, 900);
  }),
);

test(
  "the board fans legacy notes out instead of stacking them",
  withServer(
    [
      // Rows saved by the old bug: several notes at the same coordinate.
      { id: "a", author: "a", x: 0, y: 0 },
      { id: "b", author: "b", x: 0, y: 0 },
      { id: "c", author: "c", x: 48, y: 48 },
    ],
    async ({ server }) => {
      const res = await request(server, "GET", "/guestbook");
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 3);

      const positions = res.body.map((entry) => ({ x: entry.x, y: entry.y }));
      for (let i = 0; i < positions.length; i += 1) {
        for (let j = i + 1; j < positions.length; j += 1) {
          const overlaps =
            Math.abs(positions[i].x - positions[j].x) < NOTE_SIZE &&
            Math.abs(positions[i].y - positions[j].y) < NOTE_SIZE;
          assert.equal(
            overlaps,
            false,
            `entry ${i} (${positions[i].x},${positions[i].y}) overlaps entry ${j} (${positions[j].x},${positions[j].y})`,
          );
        }
      }
    },
  ),
);

test(
  "a genuine stored position is preserved",
  withServer([{ id: "keeper", author: "keeper", x: 2200, y: 1400 }], async ({ server }) => {
    const res = await request(server, "GET", "/guestbook");
    const keeper = res.body.find((entry) => entry.id === "keeper");
    assert.deepEqual({ x: keeper.x, y: keeper.y }, { x: 2200, y: 1400 });
  }),
);

test(
  "legacy rows with NULL coordinates are still placed",
  withServer(
    [
      { id: "null1", author: "n1", x: null, y: null },
      { id: "null2", author: "n2", x: null, y: null },
    ],
    async ({ server }) => {
      const res = await request(server, "GET", "/guestbook");
      assert.equal(res.status, 200);

      for (const entry of res.body) {
        assert.ok(Number.isFinite(entry.x), `x missing for ${entry.id}`);
        assert.ok(Number.isFinite(entry.y), `y missing for ${entry.id}`);
      }

      const [a, b] = res.body;
      const overlaps =
        Math.abs(a.x - b.x) < NOTE_SIZE && Math.abs(a.y - b.y) < NOTE_SIZE;
      assert.equal(overlaps, false, "NULL-coordinate rows must not stack either");
    },
  ),
);

test(
  "moving a note returns the position that was saved",
  withServer([{ id: "mover", author: "m", x: 48, y: 48 }], async ({ server }) => {
    const res = await request(server, "PATCH", "/guestbook/mover/position", {
      x: 1500,
      y: 800,
    });

    assert.equal(res.status, 200);
    assert.deepEqual({ x: res.body.x, y: res.body.y }, { x: 1500, y: 800 });
  }),
);
