const test = require("node:test");
const assert = require("node:assert/strict");

const {
  TurnstileError,
  verifyTurnstileToken,
} = require("../lib/turnstile");

function makeRequest() {
  return {
    headers: { "cf-connecting-ip": "203.0.113.10" },
    ip: "127.0.0.1",
    socket: {},
  };
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test("Turnstile verification accepts a successful matching action", async (t) => {
  const previousSecret = process.env.TURNSTILE_SECRET_KEY;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFetch = global.fetch;
  t.after(() => {
    restoreEnv("TURNSTILE_SECRET_KEY", previousSecret);
    restoreEnv("NODE_ENV", previousNodeEnv);
    global.fetch = previousFetch;
  });

  process.env.NODE_ENV = "production";
  process.env.TURNSTILE_SECRET_KEY = "test-secret";
  global.fetch = async (_url, init) => {
    const payload = JSON.parse(init.body);
    assert.equal(payload.secret, "test-secret");
    assert.equal(payload.response, "valid-token");
    assert.equal(payload.remoteip, "203.0.113.10");
    return new Response(
      JSON.stringify({
        success: true,
        action: "guestbook",
        hostname: "mirabellier.com",
      }),
      { status: 200 },
    );
  };

  const result = await verifyTurnstileToken(
    makeRequest(),
    "valid-token",
    "guestbook",
  );
  assert.equal(result.success, true);
});

test("Turnstile verification rejects a missing token", async (t) => {
  const previousSecret = process.env.TURNSTILE_SECRET_KEY;
  const previousNodeEnv = process.env.NODE_ENV;
  t.after(() => {
    restoreEnv("TURNSTILE_SECRET_KEY", previousSecret);
    restoreEnv("NODE_ENV", previousNodeEnv);
  });

  process.env.NODE_ENV = "production";
  process.env.TURNSTILE_SECRET_KEY = "test-secret";

  await assert.rejects(
    verifyTurnstileToken(makeRequest(), "", "guestbook"),
    (error) =>
      error instanceof TurnstileError &&
      error.code === "TURNSTILE_TOKEN_REQUIRED",
  );
});

test("Turnstile verification rejects a mismatched action", async (t) => {
  const previousSecret = process.env.TURNSTILE_SECRET_KEY;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFetch = global.fetch;
  t.after(() => {
    restoreEnv("TURNSTILE_SECRET_KEY", previousSecret);
    restoreEnv("NODE_ENV", previousNodeEnv);
    global.fetch = previousFetch;
  });

  process.env.NODE_ENV = "production";
  process.env.TURNSTILE_SECRET_KEY = "test-secret";
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        action: "question_of_the_day",
        hostname: "mirabellier.com",
      }),
      { status: 200 },
    );

  await assert.rejects(
    verifyTurnstileToken(makeRequest(), "valid-token", "guestbook"),
    (error) =>
      error instanceof TurnstileError &&
      error.code === "TURNSTILE_ACTION_MISMATCH",
  );
});

test("Turnstile does not bypass just because NODE_ENV is not production", async (t) => {
  const previousSecret = process.env.TURNSTILE_SECRET_KEY;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousBypass = process.env.TURNSTILE_DEV_BYPASS;
  t.after(() => {
    restoreEnv("TURNSTILE_SECRET_KEY", previousSecret);
    restoreEnv("NODE_ENV", previousNodeEnv);
    restoreEnv("TURNSTILE_DEV_BYPASS", previousBypass);
  });

  process.env.NODE_ENV = "development";
  delete process.env.TURNSTILE_DEV_BYPASS;
  delete process.env.TURNSTILE_SECRET_KEY;

  await assert.rejects(
    verifyTurnstileToken(makeRequest(), "token", "guestbook"),
    (error) =>
      error instanceof TurnstileError &&
      error.code === "TURNSTILE_NOT_CONFIGURED",
  );
});

test("Turnstile bypasses only with an explicit TURNSTILE_DEV_BYPASS opt-in", async (t) => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousBypass = process.env.TURNSTILE_DEV_BYPASS;
  t.after(() => {
    restoreEnv("NODE_ENV", previousNodeEnv);
    restoreEnv("TURNSTILE_DEV_BYPASS", previousBypass);
  });

  process.env.NODE_ENV = "production";
  process.env.TURNSTILE_DEV_BYPASS = "true";

  const result = await verifyTurnstileToken(makeRequest(), "", "guestbook");
  assert.equal(result.success, true);
  assert.equal(result.devBypass, true);
});
