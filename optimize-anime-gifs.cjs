const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

/**
 * Re-encode the animated WebP stickers in src/assets/anime/ so they are no
 * bigger than they need to be, and emit a static `-poster.webp` still (frame
 * 0) next to each one:
 *
 *   node optimize-anime-gifs.cjs            # rewrite in place + write posters
 *   node optimize-anime-gifs.cjs --dry-run  # print the savings, change nothing
 *
 * These files are shown at ≤240px wide (so a 440px-wide asset still has 2x
 * headroom), but the Tenor sources run 10–25 fps at 500px+. Two levers:
 *
 *   - cap the width at MAX_WIDTH (never upscale), and
 *   - decimate to ~TARGET_FPS by dropping frames
 *
 * Frame decimation is the big one: the 25fps clips shrink ~65%, and dropping
 * frames also cuts the per-frame delay losslessly (we re-emit a constant
 * `delay` so the surviving frames play at the intended speed).
 *
 * Output is encoded with sharp's animated WebP writer at QUALITY/EFFORT. The
 * `loop: 0` flag is preserved (0 = loop forever).
 *
 * Posters: `AnimeSticker` (src/components/AnimeSticker.tsx) renders the still
 * on phones/narrow windows and only swaps in the animation on a wide viewport
 * with motion allowed, so the 80–380 kB animated file never reaches mobile.
 * The posters are generated here so they can never drift from the animation's
 * first frame.
 *
 * Skipped for posters: `kanna-kobayashi-poster.webp` (already a still),
 * `kanna-kobayashi-lite.webp` (Home pairs it with a hand-picked poster) and
 * `kanna-kobayashi.webp` (not imported anywhere). Anything with a single
 * frame is skipped throughout.
 */

const ANIME_DIR = path.join(__dirname, "src", "assets", "anime");
const TARGET_FPS = 12;
const MAX_WIDTH = 440;
const QUALITY = 55;
const EFFORT = 4;

// Static stills for the animated stickers. `-poster.webp` sits next to the
// animation and has the same intrinsic size (frame 0, uncropped).
const POSTER_QUALITY = 82;
const POSTER_EFFORT = 6;
const POSTER_EXCLUDE = new Set([
  "kanna-kobayashi-lite.webp",
  "kanna-kobayashi.webp",
]);

function posterPath(file) {
  return path.join(ANIME_DIR, file.replace(/\.webp$/, "-poster.webp"));
}

// WebP stores an animated image as one tall image; libwebp rejects anything
// with a dimension above 16383px.
const WEBP_MAX_DIMENSION = 16383;

const DRY_RUN = process.argv.includes("--dry-run");

async function optimize(file) {
  const src = path.join(ANIME_DIR, file);
  // Read into memory first: on Windows, sharp keeps the input path open for
  // the lifetime of the pipeline, which blocks writing the optimized bytes
  // back to the same file.
  const input = fs.readFileSync(src);
  const meta = await sharp(input, { animated: true }).metadata();
  if (!meta.pages || meta.pages < 2) return null;

  const { width, pageHeight, pages } = meta;
  const avgDelay = meta.delay.reduce((sum, d) => sum + d, 0) / meta.delay.length;
  const sourceFps = 1000 / avgDelay;

  const outWidth = Math.min(MAX_WIDTH, width);
  const outHeight = Math.round(pageHeight * (outWidth / width));

  let step = Math.max(1, Math.round(sourceFps / TARGET_FPS));
  // Keep the frame strip under libwebp's dimension cap.
  while (
    Math.floor((pages - 1) / step) + 1 >
    Math.floor(WEBP_MAX_DIMENSION / outHeight)
  ) {
    step += 1;
  }

  const keptPages = [];
  for (let page = 0; page < pages; page += step) keptPages.push(page);

  const raw = await sharp(input, { animated: true }).raw().toBuffer();
  const pageBytes = width * pageHeight * 4;

  const frames = [];
  for (const page of keptPages) {
    frames.push(
      await sharp(raw.subarray(page * pageBytes, (page + 1) * pageBytes), {
        raw: { width, height: pageHeight, channels: 4 },
      })
        .resize({ width: outWidth })
        .raw()
        .toBuffer(),
    );
  }

  // Preserve the original playback duration: each surviving frame holds for
  // `step` original frames. Using the source delay (rather than a fixed
  // 1000/TARGET_FPS) means a source already below TARGET_FPS keeps its own
  // pace instead of being sped up.
  const outputDelay = Math.max(1, Math.round(avgDelay * step));
  const output = await sharp(Buffer.concat(frames), {
    raw: {
      width: outWidth,
      height: outHeight * keptPages.length,
      channels: 4,
      pageHeight: outHeight,
    },
  })
    .webp({
      quality: QUALITY,
      effort: EFFORT,
      smartSubsample: true,
      delay: keptPages.map(() => outputDelay),
      loop: 0,
    })
    .toBuffer();

  const inputKb = fs.statSync(src).size / 1024;
  const outputKb = output.length / 1024;
  const playedFps = 1000 / (avgDelay * step);
  const label = `${file}  ${width}x${pageHeight} ${sourceFps.toFixed(0)}fps/${pages}f`;
  const detail =
    `-> ${outWidth}x${outHeight} ${playedFps.toFixed(0)}fps/${keptPages.length}f ` +
    `${inputKb.toFixed(0)}kB -> ${outputKb.toFixed(0)}kB ` +
    `(${(100 - (outputKb / inputKb) * 100).toFixed(0)}% smaller)`;

  if (DRY_RUN) {
    console.log(`  ${label}\n    ${detail}`);
  } else {
    fs.writeFileSync(src, output);
    console.log(`  ✓ ${label}\n    ${detail}`);
  }

  return { inputKb, outputKb };
}

async function writePoster(file) {
  if (POSTER_EXCLUDE.has(file)) return null;

  const src = path.join(ANIME_DIR, file);
  const input = fs.readFileSync(src);
  const out = await sharp(input, { page: 0 })
    .webp({ quality: POSTER_QUALITY, effort: POSTER_EFFORT })
    .toBuffer();
  const name = file.replace(/\.webp$/, "-poster.webp");
  const kb = out.length / 1024;

  if (!DRY_RUN) fs.writeFileSync(posterPath(file), out);
  console.log(`    + ${name} (${kb.toFixed(1)}kB)`);

  return kb;
}

async function main() {
  const files = fs
    .readdirSync(ANIME_DIR)
    .filter((f) => f.endsWith(".webp") && !f.endsWith("-poster.webp"))
    .sort();

  console.log(
    `${DRY_RUN ? "[dry-run] " : ""}Optimizing ${files.length} WebP asset(s) in src/assets/anime/...\n`,
  );

  let inputTotal = 0;
  let outputTotal = 0;
  let posterTotal = 0;
  let optimized = 0;

  for (const file of files) {
    try {
      const result = await optimize(file);
      if (!result) continue;
      inputTotal += result.inputKb;
      outputTotal += result.outputKb;
      optimized += 1;

      const posterKb = await writePoster(file);
      if (posterKb !== null) posterTotal += posterKb;
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`);
    }
  }

  console.log(
    `\n${optimized} animated file(s) optimized: ` +
      `${inputTotal.toFixed(0)}kB -> ${outputTotal.toFixed(0)}kB ` +
      `(${(100 - (outputTotal / inputTotal) * 100).toFixed(0)}% smaller)`,
  );
  console.log(
    `${posterTotal > 0 ? "Posters written" : "No posters written"}` +
      (posterTotal > 0 ? `: ${posterTotal.toFixed(0)}kB total` : ""),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
