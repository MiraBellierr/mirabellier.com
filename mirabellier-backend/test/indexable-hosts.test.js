const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const express = require("express");

const {
  createApiHostNoindexMiddleware,
  getIndexableHostname,
  isIndexableHostname,
  isMediaPath,
  normalizeHostname,
  shouldNoindexRequest,
} = require("../lib/indexable-hosts");

// The backend serves two roles from one Express app:
//   - https://api.mirabellier.com (the JSON API and preview HTML), and
//   - the main site's proxied crawler/OG routes (https://mirabellier.com/blog/...).
// nginx forwards the client's Host on both, so the audit finding
// ("api.mirabellier.com is indexable") is fixed by marking every
// non-canonical host noindex while leaving the main site indexable.

function withEnv(t, name, value) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}

test("normalizeHostname lowercases and strips a port", () => {
  assert.equal(normalizeHostname("API.Mirabellier.com"), "api.mirabellier.com");
  assert.equal(normalizeHostname("api.mirabellier.com:443"), "api.mirabellier.com");
  assert.equal(normalizeHostname("localhost:3000"), "localhost");
  assert.equal(normalizeHostname("  mirabellier.com  "), "mirabellier.com");
});

test("normalizeHostname handles bracketed IPv6 without losing the address", () => {
  assert.equal(normalizeHostname("[::1]:3000"), "::1");
  assert.equal(normalizeHostname("[2001:db8::1]"), "2001:db8::1");
  assert.equal(normalizeHostname("[::1]"), "::1");
});

test("normalizeHostname returns empty for missing values", () => {
  for (const value of [undefined, null, "", "   "]) {
    assert.equal(normalizeHostname(value), "");
  }
});

// Two hosts must never compare equal just because one had a default port.
test("a port never makes a foreign host look like the canonical one", () => {
  assert.equal(isIndexableHostname("api.mirabellier.com:443"), false);
  assert.equal(isIndexableHostname("api.mirabellier.com"), false);
  assert.equal(isIndexableHostname("mirabellier.com:443"), true);
});

test("the indexable hostname follows WEBSITE_BASE", (t) => {
  withEnv(t, "WEBSITE_BASE", "https://example.test");
  assert.equal(getIndexableHostname(), "example.test");
  assert.equal(isIndexableHostname("example.test"), true);
  assert.equal(isIndexableHostname("mirabellier.com"), false);
});

test("the indexable hostname falls back to the apex when unset or unparseable", (t) => {
  withEnv(t, "WEBSITE_BASE", undefined);
  assert.equal(getIndexableHostname(), "mirabellier.com");

  withEnv(t, "WEBSITE_BASE", "not a url");
  assert.equal(getIndexableHostname(), "mirabellier.com");

  withEnv(t, "WEBSITE_BASE", "");
  assert.equal(getIndexableHostname(), "mirabellier.com");
});

test("isMediaPath matches media with and without the /v1 prefix", () => {
  for (const media of [
    "/images/a.png",
    "/v1/images/a.png",
    "/videos/a.mp4",
    "/v1/videos/a.mp4",
    "/audio/a.mp3",
    "/v1/audio/a.mp3",
    // The generated blog title card, which the main site puts in og:image.
    "/og/post/some-slug-123.png",
    "/v1/og/post/some-slug-123.png",
  ]) {
    assert.equal(isMediaPath(media), true, media);
  }
});

test("isMediaPath does not match API surface or a bare directory", () => {
  for (const notMedia of [
    "/posts",
    "/v1/posts",
    "/images",
    "/v1/images",
    "/videos",
    "/og",
    "/og/post",
    "/question-of-the-day/archive",
    "/shrine/kanna",
    "/",
  ]) {
    assert.equal(isMediaPath(notMedia), false, notMedia);
  }
});

// The main site's proxied pages keep their crawler HTML indexable; only the
// API host is marked noindex.
test("proxied main-site requests stay indexable", () => {
  const req = { get: () => "mirabellier.com", path: "/blog/some-post" };
  assert.equal(shouldNoindexRequest(req), false);
});

