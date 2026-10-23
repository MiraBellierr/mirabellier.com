#!/usr/bin/env node

// Converts stored pixies (user_videos) that use codecs iPhones/iPads cannot
// play over HTTP (HEVC, AV1, VP9, Opus…) into H.264/AAC MP4s with faststart,
// then repoints the database row at the converted file.
//
// Runs in dry-run mode by default. Add --apply to write changes.
//   node scripts/repair-nonplayable-videos.cjs [--apply] [--dry-run] [--backup <path>]

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const BACKEND_ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(BACKEND_ROOT, ".env") });

const { probeVideoFile, transcodeToH264 } = require("../lib/social");

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function resolveDir(envVar, defaultName) {
  const envVal = process.env[envVar];
  if (envVal) {
    const resolved = path.isAbsolute(envVal)
      ? envVal
      : path.resolve(BACKEND_ROOT, envVal);
    return resolved;
  }
  return path.join(BACKEND_ROOT, defaultName);
}

function resolveDbFile() {
  const envVal = process.env.DB_FILE;
  if (!envVal) return path.join(BACKEND_ROOT, "database.sqlite3");
  return path.isAbsolute(envVal)
    ? envVal
    : path.resolve(BACKEND_ROOT, envVal);
}

function parseArgs(argv) {
  const options = {
    apply: false,
    dbFile: resolveDbFile(),
    videosDir: resolveDir("VIDEOS_DIR", "videos"),
    backupFile: "",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.apply = false;
      continue;
    }
    if (arg === "--backup") {
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) {
        throw new Error("--backup requires a file path.");
      }
      options.backupFile = val;
      i += 1;
      continue;
    }
    if (arg.startsWith("--backup=")) {
      options.backupFile = arg.slice("--backup=".length);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: node scripts/repair-nonplayable-videos.cjs [flags]",
          "",
          "Re-encodes stored pixies whose codecs iPhones/iPads cannot play",
          "(HEVC, AV1, VP9, Opus, …) into H.264/AAC MP4 (faststart) and",
          "repoints the user_videos row at the converted file.",
          "",
          "Flags:",
          "  --apply         Apply changes (default: dry-run only)",
          "  --dry-run       Report only, no writes",
          "  --backup <path> Backup DB file before applying",
          "  --help, -h      Show this help",
        ].join("\n"),
      );
      process.exit(0);
    }
  }

  return options;
}

async function repairNonplayableVideos(db, { videosDir, apply = false }) {
  const rows = db
    .prepare(
      "SELECT id, filename, mimeType, sizeBytes FROM user_videos ORDER BY createdAt DESC",
    )
    .all();

  const converted = [];
  const warnings = [];
  let compatibleCount = 0;

  const updateRow = db.prepare(
    "UPDATE user_videos SET filename = ?, mimeType = ?, sizeBytes = ? WHERE id = ?",
  );

  const rowsByFilename = new Map();
  for (const row of rows) {
    if (!rowsByFilename.has(row.filename)) rowsByFilename.set(row.filename, []);
    rowsByFilename.get(row.filename).push(row);
  }

  const fileList = Array.from(rowsByFilename.entries());
  const formatMb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  let index = 0;

  for (const [filename, rowGroup] of fileList) {
    index += 1;
    const sourcePath = path.join(videosDir, filename);
    if (!fs.existsSync(sourcePath)) {
      warnings.push(`${filename}: file missing, skipped (${rowGroup.length} row(s))`);
      continue;
    }

    let probe;
    try {
      probe = await probeVideoFile(sourcePath);
    } catch (err) {
      warnings.push(
        `${filename}: could not probe video — ${err.message}`,
      );
      continue;
    }

    if (probe.hasVideo && probe.videoCodec === "h264") {
      compatibleCount += 1;
      continue;
    }

    const startedAt = Date.now();
    const description = `${filename}: ${probe.videoCodec || "unknown"} video → h264`;
    let result;
    try {
      console.log(
        `[${index}/${fileList.length}] Converting ${filename} ` +
          `(${probe.videoCodec || "unknown"}, ${formatMb(fs.statSync(sourcePath).size)})…`,
      );
      result = await transcodeToH264(sourcePath);
    } catch (err) {
      warnings.push(`${description} — conversion failed: ${err.message}`);
      continue;
    }

    if (!result.converted) {
      compatibleCount += 1;
      continue;
    }

    const newFilename = path.basename(result.filePath);
    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `  → ${newFilename} (${formatMb(result.sizeBytes)}) in ${elapsedSeconds}s`,
    );
    converted.push({
      filename,
      newFilename,
      oldCodec: probe.videoCodec || "unknown",
      oldSizeBytes: rowGroup[0].sizeBytes,
      newSizeBytes: result.sizeBytes,
      rowCount: rowGroup.length,
    });

    if (apply) {
      for (const row of rowGroup) {
        updateRow.run(newFilename, result.mimeType, result.sizeBytes, row.id);
      }
      if (result.filePath !== sourcePath) {
        try {
          fs.unlinkSync(sourcePath);
        } catch {
          // Ignore stale removal failures.
        }
      }
    } else {
      // Dry run still transcodes to verify it works and report sizes, then
      // cleans the throwaway file so nothing lingers on disk.
      if (result.filePath !== sourcePath) {
        try {
          fs.unlinkSync(result.filePath);
        } catch {
          // Ignore cleanup failures.
        }
      }
    }
  }

  return {
    totalRows: rows.length,
    uniqueFiles: rowsByFilename.size,
    compatibleCount,
    converted,
    warnings,
    apply,
  };
}

async function main() {
  const args = process.argv.slice(2);
  let options;
  try {
    options = parseArgs(args);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }

  if (options.apply && !options.backupFile) {
    options.backupFile =
      path.dirname(options.dbFile) +
      "/database-backup-" +
      timestampForFile() +
      ".sqlite3";
  }

  if (options.apply) {
    fs.copyFileSync(options.dbFile, options.backupFile);
    console.log("Backed up database to:", options.backupFile);
  }

  const db = new Database(options.dbFile);
  // Wait up to 30s for locks instead of erroring instantly when the live
  // backend holds a write transaction (common on shared production hosts).
  db.pragma("busy_timeout = 30000");
  db.pragma("journal_mode = WAL");

  const startedAt = Date.now();
  let result;
  try {
    result = await repairNonplayableVideos(db, {
      videosDir: options.videosDir,
      apply: options.apply,
    });
  } finally {
    db.close();
  }
  const totalSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(
    `\nScanned ${result.totalRows} stored pixies across ${result.uniqueFiles} unique files: ` +
      `${result.compatibleCount} already playable, ${result.converted.length} converted (${totalSeconds}s).`,
  );

  if (result.converted.length > 0) {
    console.log(
      result.converted.length === 1
        ? "1 video converted."
        : `${result.converted.length} videos converted.`,
    );
  }

  if (result.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const w of result.warnings) {
      console.log("  " + w);
    }
  }

  if (!options.apply) {
    console.log(
      "\nDry run — no database changes applied. Run with --apply to convert and update the database.",
    );
  } else {
    console.log(
      `\nApplied: ${result.converted.length} files converted; database rows repointed.`,
    );
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Error:", err.message || err);
    process.exit(1);
  });
}

module.exports = { repairNonplayableVideos };
