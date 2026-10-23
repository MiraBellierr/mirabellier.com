const test = require("node:test");
const assert = require("node:assert/strict");

const { sanitizeWebsite, sanitizeMediaUrl } = require("../lib/sanitize-website");

test("sanitizeWebsite rejects javascript: and other dangerous schemes", () => {
  assert.equal(sanitizeWebsite("javascript:alert(1)"), null);
  assert.equal(sanitizeWebsite("  javascript:alert(1)  "), null);
  assert.equal(sanitizeWebsite("data:text/html,<script>"), null);
  assert.equal(sanitizeWebsite("vbscript:msgbox(1)"), null);
});

test("sanitizeWebsite normalizes bare hostnames to https", () => {
  assert.equal(sanitizeWebsite("example.com"), "https://example.com/");
  assert.equal(sanitizeWebsite("http://example.com/x"), "http://example.com/x");
  assert.equal(sanitizeWebsite(""), null);
  assert.equal(sanitizeWebsite(null), null);
});

test("sanitizeWebsite caps length at 200 chars", () => {
  const long = `https://example.com/${"a".repeat(500)}`;
  assert.equal(sanitizeWebsite(long).length, 200);
});

test("sanitizeMediaUrl allows local upload paths and https only", () => {
  assert.equal(sanitizeMediaUrl("/images/x.png"), "/images/x.png");
  assert.equal(
    sanitizeMediaUrl("https://cdn.discordapp.com/a.png"),
    "https://cdn.discordapp.com/a.png",
  );
  assert.equal(sanitizeMediaUrl("http://example.com/a.png"), null);
  assert.equal(sanitizeMediaUrl("//evil.example/x.png"), null);
  assert.equal(sanitizeMediaUrl("javascript:alert(1)"), null);
  assert.equal(sanitizeMediaUrl(""), null);
});
