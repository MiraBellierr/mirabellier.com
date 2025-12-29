const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');

const images = [
  { input: 'background.jpg', output: 'background.webp' },
];

async function convertImages() {
  for (const img of images) {
    const inputPath = path.join(publicDir, img.input);
    const outputPath = path.join(publicDir, img.output);

    try {
      if (!fs.existsSync(inputPath)) {
        console.log(`✗ ${inputPath} not found`);
        continue;
      }

      const originalStats = fs.statSync(inputPath);
      console.log(`Converting ${img.input} (${(originalStats.size / 1024).toFixed(2)} KB)...`);

      await sharp(inputPath)
        .webp({ quality: 75, effort: 6 })
        .toFile(outputPath);

      const webpStats = fs.statSync(outputPath);
      const savings = ((1 - webpStats.size / originalStats.size) * 100).toFixed(1);
      console.log(`✓ Created ${img.output} (${(webpStats.size / 1024).toFixed(2)} KB, ${savings}% smaller)`);
    } catch (err) {
      console.error(`✗ Error converting ${img.input}:`, err.message);
    }
  }
}

convertImages().catch(console.error);
