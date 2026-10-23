// Records when an external data sync last produced fresh content, so pages
// whose data lives outside SQLite (the Honkai: Star Rail JSON in data/hsr/) can
// still report a real `lastmod` in the sitemap. One row per sync key.

const UPSERT_SYNC_STATE = `
  INSERT INTO external_sync_state (syncKey, syncedAt, updatedAt)
  VALUES (@syncKey, @syncedAt, @updatedAt)
  ON CONFLICT(syncKey) DO UPDATE SET
    syncedAt = excluded.syncedAt,
    updatedAt = excluded.updatedAt`;

function recordExternalSync(db, syncKey, syncedAt = new Date().toISOString()) {
  if (!db || !syncKey) return false;

  const timestamp =
    syncedAt instanceof Date ? syncedAt.toISOString() : String(syncedAt);

  try {
    db.prepare(UPSERT_SYNC_STATE).run({
      syncKey,
      syncedAt: timestamp,
      updatedAt: timestamp,
    });
    return true;
  } catch {
    // Older databases without the table (or a closed handle) must never break
    // a sync run over bookkeeping.
    return false;
  }
}

function getExternalSyncTime(db, syncKey) {
  if (!db || !syncKey) return null;

  try {
    const row = db
      .prepare("SELECT syncedAt FROM external_sync_state WHERE syncKey = ?")
      .get(syncKey);
    return row?.syncedAt || null;
  } catch {
    return null;
  }
}

module.exports = {
  getExternalSyncTime,
  recordExternalSync,
};
