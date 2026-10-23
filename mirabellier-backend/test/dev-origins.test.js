const test = require("node:test");
const assert = require("node:assert/strict");

function loadFresh() {
  delete require.cache[require.resolve("../lib/dev-origins")];
  return require("../lib/dev-origins");
}

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("dev origins are only trusted with an explicit ALLOW_DEV_ORIGINS=true", (t) => {
  const previous = process.env.ALLOW_DEV_ORIGINS;
  t.after(() => restore("ALLOW_DEV_ORIGINS", previous));

  delete process.env.ALLOW_DEV_ORIGINS;
  assert.equal(loadFresh().devOriginsEnabled(), false);

  process.env.ALLOW_DEV_ORIGINS = "false";
  assert.equal(loadFresh().devOriginsEnabled(), false);

  process.env.ALLOW_DEV_ORIGINS = "production";
  assert.equal(loadFresh().devOriginsEnabled(), false);

  process.env.ALLOW_DEV_ORIGINS = "true";
  assert.equal(loadFresh().devOriginsEnabled(), true);

  process.env.ALLOW_DEV_ORIGINS = "TRUE";
  assert.equal(loadFresh().devOriginsEnabled(), true);
});

test("DEV_ORIGINS lists the local vite dev servers", () => {
  const { DEV_ORIGINS } = loadFresh();
  assert.deepEqual(DEV_ORIGINS, [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);
});
