import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildPlannerState,
  indexTeamsById,
  nextTeam,
  parseStoredPlannerState,
  resolveLocked,
  teamIdFromMembers,
  teamMembers,
  teammatesInIndex,
  usedCharacters,
  type LockedTeam,
} from "./hsr-planner.ts";
import type { HsrIndexedTeam } from "./hsr-api.ts";

function team(
  members: string[],
  overrides: Partial<HsrIndexedTeam> = {},
): HsrIndexedTeam {
  const sorted = [...members].sort();
  return {
    id: sorted.join("|"),
    members,
    rank: null,
    appRate: null,
    avgRound: null,
    avgRoundE1: null,
    ...overrides,
  };
}

function lock(id: string, mode = "moc"): LockedTeam {
  return { id, mode };
}

// Two disjoint teams plus one that overlaps the first.
const TEAM_A = team(["a", "b", "c", "d"], { rank: 1, appRate: 30 });
const TEAM_B = team(["e", "f", "g", "h"], { rank: 2, appRate: 20 });
const TEAM_C = team(["a", "b", "i", "j"], { rank: 3, appRate: 10 });
const MODE = { moc: [TEAM_A, TEAM_B, TEAM_C] };
const OWNED_ALL = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

function state(overrides: Partial<Parameters<typeof buildPlannerState>[0]> = {}) {
  return buildPlannerState({
    owned: OWNED_ALL,
    locked: [],
    teamsByMode: MODE,
    mode: "moc",
    ...overrides,
  });
}

test("a team is a candidate only when every member is owned", () => {
  const partial = state({ owned: ["a", "b", "c"] });
  assert.equal(partial.candidates.length, 0, "3 of 4 members is not a team");

  const full = state({ owned: ["a", "b", "c", "d"] });
  assert.deepEqual(
    full.candidates.map((entry) => entry.id),
    [TEAM_A.id],
  );
});

test("candidates keep prydwen's rank order", () => {
  assert.deepEqual(
    state().candidates.map((entry) => entry.rank),
    [1, 2, 3],
  );
});

test("locking a team consumes its members from later suggestions", () => {
  const before = state();
  assert.equal(before.candidates.length, 3);

  const after = state({ locked: [lock(TEAM_A.id)] });

  // TEAM_C shares a and b with the locked TEAM_A, so it must disappear.
  assert.deepEqual(
    after.candidates.map((entry) => entry.id),
    [TEAM_B.id],
  );
  assert.deepEqual([...after.used].sort(), ["a", "b", "c", "d"]);
  assert.equal(after.available.has("a"), false);
  assert.equal(after.available.has("e"), true);
});

test("a lock consumes its members across every mode", () => {
  // The same lineup appears in a second mode with different stats.
  const pfTeams = [TEAM_B, team(["a", "b", "c", "d"], { rank: 9 })];
  const teamsByMode = { moc: [TEAM_A, TEAM_B, TEAM_C], pf: pfTeams };

  const after = buildPlannerState({
    owned: OWNED_ALL,
    locked: [lock(TEAM_A.id, "moc")],
    teamsByMode,
    mode: "pf",
  });

  // The pf copy of TEAM_A is the same lineup, so it is consumed too; only
  // TEAM_B (also in pf) remains.
  assert.deepEqual(
    after.candidates.map((entry) => entry.id),
    [TEAM_B.id],
  );
});

test("locking every team empties the candidate list", () => {
  const after = state({
    locked: [lock(TEAM_A.id), lock(TEAM_B.id), lock(TEAM_C.id)],
  });
  assert.equal(after.candidates.length, 0);
  assert.equal(nextTeam(after), null);
});

test("a locked team with missing members is reported as stranded", () => {
  const after = state({ owned: ["a", "b"], locked: [lock(TEAM_A.id)] });

  assert.equal(after.stranded.length, 1);
  assert.equal(after.stranded[0].id, TEAM_A.id);
  // It still holds its slots, so nothing else may reuse them.
  assert.deepEqual([...after.used].sort(), ["a", "b", "c", "d"]);
});

