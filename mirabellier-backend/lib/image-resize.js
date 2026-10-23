// On-the-fly resize for GET /images/<file>?w=<n>.
//
// A request WITHOUT `?w=` falls straight through to the static handler
// (original bytes). WITH an allow-listed `?w=`, this serves a cached WebP
// resized to that width — used by the SPA for avatar / thumbnail `srcset`.
// Anything unexpected (bad width, missing file, decode error) also falls
// through, so the endpoint can never be worse than the plain static file.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

const ALLOWED_WIDTHS = new Set([
  16, 24, 32, 48, 64, 96, 128, 160, 192, 256, 320, 384, 480, 640, 800, 1024,
  1200,
]);
const RESIZABLE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const QUALITY = 80;

function createImageResizeMiddleware(imagesDir) {
  const rootReal = fs.realpathSync(imagesDir);
  const cacheDir = path.join(rootReal, ".rcache");
  fs.mkdirSync(cacheDir, { recursive: true });

  return function imageResize(req, res, next) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    const width = Number(req.query.w);
    if (!ALLOWED_WIDTHS.has(width)) return next();

    let rel;
    try {
      rel = decodeURIComponent(req.path).replace(/^\/+/, "");
    } catch {
      return next();
    }
    if (!rel || rel.includes("\0")) return next();

    const ext = path.extname(rel).toLowerCase();
    if (!RESIZABLE_EXT.has(ext)) return next();

    const srcPath = path.resolve(rootReal, rel);
    if (srcPath !== rootReal && !srcPath.startsWith(rootReal + path.sep)) {
      return next(); // traversal attempt
    }

    let srcStat;
    try {
      srcStat = fs.statSync(srcPath);
      if (!srcStat.isFile()) return next();
    } catch {
      return next();
    }

    // mtime in the key => a re-mirrored avatar invalidates old variants.
    const hash = crypto
      .createHash("sha1")
      .update(`${rel}|${srcStat.mtimeMs}|${width}|${QUALITY}`)
      .digest("hex");
    const cachePath = path.join(cacheDir, `${hash}.webp`);

    const serve = () => {
      res.setHeader("Content-Type", "image/webp");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", "inline");
      res.setHeader(
        "Cache-Control",
        "public, max-age=86400, stale-while-revalidate=604800",
      );
      res.setHeader("Vary", "Accept");
      if (req.method === "HEAD") {
        res.status(200).end();
        return;
      }
      fs.createReadStream(cachePath)
        .on("error", () => next())
        .pipe(res);
    };

    fs.stat(cachePath, (err) => {
      if (!err) return serve();
      sharp(srcPath, { animated: false })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: QUALITY, effort: 4 })
        .toFile(cachePath)
        .then(serve)
        .catch(() => next());
    });
  };
}

module.exports = { createImageResizeMiddleware, ALLOWED_WIDTHS };
