const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// `location /` falls back to the SPA entry only for paths the
// `$mirabellier_spa_route` map flags; everything else is expected to answer a
// real 404 (see deploy/nginx/mirabellier.com.conf). A route that is added to
// the SPA but not to the map hard-404s on direct load, and an emptied map
// would restore the soft-404 problem the guard exists to fix. These tests pin
// the mapping's shape; the route list itself lives in the frontend repo.
const CONF_PATH = path.join(__dirname, "..", "deploy", "nginx", "mirabellier.com.conf");

function readConf() {
  return fs.readFileSync(CONF_PATH, "utf8");
}

function mapPatterns(conf) {
  const block = conf.match(
    /map \$uri \$mirabellier_spa_route \{([\s\S]*?)\n\}/,
  );
  assert.ok(block, "the $mirabellier_spa_route map must exist");
  return [...block[1].matchAll(/^\s*~(\*)?(\S+)\s+1;/gm)].map((match) => ({
    ignoreCase: match[1] === "*",
    source: match[2],
  }));
}

function matchesAny(patterns, value) {
  return patterns.some((pattern) =>
    new RegExp(pattern.source, pattern.ignoreCase ? "i" : "").test(value),
  );
}

// Locations that answer before `location /` ever runs. nginx resolves exact
// matches first, then `^~` prefixes (which suppress regex evaluation), then
// regex locations in config order. Anything these serve never consults the
// map, so a route handled here is not required to be in it.
function earlyLocations(conf) {
  return {
    exact: [...conf.matchAll(/^\s*location\s*=\s*(\S+)\s*\{/gm)].map(
      (match) => match[1],
    ),
    prefixes: [...conf.matchAll(/^\s*location\s*\^~\s*(\S+)\s*\{/gm)].map(
      (match) => match[1],
    ),
    regexes: [...conf.matchAll(/^\s*location\s*~(\*)?\s*(\S+)\s*\{/gm)].map(
      (match) => ({
        ignoreCase: match[1] === "*",
        source: match[2],
      }),
    ),
  };
}

function servedEarly(conf, value) {
  const { exact, prefixes, regexes } = earlyLocations(conf);
  if (exact.includes(value)) return true;

  const prefixMatch = prefixes.some((prefix) => value.startsWith(prefix));
  if (prefixMatch) return true;

  return regexes.some((regex) =>
    new RegExp(regex.source, regex.ignoreCase ? "i" : "").test(value),
  );
}

function reachesSpaFallback(conf, value) {
  if (servedEarly(conf, value)) return true;
  return matchesAny(mapPatterns(conf), value);
}

const EXPECTED_200 = [
  "/",
  "/home",
  "/about",
  "/now",
  "/changelog",
  "/uses",
  "/stats",
  "/links",
  "/projects",
  "/anime",
  "/fanart",
  "/twitch",
  "/guestbook",
  "/guestbook/sign",
  "/auth/callback",
  "/staging/tcg",
  "/pixies",
  "/pixies/abc123",
  "/poloroid",
  "/loops",
  "/reels",
  "/poloroid/upload",
  "/arena",
  "/arena/fight",
  "/arena/fight/abc",
  "/arena/inventory",
  "/arena/tcg/decks",
  "/ar/tcg/decks",
  "/admin",
  "/admin/users",
  "/profile",
  "/profile/someone",
  "/blog",
  "/privacy",
  "/terms",
  "/login",
  "/settings",
  "/question-of-the-day/archive",
  "/question-of-the-day/archive/2026-05-01",
];

const EXPECTED_404 = [
  "/definitely-not-real-xyz",
  "/nope-xyz-123/extra/deep",
  "/about/team",
  "/blog/some/post/extra",
  "/profile/someone/extra",
  "/pixies/a/b/c",
  "/administer",
  "/arenabot",
  "/home/extra",
];

test("the SPA route map is not empty", () => {
  const patterns = mapPatterns(readConf());
  assert.ok(patterns.length >= 8, `expected several route patterns, got ${patterns.length}`);
});

test("real SPA routes are served, by the map or an earlier location", () => {
  const conf = readConf();
  for (const route of EXPECTED_200) {
    assert.equal(
      reachesSpaFallback(conf, route),
      true,
      `${route} must be served (SPA fallback or an earlier nginx location)`,
    );
  }
});

test("unknown paths are not flagged by the map, so they 404", () => {
  const patterns = mapPatterns(readConf());
  for (const route of EXPECTED_404) {
    assert.equal(
      matchesAny(patterns, route),
      false,
      `${route} must not match the SPA route map`,
    );
  }
});

// React Router routes are caseSensitive: false by default, so `/About` is a
// working URL and must keep working.
test("route matching ignores case like React Router does", () => {
  const patterns = mapPatterns(readConf());
  for (const route of ["/About", "/Arena/Inventory", "/GUESTBOOK/Sign"]) {
    assert.equal(matchesAny(patterns, route), true, `${route} must match`);
  }
});

// Without `error_page 404 =404 /404.html` the guard would fall back to
// nginx's own error page (or, with a bare `=404 /404.html`, an internal
// redirect that 500s when the document is missing).
test("the 404 document is wired up and internal-only", () => {
  const conf = readConf();
  assert.match(conf, /error_page 404 =404 \/404\.html;/);
  assert.match(conf, /location = \/404\.html \{\s*internal;/);
});

test("the fallback guard runs before the SPA entry is served", () => {
  const conf = readConf();
  const fallback = conf.match(/location \/ \{([\s\S]*?)\n\s*\}/);
  assert.ok(fallback, "the root location must exist");
  assert.match(fallback[1], /try_files \$uri \$uri\/index\.html @spa_fallback;/);
  assert.match(
    conf,
    /location @spa_fallback \{[\s\S]*?return 404;[\s\S]*?rewrite \^ \/index\.html last;/,
  );
});
