import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(
  readFileSync(join(__dirname, "..", "data", "mal-characters.json"), "utf-8"),
);

const seriesCount = new Map();

for (const char of data.characters) {
  const anime = (char.appearances || []).find(
    (a) => a.type === "anime" && a.name,
  );
  const name = anime?.name || "(no anime)";
  seriesCount.set(name, (seriesCount.get(name) || 0) + 1);
}

const sorted = [...seriesCount.entries()].sort((a, b) => b[1] - a[1]);

console.log(`Series: ${seriesCount.size}`);
console.log(`Characters: ${data.characters.length}\n`);

for (const [series, count] of sorted) {
  console.log(`${count.toString().padStart(6)}  ${series}`);
}
