const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const express = require("express");
const bodyParser = require("body-parser");

const {
  DEFAULT_JSON_LIMIT,
  LARGE_JSON_LIMIT,
  needsLargeJsonLimit,
  createJsonBodyParser,
} = require("../lib/body-limits");

function startServer({ authenticated }) {
  const app = express();
  app.use(
    createJsonBodyParser({
      authFromReq: () => (authenticated ? { id: "owner" } : null),
    }),
  );
  app.use(bodyParser.urlencoded({ limit: DEFAULT_JSON_LIMIT, extended: true }));

  app.post("/posts", (req, res) => res.json({ ok: true, bytes: JSON.stringify(req.body || {}).length }));
  app.put("/posts/:id", (req, res) => res.json({ ok: true, id: req.params.id }));
  app.post("/posts/:id/comments", (req, res) => res.json({ ok: true }));
  app.post("/guestbook", (req, res) => res.json({ ok: true }));

  // Mirror app.js's terminal error handler so a body-parser 413 keeps its status.
  app.use((err, _req, res, _next) => {
    const status =
      Number.isInteger(err && err.status) && err.status >= 400 && err.status < 600
        ? err.status
        : 500;
    res.status(status).json({ error: status >= 500 ? "internal" : "request failed" });
  });

  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function sendJson(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

test("needsLargeJsonLimit covers post create/edit only", () => {
  assert.equal(needsLargeJsonLimit("POST", "/posts"), true);
  assert.equal(needsLargeJsonLimit("POST", "/posts/"), true);
  assert.equal(needsLargeJsonLimit("PUT", "/posts/1789304125788"), true);
  assert.equal(needsLargeJsonLimit("PUT", "/posts/1789304125788?x=1"), true);
  assert.equal(needsLargeJsonLimit("DELETE", "/posts/1789304125788"), false);
  // Nested writes carry tiny bodies and stay on the default cap.
  assert.equal(needsLargeJsonLimit("POST", "/posts/1/comments"), false);
  assert.equal(needsLargeJsonLimit("POST", "/guestbook"), false);
  assert.equal(needsLargeJsonLimit("GET", "/posts"), false);
  // Prefix collision must not opt in.
  assert.equal(needsLargeJsonLimit("POST", "/postscript"), false);
});

test("POST /posts accepts a body over the default cap", async () => {
  const { server, port } = await startServer({ authenticated: true });
  try {
    const res = await sendJson(port, "POST", "/posts", {
      title: "Big post",
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x".repeat(3 * 1024 * 1024) }] }] },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("PUT /posts/:id accepts a body over the default cap", async () => {
  const { server, port } = await startServer({ authenticated: true });
  try {
    const res = await sendJson(port, "PUT", "/posts/1789304125788", {
      title: "Edited",
      content: { type: "doc", content: [] },
      padding: "y".repeat(3 * 1024 * 1024),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.id, "1789304125788");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("an unauthenticated post save gets 401 before the body is buffered", async () => {
  const { server, port } = await startServer({ authenticated: false });
  try {
    const res = await sendJson(port, "POST", "/posts", { title: "nope" });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, "unauthorized");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("other routes still reject a body over the default cap with 413", async () => {
  const { server, port } = await startServer({ authenticated: true });
  try {
    const res = await sendJson(port, "POST", "/guestbook", {
      text: "z".repeat(3 * 1024 * 1024),
    });
    assert.equal(res.status, 413);
    assert.equal(res.body.error, "request failed");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("an over-cap post save is still rejected with 413", async () => {
  const { server, port } = await startServer({ authenticated: true });
  try {
    // Larger than the route-level cap, so the request is refused rather than
    // buffered indefinitely.
    const res = await sendJson(port, "POST", "/posts", {
      title: "runaway",
      content: "w".repeat(26 * 1024 * 1024),
    });
    assert.equal(res.status, 413);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
