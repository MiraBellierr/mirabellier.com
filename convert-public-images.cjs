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
const images = [
  { input: "background.jpg", output: "background.webp" },
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

      let pipeline = sharp(inputPath);
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

convertImages().catch(console.error);
