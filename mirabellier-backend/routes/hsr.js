const fs = require("fs");
const path = require("path");

// Serves the JSON produced by lib/hsr-sync.js:
//   characters.json  - the roster (names, elements, roles, icons)
//   team-index.json  - every distinct team per endgame mode, ranked
//   .meta.json       - sync bookkeeping
//
// The files are rewritten wholesale by the scheduler, so a stat-based
// in-memory cache is enough: unchanged file => parsed object reused, mtime bump
// => re-read once.
function createFileCache() {
  const cache = new Map();

  return function readCached(filePath) {
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return { missing: true };
    }

    const cached = cache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return { value: cached.value };
    }

    try {
      const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
      cache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, value });
      return { value };
    } catch {
      return { missing: true };
    }
  };
}

function resolveDataDir(deps) {
  if (deps?.hsrDataDir) return deps.hsrDataDir;
  const envVal = process.env.HSR_DATA_DIR;
  if (envVal) {
    return path.isAbsolute(envVal)
      ? envVal
      : path.join(__dirname, "..", envVal);
  }
  return path.join(__dirname, "..", "data", "hsr");
}

module.exports = function registerHsrRoutes(app, deps) {
  const dataDir = resolveDataDir(deps);
  const readCached = createFileCache();

  const readDataFile = (name) => readCached(path.join(dataDir, name));

  const sendFile = (res, name, missingError) => {
    const { value, missing } = readDataFile(name);
    if (missing) {
      return res.status(503).json({ error: missingError });
    }
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.json(value);
  };

  // The roster: what the planner offers as "characters you own".
  app.get("/hsr/characters", (req, res) => {
    sendFile(res, "characters.json", "hsr-data-not-ready");
  });

  // Every team prydwen tracks, per endgame mode, ranked. One read for the
  // whole planner.
  app.get("/hsr/teams", (req, res) => {
    sendFile(res, "team-index.json", "hsr-teams-not-ready");
  });

  // Alias kept for the team index under a more explicit name.
  app.get("/hsr/team-index", (req, res) => {
    sendFile(res, "team-index.json", "hsr-teams-not-ready");
  });

  app.get("/hsr/status", (req, res) => {
    const { value, missing } = readDataFile(".meta.json");
    if (missing) {
      return res.status(503).json({ error: "hsr-data-not-ready" });
    }
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({
      schema: value.schema,
      sourceLastUpdated: value.sourceLastUpdated,
      lastSyncAt: value.lastSyncAt,
      lastFullSyncAt: value.lastFullSyncAt,
      characters: Object.keys(value.characters || {}).length,
    });
  });
};
