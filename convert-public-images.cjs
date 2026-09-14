const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "public");

// `input` is resolved from public/ (so "../src/assets/x.png" reads a source
// that is kept in the repo but never shipped); `output` always lands in
// public/. `width`, when set, caps the output width (aspect preserved, no
// upscale).
//
// pixies: the full-res PNG (src/assets/pixies.png) is only ever an Open
// Graph / share-card image, never rendered on a page, so only a resized
// 1200px WebP ships.
//
// flower / sun / moon / board: decorations rendered tiny (16-56px) or as a
// repeating CSS tile; the multi-hundred-KB PNG/JPG sources stay in
// src/assets/decoration/ and only a small WebP ships.
//
// grain / pin: the arena card grain tile is drawn at `background-size: 200px`
// (styles/arena.css) and the guestbook pin at 80x80 (styles/guestbook.css),
// but shipped at 500x500 — ~10x the pixels and ~100 kB combined. Re-emitted
// at 256/160px here so the display size still has retina headroom.
const images = [
  { input: "background.jpg", output: "background.webp" },
  {
    input: "../src/assets/light.jpg",
    output: "light.webp",
    width: 1600,
    quality: 78,
  },
  {
    input: "../src/assets/dark.jpg",
    output: "dark.webp",
    width: 1600,
    quality: 78,
  },
  { input: "../src/assets/pixies.png", output: "pixies.webp", width: 1200 },
  { input: "../src/assets/decoration/flower.png", output: "flower.webp", width: 140 },
  { input: "../src/assets/decoration/sun.png", output: "sun.webp", width: 64 },
  { input: "../src/assets/decoration/moon.png", output: "moon.webp", width: 64 },
  {
    input: "../src/assets/decoration/board.jpg",
    output: "board.webp",
    width: 480,
    quality: 70,
  },
  // Written back over itself — read into memory first (see convertImages).
  { input: "img/grain.webp", output: "img/grain.webp", width: 256, quality: 80 },
  // Transparency kept; the CSS refs move from /pin.png to /pin.webp.
  { input: "pin.png", output: "pin.webp", width: 160, quality: 80 },
];

// Open Graph / Twitter share card. The site used to point every `og:image` at
// the 272x272 `background.jpg`, which unfurls as a tiny letterboxed card;
// this is the 1200x630 (1.91:1) crop crawlers expect, built from the 4000px
// master. Referenced by index.html, vite.config.ts, src/lib/seo.ts and the
// per-page socialMeta blocks.
const ogImages = [
  {
    input: "../src/assets/background.jpeg",
    output: "og-image.jpg",
    width: 1200,
    height: 630,
  },
];

// Site icons, emitted as palette PNGs (crisp at every size, and a few kB even
// for the 180px apple-touch variant). `favicon.jpg` in src/assets/ is the
// master; it is never shipped itself. `icon-48.png` is the browser tab icon,
// `apple-touch-icon.png` the 180px homescreen icon. Keep both filenames in
// sync with index.html and the push `icon`/`badge` in public/sw.js.
const icons = [
  {
    input: "../src/assets/favicon.jpg",
    output: "icon-48.png",
    size: 48,
  },
  {
    input: "../src/assets/favicon.jpg",
    output: "apple-touch-icon.png",
    size: 180,
  },
];

async function convertImages() {
  for (const img of images) {
    const inputPath = path.join(publicDir, img.input);
    const outputPath = path.join(publicDir, img.output);

    try {
      if (!fs.existsSync(inputPath)) {
        console.log(`- ${img.input} not found, skipping`);
        continue;
      }

      const originalStats = fs.statSync(inputPath);
      console.log(
        `Converting ${img.input} (${(originalStats.size / 1024).toFixed(2)} KB)...`,
      );

      // Read into memory: `img/grain.webp` is written back over its own input,
      // and on Windows sharp keeps the source path open for the lifetime of
      // the pipeline.
      const input = fs.readFileSync(inputPath);
      let pipeline = sharp(input);
      if (img.width) {
        pipeline = pipeline.resize({
          width: img.width,
          withoutEnlargement: true,
        });
      }

      await pipeline
        .webp({ quality: img.quality ?? 80, effort: 6 })
        .toFile(outputPath);

      const webpStats = fs.statSync(outputPath);
      const savings = ((1 - webpStats.size / originalStats.size) * 100).toFixed(
        1,
      );
      console.log(
        `✓ Created ${img.output} (${(webpStats.size / 1024).toFixed(2)} KB, ${savings}% smaller)`,
      );
    } catch (err) {
      console.error(`✗ Error converting ${img.input}:`, err.message);
    }
  }
}

async function convertIcons() {
  for (const icon of icons) {
    const inputPath = path.join(publicDir, icon.input);
    const outputPath = path.join(publicDir, icon.output);

    try {
      if (!fs.existsSync(inputPath)) {
        console.log(`- ${icon.input} not found, skipping`);
        continue;
      }

      const originalStats = fs.statSync(inputPath);

      await sharp(inputPath)
        .resize(icon.size, icon.size, { fit: "cover", position: "center" })
        .png({ palette: true, colors: 256, compressionLevel: 9 })
        .toFile(outputPath);

      const stats = fs.statSync(outputPath);
      const savings = ((1 - stats.size / originalStats.size) * 100).toFixed(1);
      console.log(
        `✓ Created ${icon.output} (${(stats.size / 1024).toFixed(2)} KB, ${savings}% smaller)`,
      );
    } catch (err) {
      console.error(`✗ Error converting ${icon.input}:`, err.message);
    }
  }
}

async function convertOgImages() {
  for (const img of ogImages) {
    const inputPath = path.join(publicDir, img.input);
    const outputPath = path.join(publicDir, img.output);

    try {
      if (!fs.existsSync(inputPath)) {
        console.log(`- ${img.input} not found, skipping`);
        continue;
      }

      await sharp(inputPath)
        .resize({
          width: img.width,
          height: img.height,
          fit: "cover",
          position: "center",
        })
        .jpeg({ quality: 82, progressive: true })
        .toFile(outputPath);

      const stats = fs.statSync(outputPath);
      console.log(
        `✓ Created ${img.output} (${img.width}x${img.height}, ${(stats.size / 1024).toFixed(2)} KB)`,
      );
    } catch (err) {
      console.error(`✗ Error converting ${img.input}:`, err.message);
    }
  }
}

convertImages()
  .then(convertOgImages)
  .then(convertIcons)
  .catch(console.error);
