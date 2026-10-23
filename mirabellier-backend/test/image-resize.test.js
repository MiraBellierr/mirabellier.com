const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const sharp = require("sharp");

const { createImageResizeMiddleware } = require("../lib/image-resize");

async function makeServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "img-resize-"));
  await sharp({
    create: {
      width: 900,
      height: 600,
      channels: 3,
      background: { r: 200, g: 120, b: 60 },
    },
  })
    .png()
    .toFile(path.join(dir, "photo.png"));
  fs.writeFileSync(path.join(dir, "notes.txt"), "not an image");

  const app = express();
  app.use("/images", createImageResizeMiddleware(dir));
  app.use(
    "/images",
    express.static(dir, {
      setHeaders: (res) => res.setHeader("X-Static", "1"),
    }),
  );
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  return { dir, server, port: server.address().port };
}

function withServer(run) {
  return async () => {
    const ctx = await makeServer();
    try {
      await run(ctx);
    } finally {
      await new Promise((r) => ctx.server.close(r));
      fs.rmSync(ctx.dir, { recursive: true, force: true });
    }
  };
}

test(
  "?w= returns a WebP resized to that width",
  withServer(async ({ port }) => {
    const res = await fetch(`http://127.0.0.1:${port}/images/photo.png?w=128`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/webp");
    assert.equal(res.headers.get("x-static"), null); // did not fall through
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.width, 128);
  }),
);

test(
  "second request for the same variant is served from cache",
  withServer(async ({ port, dir }) => {
    await fetch(`http://127.0.0.1:${port}/images/photo.png?w=64`);
    const cacheFiles = fs.readdirSync(path.join(fs.realpathSync(dir), ".rcache"));
    assert.equal(cacheFiles.length, 1);
    const res = await fetch(`http://127.0.0.1:${port}/images/photo.png?w=64`);
    assert.equal(res.status, 200);
    assert.equal((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width, 64);
  }),
);

test(
  "no ?w= falls through to the static file untouched",
  withServer(async ({ port }) => {
    const res = await fetch(`http://127.0.0.1:${port}/images/photo.png`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-static"), "1");
    assert.equal(res.headers.get("content-type"), "image/png");
  }),
);

test(
  "a non-allow-listed width falls through",
  withServer(async ({ port }) => {
    const res = await fetch(`http://127.0.0.1:${port}/images/photo.png?w=137`);
    assert.equal(res.headers.get("x-static"), "1");
  }),
);

test(
  "non-image extensions and missing files fall through",
  withServer(async ({ port }) => {
    assert.equal(
      (await fetch(`http://127.0.0.1:${port}/images/notes.txt?w=64`)).headers.get(
        "x-static",
      ),
      "1",
    );
    assert.equal(
      (await fetch(`http://127.0.0.1:${port}/images/missing.png?w=64`)).status,
      404,
    );
  }),
);

test(
  "path traversal is refused",
  withServer(async ({ port }) => {
    const res = await fetch(
      `http://127.0.0.1:${port}/images/..%2f..%2fetc%2fpasswd?w=64`,
    );
    assert.ok(res.status === 404 || res.status === 403);
    assert.notEqual(res.headers.get("content-type"), "image/webp");
  }),
);
