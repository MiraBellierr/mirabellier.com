const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { resolveDiscoveryOutputDir } = require("../lib/discovery-output");

function setEnv(t, name, value) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}

function withTempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("explicit publicDir wins over every environment setting", (t) => {
  setEnv(t, "FRONTEND_DEPLOY_PATH", "/nope/deploy");
  setEnv(t, "WEBSITE_DIST_DIR", "/nope/dist");

  assert.equal(
    resolveDiscoveryOutputDir("/explicit/override"),
    "/explicit/override",
  );
});

test("FRONTEND_DEPLOY_PATH is honored (production release symlink)", (t) => {
  const deployDir = withTempDir(t, "discovery-deploy-");
  setEnv(t, "FRONTEND_DEPLOY_PATH", deployDir);
  setEnv(t, "WEBSITE_DIST_DIR", undefined);

  assert.equal(resolveDiscoveryOutputDir(), deployDir);
});

test("WEBSITE_DIST_DIR is used when FRONTEND_DEPLOY_PATH is unset", (t) => {
  const distDir = withTempDir(t, "discovery-dist-");
  setEnv(t, "FRONTEND_DEPLOY_PATH", "");
  setEnv(t, "WEBSITE_DIST_DIR", distDir);

  assert.equal(resolveDiscoveryOutputDir(), distDir);
});

test("falls back to the frontend public/ directory in development", (t) => {
  setEnv(t, "FRONTEND_DEPLOY_PATH", "");
  setEnv(t, "WEBSITE_DIST_DIR", "");

  // The fallback points at the frontend repo's `public/` when the backend is
  // checked out inside it. It is returned even when absent — callers mkdir it —
  // so only the path shape is asserted (CI runs from the standalone repo).
  assert.equal(
    resolveDiscoveryOutputDir(),
    path.join(__dirname, "..", "..", "public"),
  );
});

test("generateSitemap and generateFeeds write into an explicit directory", (t) => {
  const outputDir = withTempDir(t, "discovery-write-");
  const { generateSitemap } = require("../lib/sitemap");
  const { generateFeeds } = require("../lib/feed");

  const db = {
    prepare() {
      return { all: () => [] };
    },
  };

  assert.equal(generateSitemap(db, outputDir), true);
  assert.equal(generateFeeds(db, outputDir), true);

  for (const file of [
    "sitemap.xml",
    "feed.xml",
    "feed.json",
    path.join("feed", "questions.xml"),
    path.join("feed", "questions.json"),
  ]) {
    assert.ok(
      fs.existsSync(path.join(outputDir, file)),
      `${file} should be written`,
    );
  }
});

test("ensureIndexNowKeyFile writes the key into an explicit directory", (t) => {
  const outputDir = withTempDir(t, "discovery-indexnow-");
  const key = "test-indexnow-key";
  setEnv(t, "INDEXNOW_KEY", key);
  setEnv(t, "INDEXNOW_ENABLED", undefined);

  const { ensureIndexNowKeyFile } = require("../lib/indexnow");
  const result = ensureIndexNowKeyFile(outputDir);

  assert.equal(result.ok, true);
  assert.equal(fs.readFileSync(result.filePath, "utf-8"), key);
});
