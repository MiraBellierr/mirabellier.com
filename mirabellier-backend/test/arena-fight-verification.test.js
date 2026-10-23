const test = require("node:test");
const assert = require("node:assert/strict");

const {
  VERIFICATION_TTL_MS,
  markArenaFightVerified,
  isArenaFightVerified,
  clearArenaFightVerification,
  resetArenaFightVerifications,
} = require("../lib/arena-fight-verification");

test("an unverified user is not verified", () => {
  resetArenaFightVerifications();
  assert.equal(isArenaFightVerified("u1"), false);
});

test("marking a user keeps them verified inside the TTL window", () => {
  resetArenaFightVerifications();
  const now = Date.now();
  markArenaFightVerified("u1", now);
  assert.equal(isArenaFightVerified("u1", now + VERIFICATION_TTL_MS - 1), true);
});

test("verification expires once the TTL window passes", () => {
  resetArenaFightVerifications();
  const now = Date.now();
  markArenaFightVerified("u1", now);
  assert.equal(isArenaFightVerified("u1", now + VERIFICATION_TTL_MS + 1), false);
});

test("a successful check slides the expiry forward", () => {
  resetArenaFightVerifications();
  const now = Date.now();
  markArenaFightVerified("u1", now);

  // Check near the end of the window — this should renew it.
  const later = now + VERIFICATION_TTL_MS - 10;
  assert.equal(isArenaFightVerified("u1", later), true);

  // Original window would have lapsed here; the slide keeps it alive.
  assert.equal(isArenaFightVerified("u1", now + VERIFICATION_TTL_MS + 5), true);
});

test("verification is scoped per user", () => {
  resetArenaFightVerifications();
  const now = Date.now();
  markArenaFightVerified("u1", now);
  assert.equal(isArenaFightVerified("u2", now), false);
});

test("clearing a user drops their verification", () => {
  resetArenaFightVerifications();
  const now = Date.now();
  markArenaFightVerified("u1", now);
  clearArenaFightVerification("u1");
  assert.equal(isArenaFightVerified("u1", now), false);
});

test("empty user ids are never verified", () => {
  resetArenaFightVerifications();
  markArenaFightVerified("");
  assert.equal(isArenaFightVerified(""), false);
  assert.equal(isArenaFightVerified(null), false);
  assert.equal(isArenaFightVerified(undefined), false);
});
