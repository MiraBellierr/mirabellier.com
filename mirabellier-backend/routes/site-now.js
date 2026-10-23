const { isOwner } = require("../lib/authz");
const { NOW_ROW_ID, buildNowPayload, mapNowRow } = require("../lib/site-now");

function setNoStoreHeaders(res) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

module.exports = function registerSiteNowRoutes(app, deps) {
  const { db, authFromReq } = deps;

  const selectNow = db.prepare("SELECT * FROM site_now WHERE id = ?");
  const upsertNow = db.prepare(
    `INSERT INTO site_now (id, payloadJson, createdAt, updatedAt)
     VALUES (@id, @payloadJson, @now, @now)
     ON CONFLICT(id) DO UPDATE SET
       payloadJson = excluded.payloadJson,
       updatedAt = excluded.updatedAt`,
  );

  // Public: the current /now content (null until the owner writes it once).
  app.get("/now", (_req, res) => {
    try {
      setNoStoreHeaders(res);
      res.json({ now: mapNowRow(selectNow.get(NOW_ROW_ID)) });
    } catch (error) {
      setNoStoreHeaders(res);
      res.status(500).json({
        error: "Failed to load now page",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Owner-only: replace the whole /now payload.
  app.put("/now", (req, res) => {
    try {
      const user = authFromReq(req);
      if (!user) return res.status(401).json({ error: "unauthorized" });
      if (!isOwner(user)) return res.status(403).json({ error: "Forbidden" });

      const { payload, error } = buildNowPayload(req.body);
      if (error) {
        return res.status(400).json({ error });
      }

      const now = new Date().toISOString();
      upsertNow.run({
        id: NOW_ROW_ID,
        payloadJson: JSON.stringify(payload),
        now,
      });

      setNoStoreHeaders(res);
      res.json({ now: mapNowRow(selectNow.get(NOW_ROW_ID)) });
    } catch (error) {
      setNoStoreHeaders(res);
      res.status(500).json({
        error: "Failed to save now page",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
};
