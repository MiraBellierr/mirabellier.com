const path = require("path");
const fs = require("fs");
const fsp = fs.promises;

function isSafeFilename(filename) {
  return Boolean(
    filename &&
    !filename.includes("..") &&
    !filename.includes("/") &&
    !filename.includes("\\"),
  );
}

// Enumerate the images directory without blocking the event loop. `readdir`
// with `withFileTypes` gives `isFile()` for free (no stat), then one async
// `stat` per file supplies size / mtime — down from two synchronous stats per
// entry. A file removed between the readdir and its stat is just skipped.
async function readImageList(imagesDir) {
  let entries;
  try {
    entries = await fsp.readdir(imagesDir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }

  const files = entries.filter((entry) => entry.isFile());
  const settled = await Promise.all(
    files.map(async (entry) => {
      try {
        const stat = await fsp.stat(path.join(imagesDir, entry.name));
        return {
          filename: entry.name,
          url: `/images/${entry.name}`,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        };
      } catch {
        return null;
      }
    }),
  );

  return settled.filter(Boolean);
}

module.exports = function registerImageRoutes(app, deps) {
  const { IMAGES_DIR, authFromReq, isOwner } = deps;

  // Full-directory enumeration (every user's avatar/banner, every blog image,
  // anything meant to be unlisted). Owner-only.
  app.get("/images/list", async (req, res) => {
    try {
      const requester = typeof authFromReq === "function" ? authFromReq(req) : null;
      if (!requester || (typeof isOwner === "function" && !isOwner(requester))) {
        return res.status(403).json({ error: "forbidden" });
      }

      const list = (await readImageList(IMAGES_DIR)).sort(
        (a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt),
      );

      res.setHeader("Cache-Control", "private, no-store");
      res.json(list);
    } catch {
      res.status(500).json({ error: "Failed to read images" });
    }
  });

  app.get("/images/meta/:filename", (req, res) => {
    try {
      const filename = req.params.filename;
      if (!isSafeFilename(filename)) {
        return res.status(400).json({ error: "invalid filename" });
      }

      const fullPath = path.join(IMAGES_DIR, filename);
      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: "not found" });
      }

      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) return res.status(404).json({ error: "not found" });

      // Cache metadata for 1 hour
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.json({
        filename,
        url: `/images/${filename}`,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    } catch {
      res.status(500).json({ error: "failed" });
    }
  });
};
