const { searchIndex } = require("../lib/search-index");

function setNoStoreHeaders(res) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

// Public sitewide search over post bodies, shrine blurbs, QOTD prompts, and
// QOTD answers — the free-text half of the ⌘K command palette (static pages
// are indexed client-side; see src/parts/CommandPalette.tsx).
module.exports = function registerSearchRoutes(app, deps) {
  const { db } = deps;

  app.get("/search", (req, res) => {
    try {
      setNoStoreHeaders(res);
      res.json(searchIndex(db, req.query.q, req.query.limit));
    } catch (error) {
      setNoStoreHeaders(res);
      res.status(500).json({
        error: "Search failed",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
};
