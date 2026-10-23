const { isOwner } = require("../lib/authz");
const {
  buildChangelogEntry,
  mapChangelogRow,
  normalizeListLimit,
} = require("../lib/site-changelog");

function setNoStoreHeaders(res) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

function makeId() {
  return `cl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = function registerSiteChangelogRoutes(app, deps) {
  const { db, authFromReq } = deps;

  const selectEntries = db.prepare(
    `SELECT id, entryDate, title, body, createdAt, updatedAt
     FROM site_changelog
     ORDER BY entryDate DESC, createdAt DESC, rowid DESC
     LIMIT ?`,
  );
  const selectEntryById = db.prepare(
    `SELECT id, entryDate, title, body, createdAt, updatedAt
     FROM site_changelog WHERE id = ?`,
  );
  const insertEntry = db.prepare(
    `INSERT INTO site_changelog
       (id, entryDate, title, body, createdByUserId, createdAt, updatedAt)
     VALUES (@id, @entryDate, @title, @body, @userId, @now, @now)`,
  );
  const updateEntry = db.prepare(
    `UPDATE site_changelog
     SET entryDate = @entryDate, title = @title, body = @body, updatedAt = @now
     WHERE id = @id`,
  );
  const deleteEntry = db.prepare("DELETE FROM site_changelog WHERE id = ?");

  function requireOwner(req, res) {
    const user = authFromReq(req);
    if (!user) {
      res.status(401).json({ error: "unauthorized" });
      return null;
    }
    if (!isOwner(user)) {
      res.status(403).json({ error: "Forbidden" });
      return null;
    }
    return user;
  }

  // Public: the changelog, newest first.
  app.get("/changelog", (req, res) => {
    try {
      const limit = normalizeListLimit(req.query?.limit);
      setNoStoreHeaders(res);
      res.json({ entries: selectEntries.all(limit).map(mapChangelogRow) });
    } catch (error) {
      setNoStoreHeaders(res);
      res.status(500).json({
        error: "Failed to load changelog",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Owner-only: add an entry.
  app.post("/changelog", (req, res) => {
    try {
      const user = requireOwner(req, res);
      if (!user) return;

      const { entry, error } = buildChangelogEntry(req.body);
      if (error) return res.status(400).json({ error });

      const now = new Date().toISOString();
      const id = makeId();
      insertEntry.run({ id, ...entry, userId: user.id, now });

      setNoStoreHeaders(res);
      res.status(201).json({ entry: mapChangelogRow(selectEntryById.get(id)) });
    } catch (error) {
      setNoStoreHeaders(res);
      res.status(500).json({
        error: "Failed to save changelog entry",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Owner-only: edit an entry.
  app.put("/changelog/:id", (req, res) => {
    try {
      const user = requireOwner(req, res);
      if (!user) return;

      const id = String(req.params.id || "").trim();
      if (!selectEntryById.get(id)) {
        return res.status(404).json({ error: "Not found" });
      }

      const { entry, error } = buildChangelogEntry(req.body);
      if (error) return res.status(400).json({ error });

      updateEntry.run({ id, ...entry, now: new Date().toISOString() });

      setNoStoreHeaders(res);
      res.json({ entry: mapChangelogRow(selectEntryById.get(id)) });
    } catch (error) {
      setNoStoreHeaders(res);
      res.status(500).json({
        error: "Failed to update changelog entry",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Owner-only: remove an entry.
  app.delete("/changelog/:id", (req, res) => {
    try {
      const user = requireOwner(req, res);
      if (!user) return;

      const id = String(req.params.id || "").trim();
      const result = deleteEntry.run(id);
      if (result.changes !== 1) {
        return res.status(404).json({ error: "Not found" });
      }

      setNoStoreHeaders(res);
      res.json({ ok: true, deletedId: id });
    } catch (error) {
      setNoStoreHeaders(res);
      res.status(500).json({
        error: "Failed to delete changelog entry",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
};
