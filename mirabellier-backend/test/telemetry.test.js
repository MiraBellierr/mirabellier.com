const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const Database = require("better-sqlite3");

const { createTelemetryTables } = require("../lib/db");
const registerTelemetryRoutes = require("../routes/telemetry");

function makeApp() {
  const db = new Database(":memory:");
  createTelemetryTables(db);
  const app = express();
  registerTelemetryRoutes(app, { db });
  const server = app.listen(0);
  return { db, server };
}

async function post(server, path, body, headers) {
  const { port } = server.address();
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function withApp(run) {
  return async () => {
    const { db, server } = makeApp();
    await new Promise((resolve) => server.once("listening", resolve));
    try {
      await run({ db, server });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      db.close();
    }
  };
}

test(
  "vitals: stores one row per valid metric and drops invalid ones",
  withApp(async ({ db, server }) => {
    const res = await post(server, "/telemetry/vitals", {
      path: "/blog/hello",
      nav: "navigate",
      conn: "4g",
      metrics: [
        { name: "LCP", value: 2100.4, rating: "good" },
        { name: "cls", value: 0.03, rating: "good" }, // lowercase name accepted
        { name: "INP", value: -5 }, // negative -> rejected
        { name: "TTFB", value: 9e9 }, // absurd -> rejected
        { name: "BOGUS", value: 1 }, // unknown metric -> rejected
      ],
    });
    assert.equal(res.status, 204);

    const rows = db
      .prepare("SELECT metric, value, rating, path, connection FROM client_vitals ORDER BY metric")
      .all();
    assert.deepEqual(
      rows.map((r) => r.metric),
      ["CLS", "LCP"],
    );
    assert.equal(rows[1].value, 2100.4);
    assert.equal(rows[1].rating, "good");
    assert.equal(rows[0].path, "/blog/hello");
    assert.equal(rows[0].connection, "4g");
  }),
);

test(
  "vitals: empty / malformed payloads are accepted without inserting",
  withApp(async ({ db, server }) => {
    assert.equal((await post(server, "/telemetry/vitals", {})).status, 204);
    assert.equal(
      (await post(server, "/telemetry/vitals", "not json")).status,
      204,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) c FROM client_vitals").get().c,
      0,
    );
  }),
);

test(
  "errors: stores a valid error and skips one with no message",
  withApp(async ({ db, server }) => {
    const ok = await post(server, "/telemetry/errors", {
      kind: "unhandledrejection",
      message: "TypeError: x is not a function",
      stack: "at a (b.js:1:2)",
      source: "https://mirabellier.com/assets/index-abc.js",
      lineno: 1,
      colno: 2,
      path: "/arena",
    });
    assert.equal(ok.status, 204);

    const skipped = await post(server, "/telemetry/errors", {
      kind: "error",
      message: "   ",
    });
    assert.equal(skipped.status, 204);

    const rows = db.prepare("SELECT * FROM client_errors").all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "unhandledrejection");
    assert.equal(rows[0].lineno, 1);
    assert.equal(rows[0].path, "/arena");
  }),
);

test(
  "errors: an unknown kind is rejected",
  withApp(async ({ db, server }) => {
    const res = await post(server, "/telemetry/errors", {
      kind: "warning",
      message: "something",
    });
    assert.equal(res.status, 204);
    assert.equal(
      db.prepare("SELECT COUNT(*) c FROM client_errors").get().c,
      0,
    );
  }),
);

test(
  "errors: over-long strings are truncated",
  withApp(async ({ db, server }) => {
    await post(server, "/telemetry/errors", {
      kind: "error",
      message: "m".repeat(5000),
      stack: "s".repeat(9000),
    });
    const row = db.prepare("SELECT message, stack FROM client_errors").get();
    assert.equal(row.message.length, 1000);
    assert.equal(row.stack.length, 4000);
  }),
);
