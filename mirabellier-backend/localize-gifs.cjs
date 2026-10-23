// Downloads external GIFs and converts them to optimized WebP assets for the frontend.
const fs = require("fs");
const path = require("path");
const https = require("https");
const sharp = require("sharp");

const targets = [
  {
    name: "kobayashi-maid-dragon",
    url: "https://media1.tenor.com/m/hVmwmbz6u9oAAAAC/kobayashi-san-maid-dragon.gif",
  },
  {
    name: "kanna-kobayashi",
    url: "https://media1.tenor.com/m/jW2TAwN7h50AAAAC/anime-kanna-kobayashi.gif",
  },
  {
    name: "kanna-smile",
    url: "https://media1.tenor.com/m/JhZvuXpFmvIAAAAd/kobayashi-kanna.gif",
  },
  {
    name: "miss-kobayashi",
    url: "https://media1.tenor.com/m/KHZPhIUhSBsAAAAC/miss-kobayashi.gif",
  },
  {
    name: "kanna-happy",
    url: "https://media1.tenor.com/m/cJ-bh8QFs9kAAAAC/anime-kanna.gif",
  },
  {
    name: "kanna-eating",
    url: "https://media1.tenor.com/m/vk4u2ez6sHUAAAAd/kanna-eating.gif",
  },
  {
    name: "kanna-shy",
    url: "https://media1.tenor.com/m/jfQ2ctn0IQMAAAAC/kanna-kamui.gif",
  },
  {
    name: "kanna-police",
    url: "https://media1.tenor.com/m/lSmr5M7po7QAAAAC/kanna-kamui-kanna-police.gif",
  },
  {
    name: "kanna-wink",
    url: "https://media1.tenor.com/m/8o3YhF-eByUAAAAC/kanna-kamui.gif",
  },
];

const outDir = path.join(__dirname, "..", "src", "assets", "anime");
fs.mkdirSync(outDir, { recursive: true });

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed (${res.statusCode}) for ${url}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

async function processAll() {
  for (const { name, url } of targets) {
    try {
      const buf = await download(url);
      // Use quality 70 for better compression of large anime images
      const webp = await sharp(buf, { animated: true })
        .webp({ quality: 70, effort: 6, smartSubsample: true, loop: 0 })
        .toBuffer();
      const outPath = path.join(outDir, `${name}.webp`);
      fs.writeFileSync(outPath, webp);
      console.log(`Saved ${outPath} (${(webp.length / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error(`Failed to process ${name}:`, err.message);
    }
  }
}

processAll();
