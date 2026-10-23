// Convert cursor GIF to optimized 24x24 WebP
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const publicDir = path.join(__dirname, "..", "public");
const iconsDir = path.join(__dirname, "..", "src", "assets", "icons");

async function optimizeCursor() {
  try {
    const inputPath = path.join(publicDir, "cursors", "Normal.gif");
    const outputPath = path.join(iconsDir, "cursor-24.webp");

    if (!fs.existsSync(inputPath)) {
      console.log(`Cursor source not found: ${inputPath}`);
      return;
    }

    // Convert GIF to 24x24 WebP with extreme compression
    const webp = await sharp(inputPath, { animated: false })
      .resize(24, 24, { fit: "cover", position: "center" })
      .webp({ quality: 40, effort: 6, smartSubsample: true })
      .toBuffer();

    fs.writeFileSync(outputPath, webp);
    const originalStats = fs.statSync(inputPath);
    console.log(
      `✓ ${outputPath} (${(webp.length / 1024).toFixed(2)} KB, from ${(originalStats.size / 1024).toFixed(1)} KB)`,
    );
  } catch (err) {
    console.error("Failed to optimize cursor:", err.message);
  }
}

optimizeCursor();
