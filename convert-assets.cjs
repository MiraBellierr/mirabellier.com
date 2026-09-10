const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

/**
 * Bulk-convert raster images in src/assets/ to WebP, rewrite every import /
 * `url()` reference under src/ to the new `.webp` name, and delete the original
 * files. Animated GIFs become animated WebP.
 *
 *   node convert-assets.cjs            # convert + rewrite refs + delete originals
 *   node convert-assets.cjs --dry-run  # print what would happen, change nothing
 *
 * If `<name>.webp` already exists next to `<name>.<ext>`, the existing WebP is
 * kept (never re-encoded); the stale source is just removed and refs are fixed.
 *
 * NOT touched by default (owned by other build scripts, or loaded via
 * `import.meta.glob` which a per-file rename would break):
 *   - src/assets/shrine/       -> convert-images.cjs (keeps sources + manifest)
 *   - src/assets/decoration/   -> convert-public-images.cjs reads these sources
 *   - src/assets/sprites/      -> import.meta.glob("/src/assets/sprites/*.png")
 *   - src/assets/elements/     -> bulk game sprite sheets
 *   - src/assets/Free pack/    -> bulk game art
 *   - individual EXCLUDE_FILES that convert-*.cjs read directly
 */

const ROOT = __dirname;
const ASSETS_DIR = path.join(ROOT, "src", "assets");
const REF_ROOT = path.join(ROOT, "src");

const SOURCE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif"]);
const REF_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".css",
  ".scss",
  ".html",
]);

const EXCLUDE_DIRS = new Set([
  "shrine",
  "decoration",
  "sprites",
  "elements",
  "Free pack",
]);
const EXCLUDE_FILES = new Set([
  "light.jpg",
  "dark.jpg",
  "background.jpg",
  "background.jpeg",
  "back-card-design.jpg",
  "pixies.png",
]);

const DRY_RUN = process.argv.includes("--dry-run");
const QUALITY = 80;
const EFFORT = 6;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function collectSources() {
  return walk(ASSETS_DIR)
    .filter((f) => SOURCE_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .filter((f) => !EXCLUDE_FILES.has(path.basename(f)))
    .sort();
}

function collectRefFiles() {
  return walk(REF_ROOT).filter((f) =>
    REF_EXTENSIONS.has(path.extname(f).toLowerCase()),
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace `<oldBase>` with `<newBase>` inside quoted strings / `url(...)` refs
 * (bounded by a delimiter on each side, so a partial filename match can't slip
 * through). Returns the number of occurrences replaced.
 */
function rewriteReferences(refFiles, oldBase, newBase) {
  const re = new RegExp(
    "([\"'`(/])" + escapeRegExp(oldBase) + "(?=[\"'`)])",
    "g",
  );
  let total = 0;
  for (const file of refFiles) {
    const src = fs.readFileSync(file, "utf8");
    if (!src.includes(oldBase)) continue;
    const matches = src.match(re);
    if (!matches) continue;
    total += matches.length;
    if (!DRY_RUN) {
      fs.writeFileSync(file, src.replace(re, (_, delim) => delim + newBase));
    }
  }
  return total;
}

async function toWebp(file) {
  const ext = path.extname(file).toLowerCase();
  const outPath = file.slice(0, -ext.length) + ".webp";
  const animated = ext === ".gif";
  let pipeline = sharp(file, animated ? { animated: true } : undefined);
  if (!animated) pipeline = pipeline.rotate(); // honour EXIF orientation
  await pipeline.webp({ quality: QUALITY, effort: EFFORT }).toFile(outPath);
  return outPath;
}

async function main() {
  if (!fs.existsSync(ASSETS_DIR)) {
    console.error(`No such directory: ${ASSETS_DIR}`);
    process.exit(1);
  }

  const sources = collectSources();
  const refFiles = collectRefFiles();

  console.log(
    `${DRY_RUN ? "[dry-run] " : ""}${sources.length} source image(s) in src/assets/ ` +
      `(skipping: ${[...EXCLUDE_DIRS].join(", ")})\n`,
  );

  let converted = 0;
  let kept = 0;
  let failed = 0;
  let refs = 0;
  let originalKb = 0;
  let webpKb = 0;

  for (const file of sources) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const ext = path.extname(file);
    const oldBase = path.basename(file);
    const newBase = path.basename(file, ext) + ".webp";
    const outPath = file.slice(0, -ext.length) + ".webp";
    const srcKb = fs.statSync(file).size / 1024;

    try {
      if (fs.existsSync(outPath)) {
        const hits = rewriteReferences(refFiles, oldBase, newBase);
        refs += hits;
        if (!DRY_RUN) fs.unlinkSync(file);
        kept += 1;
        console.log(
          `  = ${rel}  (kept existing ${newBase}, removed stale source` +
            `${hits ? `, ${hits} ref(s) updated` : ""})`,
        );
        continue;
      }

      let outKb = srcKb;
      if (!DRY_RUN) {
        await toWebp(file);
        outKb = fs.statSync(outPath).size / 1024;
      }

      const hits = rewriteReferences(refFiles, oldBase, newBase);
      refs += hits;
      if (!DRY_RUN) fs.unlinkSync(file);

      converted += 1;
      originalKb += srcKb;
      webpKb += outKb;

      console.log(
        `  ✓ ${rel} → ${newBase}  ` +
          `${srcKb.toFixed(1)} KB` +
          (DRY_RUN
            ? ""
            : ` → ${outKb.toFixed(1)} KB (${(100 - (outKb / srcKb) * 100).toFixed(0)}% smaller)`) +
          (hits ? `  · ${hits} ref(s)` : ""),
      );
    } catch (err) {
      failed += 1;
      console.error(`  ✗ ${rel}: ${err.message}`);
    }
  }

  console.log(
    `\n${DRY_RUN ? "[dry-run] " : ""}${converted} converted, ${kept} stale source(s) removed, ` +
      `${failed} failed, ${refs} reference(s) rewritten.`,
  );
  if (!DRY_RUN && originalKb > 0) {
    console.log(
      `  ${originalKb.toFixed(0)} KB → ${webpKb.toFixed(0)} KB ` +
        `(${(100 - (webpKb / originalKb) * 100).toFixed(0)}% smaller total)`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
