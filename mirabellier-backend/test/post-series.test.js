const test = require("node:test");
const assert = require("node:assert/strict");

const { MAX_SERIES_LENGTH, sanitizeSeries } = require("../lib/post-series");

test("sanitizeSeries trims, collapses whitespace, and keeps the text", () => {
  assert.equal(sanitizeSeries("  Learning   Rust  "), "Learning Rust");
  assert.equal(sanitizeSeries("Cozy Web\tNotes"), "Cozy Web Notes");
});

test("sanitizeSeries returns null for empty-ish input", () => {
  assert.equal(sanitizeSeries(null), null);
  assert.equal(sanitizeSeries(undefined), null);
  assert.equal(sanitizeSeries(""), null);
  assert.equal(sanitizeSeries("   "), null);
  assert.equal(sanitizeSeries("\n\t "), null);
});

test("sanitizeSeries drops control characters", () => {
  assert.equal(
    sanitizeSeries(`a${String.fromCharCode(0)}b${String.fromCharCode(7)}c`),
    "a b c",
  );
  assert.equal(sanitizeSeries(String.fromCharCode(0x85)), null);
});

test("sanitizeSeries caps the length and re-trims the cut", () => {
  const long = `${"x".repeat(MAX_SERIES_LENGTH + 20)}`;
  assert.equal(sanitizeSeries(long).length, MAX_SERIES_LENGTH);

  // A cap landing on a space must not leave a trailing space.
  const withSpaceAtCap = `${"y".repeat(MAX_SERIES_LENGTH - 1)} tail`;
  assert.equal(sanitizeSeries(withSpaceAtCap), "y".repeat(MAX_SERIES_LENGTH - 1));
});

test("sanitizeSeries coerces non-strings", () => {
  assert.equal(sanitizeSeries(42), "42");
  assert.equal(sanitizeSeries(0), "0");
});
