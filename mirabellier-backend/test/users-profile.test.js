const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("node:child_process");

// Point lib/db at a throwaway database before it is required.
const TMP_DB = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "users-profile-")),
  "test.sqlite3",
);
process.env.DB_FILE = TMP_DB;

const { db } = require("../lib/db");
const users = require("../lib/users");

test.after(() => {
  try {
    db.close();
  } catch {
    /* ignore */
  }
  fs.rmSync(path.dirname(TMP_DB), { recursive: true, force: true });
});

function makeUser(id, username) {
  db.prepare(
    "INSERT INTO users (id, username, createdAt) VALUES (?, ?, ?)",
  ).run(id, username, new Date().toISOString());
}

test("updateUserById enforces the username pattern", () => {
  makeUser("p1", "Mira");
  makeUser("p2", "bob");

  assert.throws(() => users.updateUserById("p2", { username: "ab" }), /invalid username/);
  assert.throws(() => users.updateUserById("p2", { username: "b o b" }), /invalid username/);
  assert.throws(() => users.updateUserById("p2", { username: "bбb" }), /invalid username/); // Cyrillic
  assert.throws(
    () => users.updateUserById("p2", { username: "x".repeat(31) }),
    /invalid username/,
  );

  const ok = users.updateUserById("p2", { username: "bob_2" });
  assert.equal(ok.username, "bob_2");
});

test("updateUserById rejects a case-insensitive username collision", () => {
  makeUser("p3", "Charlie");
  makeUser("p4", "dave");

  assert.throws(
    () => users.updateUserById("p4", { username: "CHARLIE" }),
    /username taken/,
  );

  // Re-casing your own handle is allowed.
  const recased = users.updateUserById("p3", { username: "charlie" });
  assert.equal(recased.username, "charlie");
});

test("findOrCreateDiscordUser falls back when the Discord handle is taken", async () => {
  // Both the Discord handle and the `discord_<id>` fallback are already claimed
  // (case-insensitively) by other accounts on the site.
  makeUser("d1", "Taken_Handle");
  makeUser("d2", "discord_999000222");

  const created = await users.findOrCreateDiscordUser({
    id: "999000222",
    username: "taken_handle",
  });

  // No constraint error, no login dead-end: a numeric suffix is appended.
  assert.equal(created.username, "discord_999000222_2");
  assert.equal(created.discordId, "999000222");
});

test("findOrCreateDiscordUser rejects a Discord handle that fails USERNAME_PATTERN", async () => {
  // Discord permits Unicode and lengths outside 3–30; updateUserById would
  // reject both. The handle must not be written verbatim.
  const cyrillic = await users.findOrCreateDiscordUser({
    id: "444000001",
    username: "mіra", // Cyrillic і
  });
  assert.equal(cyrillic.username, "discord_444000001");

  const tooLong = await users.findOrCreateDiscordUser({
    id: "444000002",
    username: "x".repeat(40),
  });
  assert.equal(tooLong.username, "discord_444000002");

  const withSpace = await users.findOrCreateDiscordUser({
    id: "444000003",
    username: "not a valid handle",
  });
  assert.equal(withSpace.username, "discord_444000003");

  // A clean ASCII handle is still kept as-is.
  const ok = await users.findOrCreateDiscordUser({
    id: "444000004",
    username: "clean_handle",
  });
  assert.equal(ok.username, "clean_handle");
});

test("findOrCreateDiscordUser mints distinct ids within the same millisecond", async () => {
  const [a, b] = await Promise.all([
    users.findOrCreateDiscordUser({ id: "555000001", username: "samems_a" }),
    users.findOrCreateDiscordUser({ id: "555000002", username: "samems_b" }),
  ]);

  assert.notEqual(a.id, b.id);
  assert.equal(users.getUserById(a.id).discordId, "555000001");
  assert.equal(users.getUserById(b.id).discordId, "555000002");
});

test("updateUserById caps bio and location length", () => {
  makeUser("p5", "erin");
  const updated = users.updateUserById("p5", {
    bio: "x".repeat(999),
    location: "y".repeat(999),
  });
  assert.equal(updated.bio.length, 500);
  assert.equal(updated.location.length, 100);
});

test("updateUserById writes every changed field in one pass and leaves others alone", () => {
  makeUser("p7", "gwen");
  users.updateUserById("p7", { bio: "first bio", location: "Seattle" });

  const updated = users.updateUserById("p7", {
    bio: "second bio",
    banner: "https://example.com/banner.png",
    website: "https://gwen.example",
    // avatar / location omitted → must be untouched
  });

  assert.equal(updated.bio, "second bio");
  assert.equal(updated.banner, "https://example.com/banner.png");
  assert.equal(updated.website, "https://gwen.example/");
  assert.equal(updated.location, "Seattle"); // not in this update, preserved
  assert.equal(updated.avatar, null); // never set

  // An empty string is a deliberate clear; `undefined` still skips.
  const cleared = users.updateUserById("p7", { bio: "" });
  assert.equal(cleared.bio, null);
  assert.equal(cleared.banner, "https://example.com/banner.png"); // untouched
});

test("lib/users fails the boot in production when SESSION_SECRET is unset", () => {
  const libPath = path.resolve(__dirname, "../lib/users.js");
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "users-boot-"));
  const script = `require(${JSON.stringify(libPath)})`;
  const baseEnv = {
    ...process.env,
    NODE_ENV: "production",
    DB_FILE: path.join(scratch, "boot.sqlite3"),
    IMAGES_DIR: scratch,
  };
  delete baseEnv.SESSION_SECRET;

  try {
    const missing = spawnSync(process.execPath, ["-e", script], {
      env: baseEnv,
      encoding: "utf8",
    });
    assert.notEqual(missing.status, 0, "expected a non-zero exit");
    assert.match(missing.stderr, /SESSION_SECRET is required in production/);

    // With the secret present it loads cleanly.
    const ok = spawnSync(process.execPath, ["-e", script], {
      env: { ...baseEnv, SESSION_SECRET: "x".repeat(32) },
      encoding: "utf8",
    });
    assert.equal(ok.status, 0, ok.stderr);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("revokeUserSessions drops every session for a user", () => {
  makeUser("p6", "frank");
  const tokenA = users.makeToken();
  const tokenB = users.makeToken();
  users.createSession(tokenA, "p6");
  users.createSession(tokenB, "p6");
  assert.ok(users.getUserByToken(tokenA));

  users.revokeUserSessions("p6");

  assert.equal(users.getUserByToken(tokenA), null);
  assert.equal(users.getUserByToken(tokenB), null);
});
