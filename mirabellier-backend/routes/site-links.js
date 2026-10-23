const { isOwner } = require("../lib/authz");
const {
  LINKS_ROW_ID,
  buildLinksPayload,
  mapLinksRow,
} = require("../lib/site-links");

function setNoStoreHeaders(res) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

module.exports = function registerSiteLinksRoutes(app, deps) {
  const { db, authFromReq } = deps;

  const selectLinks = db.prepare("SELECT * FROM site_links WHERE id = ?");
  const upsertLinks = db.prepare(
    `INSERT INTO site_links (id, payloadJson, createdAt, updatedAt)
     VALUES (@id, @payloadJson, @now, @now)
     ON CONFLICT(id) DO UPDATE SET
       payloadJson = excluded.payloadJson,
       updatedAt = excluded.updatedAt`,
  );

  // Public: the current /links content (null until the owner writes it once,
  // in which case the frontend falls back to its built-in default list).
  app.get("/links", (_req, res) => {
    try {
      setNoStoreHeaders(res);
      res.json({ links: mapLinksRow(selectLinks.get(LINKS_ROW_ID)) });
    } catch (error) {
      setNoStoreHeaders(res);
      res.status(500).json({
        error: "Failed to load links page",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Owner-only: replace the whole /links payload (sections + webring).
  app.put("/links", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthorized" });
      if (!isOwner(user)) return res.status(403).json({ error: "Forbidden" });

      const { payload, error } = buildLinksPayload(req.body);
      if (error) {
        return res.status(400).json({ error });
      }

      const now = new Date().toISOString();
      upsertLinks.run({
        id: LINKS_ROW_ID,
        payloadJson: JSON.stringify(payload),
        now,
      });

      setNoStoreHeaders(res);
      res.json({ links: mapLinksRow(selectLinks.get(LINKS_ROW_ID)) });
    } catch (error) {
      setNoStoreHeaders(res);
      res.status(500).json({
        error: "Failed to save links page",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
};