test("a lock for a team that left the index is ignored, not fatal", () => {
  const after = state({ locked: [lock("gone|team|that|left")] });
  assert.equal(after.candidates.length, 3);
  assert.equal(after.used.size, 0);
  assert.equal(after.stranded.length, 0);
  assert.equal(after.locked.length, 0, "unresolvable locks are dropped");
});

test("locked teams resolve in lock order", () => {
  const after = state({ locked: [lock(TEAM_B.id), lock(TEAM_A.id)] });
  assert.deepEqual(
    after.locked.map((entry) => entry.id),
    [TEAM_B.id, TEAM_A.id],
  );
});

test("usedCharacters unions members across locked teams", () => {
  const byId = indexTeamsById(MODE);
  const used = usedCharacters([lock(TEAM_A.id), lock(TEAM_B.id)], byId);
  assert.deepEqual([...used].sort(), ["a", "b", "c", "d", "e", "f", "g", "h"]);
});

test("indexTeamsById skips malformed teams and keeps the first per id", () => {
  const byId = indexTeamsById({
    moc: [TEAM_A, { id: "", members: ["x"] } as HsrIndexedTeam],
    pf: [TEAM_A, TEAM_B],
  });
  assert.equal(byId.size, 2);
  assert.equal(byId.get(TEAM_A.id)?.rank, 1, "first mode wins");
});

test("resolveLocked drops unknown ids while preserving order", () => {
  const byId = indexTeamsById(MODE);
  const resolved = resolveLocked([lock(TEAM_B.id), lock("nope"), lock(TEAM_A.id)], byId);
  assert.deepEqual(
    resolved.map((entry) => entry.id),
    [TEAM_B.id, TEAM_A.id],
  );
});

test("nextTeam returns the best available team", () => {
  assert.equal(nextTeam(state({ locked: [lock(TEAM_A.id)] }))?.id, TEAM_B.id);
});

test("teammatesInIndex counts owned characters reachable in some team", () => {
  const reachable = teammatesInIndex(["a", "z"], [TEAM_A, TEAM_B, TEAM_C]);
  assert.deepEqual([...reachable], ["a"]);
});

test("teamIdFromMembers matches the backend's team key", () => {
  assert.equal(
    teamIdFromMembers(["blade-mortenax", "acheron", "hyacine", "tribbie"]),
    "acheron|blade-mortenax|hyacine|tribbie",
  );
});

test("teamMembers tolerates a malformed entry", () => {
  assert.deepEqual(teamMembers({ id: "x" } as HsrIndexedTeam), []);
  assert.deepEqual(teamMembers(null), []);
});

test("parseStoredPlannerState sanitizes persisted state", () => {
  assert.deepEqual(parseStoredPlannerState(null, "moc"), {
    owned: [],
    locked: [],
    mode: "moc",
  });

  assert.deepEqual(
    parseStoredPlannerState(
      {
        owned: ["a", "a", 2],
        locked: [{ id: "t1", mode: "pf" }, { id: "t1", mode: "as" }, { mode: "moc" }],
        mode: "pf",
      },
      "moc",
    ),
    { owned: ["a"], locked: [{ id: "t1", mode: "pf" }], mode: "pf" },
  );

  // A bad mode falls back rather than producing an undefined mode key.
  assert.deepEqual(parseStoredPlannerState({ mode: 7 }, "aa"), {
    owned: [],
    locked: [],
    mode: "aa",
  });
});

test("parseStoredPlannerState upgrades the legacy bare-id lock list", () => {
  const parsed = parseStoredPlannerState(
    { owned: ["a"], locked: ["t1", "t2"] },
    "as",
  );
  assert.deepEqual(parsed.locked, [
    { id: "t1", mode: "as" },
    { id: "t2", mode: "as" },
  ]);
});
