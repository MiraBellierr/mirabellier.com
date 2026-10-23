/**
 * Publish the Arena change notes shown on the Arena home page.
 *
 * Posts them oldest-first through createArenaUpdate(), so versions are assigned
 * v1.0.0, v1.0.1, ... in order.
 *
 * Usage:
 *   node scripts/seed-arena-updates.cjs --dry           # print what would post
 *   node scripts/seed-arena-updates.cjs                  # post (refuses if any updates exist)
 *   node scripts/seed-arena-updates.cjs --force          # post even if updates already exist
 *   node scripts/seed-arena-updates.cjs --user <id>      # attribute to a user id (default "system")
 */
const path = require("path");
const Database = require("better-sqlite3");

const DB_FILE =
  process.env.DB_FILE || path.join(__dirname, "..", "database.sqlite3");

const argv = process.argv.slice(2);
const isDry = argv.includes("--dry");
const force = argv.includes("--force");
const userIdx = argv.indexOf("--user");
const userId = userIdx !== -1 && argv[userIdx + 1] ? argv[userIdx + 1] : "system";

const NOTES = [
  {
    title: "Economy & shop overhaul",
    body: [
      "Coins & shop:",
      "- Coin rewards are softer early and richer late, and new level-scaled sinks give early coins somewhere to go.",
      "- Scrapping equipment now refunds coins.",
      "- Consumables are a straight coin purchase now — the old recipe/crafting step is gone.",
      "- Shop items unlock by level as intended (the tier gates were being ignored).",
      "",
      "Market & trade:",
      "- Market listings pay a commission and a small listing fee, and sale prices are bounded by recent comparable sales.",
      "- Direct trades now require level 10.",
      "",
      "Endgame:",
      "- A cosmetic Titles shop opens as a coin sink for maxed players. Titles show on your profile, the leaderboard, and to opponents you fight.",
      "",
      "Defending:",
      "- If a consumable fires while you are defending a PvP attack, its charge is now spent — same as attacking.",
    ].join("\n"),
  },
  {
    title: "Progression: skill tree, XP and equipment",
    body: [
      "Skill tree:",
      "- Points are budgeted: ~35 from levelling plus a bonus point at level 50, 60 and 70 — 38 for 45 nodes, so the last chain is a real choice.",
      "- Respec costs more (300 coins per level) and is locked for 3 days after use.",
      "",
      "Levelling:",
      "- The XP curve is flattened. Reaching level 70 is now roughly 3,700 fights instead of ~14,000, and each win pays more XP against higher-level opponents.",
      "- The win-streak XP bonus is now multiplicative: +2% per win on the streak, capped at +25%.",
      "",
      "Equipment:",
      "- Weapon / armour / charm each have a dedicated main stat (damage %, defend %, or crit) that can never also roll as a sub-stat.",
      "- Enhancing a piece now upgrades one random sub-stat every 3 levels.",
      "- 2- and 3-piece set bonuses are in.",
      "- \"Keep the higher roll\" reroll charges are now actually used.",
    ].join("\n"),
  },
  {
    title: "Combat & stat rework",
    body: [
      "effectHit finally matters every fight:",
      "- It shaves the defender's dodge chance and adds a small flat true-damage trickle to every hit — not just on the rare super-effective matchup.",
      "",
      "Turn order & tempo:",
      "- Near-equal speed is now much closer to a coin flip.",
      "- The fighter acting second in an exchange hits about 10% harder that turn.",
      "",
      "Other:",
      "- Super-effective hits no longer have their crit chance halved.",
      "- \"Double your first attack\" now triggers on your first landed hit regardless of who moves first, and isn't wasted if you swing second.",
      "- Card affinity is a real bonus now: lower thresholds, bigger values, applied directly instead of being divided down.",
      "- Real players picked as a defender now earn a coin stipend, win or lose.",
    ].join("\n"),
  },
  {
    title: "Combat Styles & interface",
    body: [
      "Elements are now Combat Styles: Might, Swift, Skill, Ruse, Surge, Ward.",
      "- Your cards keep their affinity — Fire→Might, Water→Swift, Earth→Ward, Wind→Ruse, Light→Surge, Dark→Skill.",
      "- The matchup chart is rebuilt so every style beats 2, loses to 2, and is even with 1. See the \"style matchups\" panel on the Fight page.",
      "",
      "Interface:",
      "- Shop, Inventory and the Arena tabs got a consistency cleanup.",
      "- The home page shows a \"Select Card\" shortcut when you have no fighter equipped.",
      "- These patch notes now carry version numbers.",
    ].join("\n"),
  },
];

const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");

const { initializeSchema } = require("../lib/db");
initializeSchema(db);

const { createArenaUpdate, getArenaUpdates } = require("../lib/arena/updates");

const existing = getArenaUpdates(db, { limit: 50 });
console.log(`Database : ${DB_FILE}`);
console.log(`Author   : ${userId}`);
console.log(`Existing : ${existing.length} update(s)`);
console.log(`Mode     : ${isDry ? "DRY RUN" : "PUBLISH"}`);
console.log("");

if (existing.length > 0 && !force && !isDry) {
  console.error("Refusing to post: Arena already has updates. Re-run with --force to add anyway.");
  db.close();
  process.exit(1);
}

for (const note of NOTES) {
  if (isDry) {
    console.log(`--- ${note.title} ---`);
    console.log(note.body);
    console.log("");
    continue;
  }
  const created = createArenaUpdate(db, userId, note);
  console.log(`✓ v${created.version}  ${created.title}`);
}

if (!isDry) {
  console.log(`\nPublished ${NOTES.length} update(s).`);
}

db.close();
