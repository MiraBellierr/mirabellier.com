const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

// Create small 20x20 versions of navigation icons
const icons = [
  { input: "src/assets/img1.webp", output: "src/assets/icons/home-20.webp" },
  { input: "src/assets/img2.webp", output: "src/assets/icons/about-20.webp" },
  { input: "src/assets/img3.webp", output: "src/assets/icons/blog-20.webp" },
  { input: "src/assets/img4.webp", output: "src/assets/icons/art-20.webp" },
  { input: "src/assets/cats.webp", output: "src/assets/icons/cats-20.webp" },
];

// Create icons directory
const iconsDir = path.join(__dirname, "src/assets/icons");
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

async function optimizeIcons() {
  for (const icon of icons) {
    try {
      await sharp(icon.input)
        .resize(20, 20, {
          fit: "cover",
          position: "center",
        })
        .webp({ quality: 90, effort: 6 })
        .toFile(icon.output);

      const stats = fs.statSync(icon.output);
      console.log(`✓ ${icon.output} - ${(stats.size / 1024).toFixed(2)} KB`);
    } catch (err) {
      console.error(`✗ Failed to process ${icon.input}:`, err.message);
    }
  }

  // Also create 20x20 cursor icon from Normal.gif
  try {
    const gifBuffer = fs.readFileSync("public/cursors/Normal.gif");
    await sharp(gifBuffer, { animated: false })
      .resize(20, 20)
      .webp({ quality: 90 })
      .toFile("src/assets/icons/cursor-20.webp");

    const stats = fs.statSync("src/assets/icons/cursor-20.webp");
    console.log(
      `✓ src/assets/icons/cursor-20.webp - ${(stats.size / 1024).toFixed(2)} KB`,
    );
  } catch (err) {
    console.error("✗ Failed to process cursor:", err.message);
  }

  console.log("\n✓ All navigation icons optimized to 20x20!");
}

optimizeIcons().catch(console.error);
