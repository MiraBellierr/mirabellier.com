const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  parseCookiesFile,
  cookieHeaderForHost,
  cookieFilePathIfExists,
} = require("../lib/netscape-cookies");

const SAMPLE = `# Netscape HTTP Cookie File
# https://curl.se/docs/http-cookies.html
.tiktok.com	TRUE	/	FALSE	0	ttwid	1|abc
.tiktok.com	TRUE	/	FALSE	0	sessionid	secret123
#HttpOnly_.tiktok.com	TRUE	/	FALSE	1999999999	sessionid	httponlyval
.instagram.com	TRUE	/	FALSE	0	sessionid	ig-secret
.instagram.com	TRUE	/	TRUE	0	csrftoken	ig-csrf
.example.com	TRUE	/	FALSE	0	other	site
.instagram.com	TRUE	/	FALSE	1600000000	expired	gone
`;

let dir;
let file;
test.before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cookies-"));
  file = path.join(dir, "cookies.txt");
  fs.writeFileSync(file, SAMPLE);
});

test.after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

test("parseCookiesFile skips comments, HttpOnly prefix, and expired rows", () => {
  const cookies = parseCookiesFile(file);
  assert.ok(cookies.length >= 6);
  const values = cookies.map((c) => c.name);
  assert.ok(values.includes("ttwid"));
  assert.ok(values.includes("sessionid"));
  assert.ok(values.includes("expired") === false);
});

test("cookieHeaderForHost filters cookies by domain", () => {
  const tiktok = cookieHeaderForHost(file, "www.tiktok.com");
  assert.ok(tiktok.includes("ttwid=1|abc"));
  assert.ok(tiktok.includes("sessionid=httponlyval"));
  assert.ok(!tiktok.includes("ig-secret"));
  assert.ok(!tiktok.includes("other"));

  const instagram = cookieHeaderForHost(file, "i.instagram.com");
  assert.ok(instagram.includes("sessionid=ig-secret"));
  assert.ok(instagram.includes("csrftoken=ig-csrf"));
  assert.ok(!instagram.includes("ttwid"));
});

test("cookieHeaderForHost returns empty for missing file", () => {
  assert.equal(cookieHeaderForHost(path.join(dir, "nope.txt"), "x.com"), "");
});

test("cookieFilePathIfExists detects existing and missing files", () => {
  assert.equal(cookieFilePathIfExists(file), file);
  assert.equal(cookieFilePathIfExists(path.join(dir, "nope.txt")), null);
});
