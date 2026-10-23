const { getSiteStats } = require("../lib/site-stats");

function setCacheHeaders(res) {
  // Numbers only move as fast as people post/sign/fight — a minute of
  // staleness is invisible and saves recomputing on every page view.
  res.setHeader("Cache-Control", "public, max-age=60");
}

// Public sitewide stats for /stats — no auth, same as /now and /changelog.
module.exports = function registerSiteStatsRoutes(app, deps) {
  const { db } = deps;

  app.get("/stats", (req, res) => {
    try {
      setCacheHeaders(res);
      res.json(getSiteStats(db));
    } catch (error) {
      res.status(500).json({
        error: "Failed to load site stats",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
};
