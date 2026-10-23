// Durable, sequential queue for admin "download & import" jobs.
//
// Rows live in the `pixie_import_queue` table so the admin can close or
// refresh the page (or the backend can restart) without losing in-flight
// imports. One import runs at a time; `runImport` does the actual work and
// reports progress, which is persisted to the row so any reconnecting client
// sees live state.

const crypto = require("crypto");

const nowIso = () => new Date().toISOString();
const MAX_LIST = 100;

function safeParseArray(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @param {object}   deps
 * @param {import("better-sqlite3").Database} deps.db
 * @param {(params: object, onProgress: (p: {stage:string,message:string,progress:number}) => void) => Promise<{videoId: string}>} deps.runImport
 * @param {Console}  [deps.logger]
 */
function createPixieImportQueue({ db, runImport, logger = console }) {
  const stmt = {
    insert: db.prepare(
      `INSERT INTO pixie_import_queue
         (id, url, platform, title, tags, username, avatarUrl, verified,
          importKey, status, stage, message, progress, enqueuedBy,
          createdAt, updatedAt)
       VALUES
         (@id, @url, @platform, @title, @tags, @username, @avatarUrl, @verified,
          @importKey, 'queued', 'queued', 'Waiting in the queue…', 0, @enqueuedBy,
          @now, @now)`,
    ),
    byId: db.prepare(`SELECT * FROM pixie_import_queue WHERE id = ?`),
    activeByKey: db.prepare(
      `SELECT * FROM pixie_import_queue
       WHERE importKey = ? AND status IN ('queued','running')`,
    ),
    anyByKey: db.prepare(
      `SELECT * FROM pixie_import_queue
       WHERE importKey = ?
       ORDER BY createdAt DESC LIMIT 1`,
    ),
    nextQueued: db.prepare(
      `SELECT * FROM pixie_import_queue
       WHERE status = 'queued' ORDER BY createdAt ASC LIMIT 1`,
    ),
    recent: db.prepare(
      `SELECT * FROM pixie_import_queue
       ORDER BY
         CASE status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
         CASE WHEN status IN ('running','queued') THEN createdAt END ASC,
         updatedAt DESC
       LIMIT ?`,
    ),
    markRunning: db.prepare(
      `UPDATE pixie_import_queue
         SET status='running', stage='resolve', message='Starting…',
             progress=0, error=NULL, startedAt=@now, updatedAt=@now
       WHERE id=@id`,
    ),
    progress: db.prepare(
      `UPDATE pixie_import_queue
         SET stage=@stage, message=@message, progress=@progress, updatedAt=@now
       WHERE id=@id AND status='running'`,
    ),
    markDone: db.prepare(
      `UPDATE pixie_import_queue
         SET status='done', stage='done', message='Video imported!',
             progress=100, videoId=@videoId, error=NULL,
             finishedAt=@now, updatedAt=@now
       WHERE id=@id`,
    ),
    markError: db.prepare(
      `UPDATE pixie_import_queue
         SET status='error', stage='error', message=@message, error=@message,
             finishedAt=@now, updatedAt=@now
       WHERE id=@id`,
    ),
    markCanceled: db.prepare(
      `UPDATE pixie_import_queue
         SET status='canceled', stage='canceled', message='Canceled',
             finishedAt=@now, updatedAt=@now
       WHERE id=@id AND status='queued'`,
    ),
    requeue: db.prepare(
      `UPDATE pixie_import_queue
         SET status='queued', stage='queued', message='Waiting in the queue…',
             progress=0, error=NULL, startedAt=NULL, finishedAt=NULL,
             updatedAt=@now
       WHERE id=@id AND status IN ('error','canceled')`,
    ),
    resetRunning: db.prepare(
      `UPDATE pixie_import_queue
         SET status='queued', stage='queued',
             message='Requeued after a server restart', progress=0,
             startedAt=NULL, updatedAt=@now
       WHERE status='running'`,
    ),
    deleteFinished: db.prepare(
      `DELETE FROM pixie_import_queue
       WHERE status IN ('done','error','canceled')`,
    ),
  };

  let processing = false;

  function serialize(row) {
    if (!row) return null;
    return {
      id: row.id,
      url: row.url,
      platform: row.platform || null,
      title: row.title || "",
      username: row.username || "",
      avatarUrl: row.avatarUrl || "",
      status: row.status,
      stage: row.stage || row.status,
      message: row.message || "",
      progress: Math.max(0, Math.min(100, Number(row.progress) || 0)),
      error: row.error || null,
      videoId: row.videoId || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  const get = (id) => serialize(stmt.byId.get(String(id)));
  const list = (limit = 50) =>
    stmt.recent.all(Math.max(1, Math.min(MAX_LIST, limit))).map(serialize);

  function enqueue(params) {
    // Same importKey already waiting / running → hand back that row instead of
    // queuing a duplicate (covers a double-clicked "add" or a retry POST).
    if (params.importKey) {
      const active = stmt.activeByKey.get(params.importKey);
      if (active) return serialize(active);
    }
    // Skip when this key already succeeded before. The unique index on
    // user_videos.importKey already prevents a second row, but without this
    // check a stable key (the TikTok feed poller reuses the video id) would
    // pointlessly re-download the file every tick and then throw the download
    // away on insert. A finished-but-failed row stays retryable, so only
    // `done` short-circuits here (retry() requeues those rows directly).
    if (params.importKey) {
      const previous = stmt.anyByKey.get(params.importKey);
      if (previous && previous.status === "done") {
        return serialize(previous);
      }
    }
    const id = `imq_${Date.now().toString(36)}_${crypto
      .randomBytes(4)
      .toString("hex")}`;
    stmt.insert.run({
      id,
      url: String(params.url || ""),
      platform: params.platform || null,
      title: String(params.title || ""),
      tags: JSON.stringify(Array.isArray(params.tags) ? params.tags : []),
      username: String(params.username || ""),
      avatarUrl: String(params.avatarUrl || ""),
      verified: params.verified ? 1 : 0,
      importKey: params.importKey || null,
      enqueuedBy: params.enqueuedBy || null,
      now: nowIso(),
    });
    kick();
    return get(id);
  }

  function cancel(id) {
    stmt.markCanceled.run({ id: String(id), now: nowIso() });
    return get(id);
  }

  function retry(id) {
    stmt.requeue.run({ id: String(id), now: nowIso() });
    kick();
    return get(id);
  }

  function clearFinished() {
    return stmt.deleteFinished.run().changes || 0;
  }

  // Reclaim jobs that were mid-flight when the process died. The row's
  // `importKey` makes the resulting user_videos insert idempotent, so a job
  // that had already downloaded + inserted before the crash just resolves to
  // the existing video on the re-run.
  function recover() {
    const { changes } = stmt.resetRunning.run({ now: nowIso() });
    if (changes && logger && logger.log) {
      logger.log(
        `[pixie-import-queue] requeued ${changes} interrupted import(s)`,
      );
    }
    kick();
  }

  function kick() {
    Promise.resolve()
      .then(pump)
      .catch((err) => {
        processing = false;
        if (logger && logger.error) {
          logger.error("[pixie-import-queue] pump crashed:", err);
        }
      });
  }

  async function pump() {
    if (processing) return;
    const row = stmt.nextQueued.get();
    if (!row) return;
    processing = true;
    stmt.markRunning.run({ id: row.id, now: nowIso() });

    try {
      const result = await runImport(
        {
          url: row.url,
          title: row.title || "",
          tags: safeParseArray(row.tags),
          username: row.username || "",
          avatarUrl: row.avatarUrl || "",
          verified: row.verified === 1,
          importKey: row.importKey || null,
          enqueuedBy: row.enqueuedBy || null,
        },
        ({ stage, message, progress }) => {
          try {
            stmt.progress.run({
              id: row.id,
              stage: stage || "running",
              message: message || "",
              progress: Math.max(0, Math.min(100, Number(progress) || 0)),
              now: nowIso(),
            });
          } catch {
            // A clear/delete raced this progress tick — safe to ignore.
          }
        },
      );
      stmt.markDone.run({
        id: row.id,
        videoId: (result && result.videoId) || null,
        now: nowIso(),
      });
    } catch (err) {
      stmt.markError.run({
        id: row.id,
        message: (err && err.message) || "Import failed",
        now: nowIso(),
      });
    } finally {
      processing = false;
      kick(); // drain the rest of the queue
    }
  }

  return { list, get, enqueue, cancel, retry, clearFinished, recover };
}

module.exports = { createPixieImportQueue };
