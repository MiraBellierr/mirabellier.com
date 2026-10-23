const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");

const registerHsrRoutes = require("../routes/hsr");

function createDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hsr-routes-"));
  fs.mkdirSync(path.join(dir, "characters"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "characters.json"),
    JSON.stringify({
      schema: 2,
      total: 2,
      characters: [
        { slug: "acheron", name: "Acheron", element: "Lightning" },
        { slug: "tribbie", name: "Tribbie", element: "Quantum" },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(dir, "team-index.json"),
    JSON.stringify({
      schema: 2,
      total: 1,
      phases: { moc: { phase: "4.4.1 — Stormcleanse" } },
      modes: {
        moc: {
          key: "moc",
          label: "Memory of Chaos",
          scoreLabel: "Avg. cycles",
          count: 1,
          teams: [
            {
              id: "acheron|hyacine|tribbie",
              members: ["acheron", "tribbie", "hyacine"],
              rank: 36,
              appRate: 1.07,
              avgRound: 11.25,
              avgRoundE1: 8.81,
            },
          ],
        },
      },
    }),
  );
  fs.writeFileSync(
    path.join(dir, ".meta.json"),
    JSON.stringify({
      schema: 2,
      sourceLastUpdated: "22/September/2026",
      lastSyncAt: "2026-09-23T00:00:00.000Z",
      lastFullSyncAt: "2026-09-23T00:00:00.000Z",
      characters: { acheron: {}, tribbie: {} },
    }),
  );
  return dir;
}

// Minimal client: boot the router on an ephemeral port and fetch it.
async function withServer(dataDir, callback) {
  const app = express();
  registerHsrRoutes(app, { hsrDataDir: dataDir });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await callback(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("serves the roster, team index, and status", async () => {
  const dataDir = createDataDir();
  try {
    await withServer(dataDir, async (base) => {
      const roster = await (await fetch(`${base}/hsr/characters`)).json();
      assert.equal(roster.total, 2);
      assert.equal(roster.characters[0].slug, "acheron");

      const teams = await (await fetch(`${base}/hsr/teams`)).json();
      assert.equal(teams.modes.moc.count, 1);
      assert.deepEqual(teams.modes.moc.teams[0].members, [
        "acheron",
        "tribbie",
        "hyacine",
      ]);
      assert.equal(teams.modes.moc.teams[0].rank, 36);

      // Explicit alias for the same document.
      const alias = await (await fetch(`${base}/hsr/team-index`)).json();
      assert.equal(alias.modes.moc.count, 1);

      const status = await (await fetch(`${base}/hsr/status`)).json();
      assert.equal(status.sourceLastUpdated, "22/September/2026");
      assert.equal(status.characters, 2);
    });
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("answers 503 before the first sync has produced data", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hsr-empty-"));
  try {
    await withServer(dir, async (base) => {
      assert.equal((await fetch(`${base}/hsr/characters`)).status, 503);
      assert.equal((await fetch(`${base}/hsr/teams`)).status, 503);
      assert.equal((await fetch(`${base}/hsr/team-index`)).status, 503);
      assert.equal((await fetch(`${base}/hsr/status`)).status, 503);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("caches by file mtime so a rewritten index is picked up", async () => {
  const dataDir = createDataDir();
  try {
    await withServer(dataDir, async (base) => {
      const first = await (await fetch(`${base}/hsr/teams`)).json();
      assert.equal(first.total, 1);

      // Rewrite with a bumped mtime, the way the sync does.
      const file = path.join(dataDir, "team-index.json");
      fs.writeFileSync(
        file,
        JSON.stringify({ schema: 2, total: 5, phases: {}, modes: {} }),
      );
      const future = new Date(Date.now() + 5000);
      fs.utimesSync(file, future, future);

      const second = await (await fetch(`${base}/hsr/teams`)).json();
      assert.equal(second.total, 5);
    });
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
