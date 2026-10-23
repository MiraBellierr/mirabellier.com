const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// `spa-entry` caches the SPA `index.html` it read off disk. Frontend deploys
// flip the `current` symlink without touching (or reloading) this process, so
// the cache must be revalidated or the backend keeps serving a build whose
// hashed chunks have already been pruned from the release tree.
function loadFresh() {
  delete require.cache[require.resolve("../lib/spa-entry")];
  return require("../lib/spa-entry");
}

function buildHtml(entryFile) {
  return [
    "<!doctype html>",
    '<html lang="en"><head>',
    `<script type="module" crossorigin src="/${entryFile}"></script>`,
    "</head><body><div id=\"root\"></div></body></html>",
  ].join("\n");
}

function writeEntry(dir, entryFile, mtime) {
  const file = path.join(dir, "index.html");
  fs.writeFileSync(file, buildHtml(entryFile));
  if (mtime) {
    fs.utimesSync(file, mtime, mtime);
  }
  return file;
}

function makeRes() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[String(name).toLowerCase()];
    },
    send(body) {
      this.body = body;
    },
  };
}

function withTempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function symlinkOrSkip(t, target, linkPath, type) {
  try {
    fs.symlinkSync(target, linkPath, type);
    return true;
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES") {
      t.skip(`symlinks unavailable on this platform: ${error.code}`);
      return false;
    }
    throw error;
  }
}

function setEnv(t, name, value) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}

test("sendSpaEntry re-reads the entry after a frontend deploy replaces it", (t) => {
  const deployDir = withTempDir(t, "spa-entry-deploy-");
  setEnv(t, "FRONTEND_DEPLOY_PATH", deployDir);
  setEnv(t, "SPA_ENTRY_FILE", "");

  const { sendSpaEntry } = loadFresh();

  writeEntry(
    deployDir,
    "assets/index-old.js",
    new Date("2026-09-13T20:00:00Z"),
  );
  const first = makeRes();
  assert.equal(sendSpaEntry(first), true);
  assert.match(first.body, /index-old\.js/);

  writeEntry(
    deployDir,
    "assets/index-new.js",
    new Date("2026-09-14T00:00:00Z"),
  );
  const second = makeRes();
  assert.equal(sendSpaEntry(second), true);
  assert.match(second.body, /index-new\.js/);
  assert.doesNotMatch(second.body, /index-old\.js/);
});

test("sendSpaEntry re-resolves candidates when the cached entry disappears", (t) => {
  const entryDir = withTempDir(t, "spa-entry-file-");
  const deployDir = withTempDir(t, "spa-entry-fallback-");
  const entryFile = path.join(entryDir, "index.html");
  fs.writeFileSync(entryFile, buildHtml("assets/index-explicit.js"));

  setEnv(t, "SPA_ENTRY_FILE", entryFile);
  setEnv(t, "FRONTEND_DEPLOY_PATH", deployDir);
  writeEntry(deployDir, "assets/index-fallback.js");

  const { sendSpaEntry } = loadFresh();

  const first = makeRes();
  assert.equal(sendSpaEntry(first), true);
  assert.match(first.body, /index-explicit\.js/);

  fs.rmSync(entryFile);

  const second = makeRes();
  assert.equal(sendSpaEntry(second), true);
  assert.match(second.body, /index-fallback\.js/);
});

// This mirrors the production layout: /var/www/.../current is a symlink that
// `mv -T` renames over on deploy. The old and new releases are prepared with
// identical index.html mtimes so only the resolved release path can tell them
// apart — exactly the case an mtime/size equality check would miss.
test("sendSpaEntry notices a release symlink flip", (t) => {
  const base = withTempDir(t, "spa-entry-releases-");
  const currentLink = path.join(base, "current");
  const releaseA = path.join(base, "releases", "aaa");
  const releaseB = path.join(base, "releases", "bbb");
  const sharedMtime = new Date("2026-09-14T00:36:03Z");

  for (const [dir, entry] of [
    [releaseA, "assets/index-old.js"],
    [releaseB, "assets/index-new.js"],
  ]) {
    fs.mkdirSync(dir, { recursive: true });
    writeEntry(dir, entry, sharedMtime);
  }

  if (
    !symlinkOrSkip(
      t,
      releaseA,
      currentLink,
      process.platform === "win32" ? "junction" : "dir",
    )
  ) {
    return;
  }

  setEnv(t, "SPA_ENTRY_FILE", "");
  setEnv(t, "FRONTEND_DEPLOY_PATH", currentLink);

  const { sendSpaEntry } = loadFresh();

  const first = makeRes();
  assert.equal(sendSpaEntry(first), true);
  assert.match(first.body, /index-old\.js/);

  const tmpLink = path.join(base, "current.tmp");
  if (
    !symlinkOrSkip(
      t,
      releaseB,
      tmpLink,
      process.platform === "win32" ? "junction" : "dir",
    )
  ) {
    return;
  }

  try {
    fs.renameSync(tmpLink, currentLink);
  } catch (error) {
    // Windows refuses rename(2) onto an existing junction/directory; prod is
    // Linux where the deploy's `mv -T` is atomic. The realpath change is what
    // the cache check keys on, so an unlink + relink exercises the same path.
    if (error.code !== "EPERM" && error.code !== "EACCES") {
      throw error;
    }
    fs.rmSync(tmpLink, { recursive: true, force: true });
    fs.rmSync(currentLink, { recursive: true, force: true });
    if (
      !symlinkOrSkip(
        t,
        releaseB,
        currentLink,
        process.platform === "win32" ? "junction" : "dir",
      )
    ) {
      return;
    }
  }

  const second = makeRes();
  assert.equal(sendSpaEntry(second), true);
  assert.match(second.body, /index-new\.js/);
  assert.doesNotMatch(second.body, /index-old\.js/);
});
