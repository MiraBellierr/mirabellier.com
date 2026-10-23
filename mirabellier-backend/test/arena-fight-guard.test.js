const test = require("node:test");
const assert = require("node:assert/strict");

const {
  checkArenaFightRateLimit,
  checkArenaPlaybackRateLimit,
  resetArenaFightRateLimits,
} = require("../lib/arena-fight-guard");

function request(ip) {
  return {
    headers: { "cf-connecting-ip": ip },
    ip,
    socket: { remoteAddress: ip },
  };
}

test("Arena fight guard limits rapid attempts per account", () => {
  resetArenaFightRateLimits();
  const req = request("203.0.113.20");
  const now = Date.now();

  for (let index = 0; index < 30; index += 1) {
    assert.equal(
      checkArenaFightRateLimit(req, "user-1", now + index).allowed,
      true,
    );
  }

  const blocked = checkArenaFightRateLimit(req, "user-1", now + 31);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);
});

test("Arena fight guard also limits shared source IP abuse", () => {
  resetArenaFightRateLimits();
  const req = request("203.0.113.21");
  const now = Date.now();

  for (let index = 0; index < 30; index += 1) {
    assert.equal(
      checkArenaFightRateLimit(req, `user-${index}`, now + index).allowed,
      true,
    );
  }

  assert.equal(
    checkArenaFightRateLimit(req, "user-31", now + 31).allowed,
    false,
  );
});

test("playback guard allows many steps per minute but caps hammering", () => {
  resetArenaFightRateLimits();
  const req = request("203.0.113.30");
  const now = Date.now();

  for (let index = 0; index < 600; index += 1) {
    assert.equal(
      checkArenaPlaybackRateLimit(req, "user-1", now + index).allowed,
      true,
    );
  }

  const blocked = checkArenaPlaybackRateLimit(req, "user-1", now + 601);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);
});

test("playback and fight guards use independent buckets", () => {
  resetArenaFightRateLimits();
  const req = request("203.0.113.31");
  const now = Date.now();

  // Exhaust the fight-creation limit.
  for (let index = 0; index < 30; index += 1) {
    checkArenaFightRateLimit(req, "user-1", now + index);
  }
  assert.equal(checkArenaFightRateLimit(req, "user-1", now + 31).allowed, false);

  // Playback stepping for the same account/IP is unaffected.
  assert.equal(
    checkArenaPlaybackRateLimit(req, "user-1", now + 32).allowed,
    true,
  );
});

test("playback guard works without a request object (websocket path)", () => {
  resetArenaFightRateLimits();
  const now = Date.now();

  for (let index = 0; index < 600; index += 1) {
    assert.equal(
      checkArenaPlaybackRateLimit(null, "ws-user", now + index).allowed,
      true,
    );
  }
  assert.equal(
    checkArenaPlaybackRateLimit(null, "ws-user", now + 601).allowed,
    false,
  );
});

test("websocket path (no request) limits per account, not one shared IP bucket", () => {
  resetArenaFightRateLimits();
  const now = Date.now();

  // Two different accounts on the WS path (req === null). Before the fix both
  // shared the `fight:ip:ws` bucket and the second user was locked out after
  // the first exhausted 30 fights. Now each account has its own budget.
  for (let index = 0; index < 30; index += 1) {
    assert.equal(
      checkArenaFightRateLimit(null, "ws-user-a", now + index).allowed,
      true,
    );
  }
  assert.equal(
    checkArenaFightRateLimit(null, "ws-user-a", now + 31).allowed,
    false,
    "user A is limited by their own account window",
  );
  assert.equal(
    checkArenaFightRateLimit(null, "ws-user-b", now + 32).allowed,
    true,
    "user B is unaffected by user A hitting the limit",
  );
});