test("API host requests are noindex, media excepted", () => {
  const api = (path) => ({ get: () => "api.mirabellier.com", path });

  assert.equal(shouldNoindexRequest(api("/posts")), true);
  assert.equal(shouldNoindexRequest(api("/")), true);
  assert.equal(shouldNoindexRequest(api("/question-of-the-day/archive")), true);
  // Media is how the main site embeds uploads; Google Images is a real channel.
  assert.equal(shouldNoindexRequest(api("/images/a.png")), false);
  assert.equal(shouldNoindexRequest(api("/v1/images/a.png")), false);
  assert.equal(shouldNoindexRequest(api("/videos/a.mp4")), false);
});

test("unknown hosts are noindex — the allowlist fails safe", () => {
  for (const host of [
    "penbot.mirabellier.com",
    "localhost:3000",
    "127.0.0.1:3000",
    "45.77.34.249",
    "preview.mirabellier.com",
    "mirabellier.com.evil.test",
  ]) {
    const req = { get: () => host, path: "/posts" };
    assert.equal(shouldNoindexRequest(req), true, host);
  }
});

// End-to-end through a real server, so the middleware's placement (before the
// rate limiters and every route) is exercised rather than assumed.
function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  app.use((req, _res, next) => {
    if (req.url === "/v1" || req.url.startsWith("/v1/")) {
      req.url = req.url.slice("/v1".length) || "/";
    }
    next();
  });
  app.use(createApiHostNoindexMiddleware());
  app.get("/posts", (_req, res) => res.json([]));
  app.get("/images/:file", (_req, res) => res.type("png").send("png"));
  app.get("/html", (_req, res) => res.type("html").send("<title>ok</title>"));
  app.use((_req, res) => res.status(404).json({ error: "not found" }));

  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, port: server.address().port }),
    );
  });
}

// `fetch` (undici) refuses to send a caller-supplied `Host` header — it always
// writes the connection's own host. Since the whole feature keys on the Host
// header, these requests have to go through `http.request`, which sends it.
function get(port, path, host, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "GET",
        headers: { host, ...extraHeaders },
      },
      (res) => {
        res.resume();
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

test("an api-host response carries X-Robots-Tag: noindex, nofollow", async () => {
  const { server, port } = await startServer();
  try {
    const posts = await get(port, "/v1/posts", "api.mirabellier.com");
    assert.equal(posts.status, 200);
    assert.equal(posts.headers["x-robots-tag"], "noindex, nofollow");

    const missing = await get(port, "/v1/nope", "api.mirabellier.com");
    assert.equal(missing.status, 404);
    assert.equal(missing.headers["x-robots-tag"], "noindex, nofollow");

    const html = await get(port, "/v1/html", "api.mirabellier.com");
    assert.equal(html.headers["x-robots-tag"], "noindex, nofollow");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("api-host media is left indexable for Google Images", async () => {
  const { server, port } = await startServer();
  try {
    for (const path of ["/v1/images/a.png", "/images/a.png"]) {
      const res = await get(port, path, "api.mirabellier.com");
      assert.equal(res.status, 200, path);
      assert.equal(res.headers["x-robots-tag"], undefined, path);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("main-site responses get no X-Robots-Tag at all", async () => {
  const { server, port } = await startServer();
  try {
    for (const path of ["/v1/posts", "/v1/html", "/v1/nope"]) {
      const res = await get(port, path, "mirabellier.com");
      assert.equal(res.headers["x-robots-tag"], undefined, path);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// `req.get("host")` is the raw header, never `req.hostname` (which prefers the
// client-settable X-Forwarded-Host when `trust proxy` is on).
test("a spoofed X-Forwarded-Host cannot make the API host indexable", async () => {
  const { server, port } = await startServer();
  try {
    const res = await get(port, "/v1/posts", "api.mirabellier.com", {
      "x-forwarded-host": "mirabellier.com",
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers["x-robots-tag"], "noindex, nofollow");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
