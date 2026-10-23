const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// `www.mirabellier.com` resolves straight to this VPS (it is not behind
// Cloudflare, unlike the apex), so nginx is the only place that can fold it
// into the canonical host. It used to share the main server block's
// `server_name`, which meant every www URL answered a full 200 duplicate of
// the site on a second hostname. The fix is a dedicated block that 301s to the
// apex, plus dropping www from the main block so that block stops winning the
// server_name match.
const CONF_PATH = path.join(
  __dirname,
  "..",
  "deploy",
  "nginx",
  "mirabellier.com.conf",
);

function readConf() {
  return fs.readFileSync(CONF_PATH, "utf8");
}

// Return the body of every top-level `server { ... }` block (brace-matched so
// nested `location` blocks do not terminate it early).
function serverBlocks(conf) {
  const blocks = [];
  const marker = /\bserver\s*\{/g;
  let match;

  while ((match = marker.exec(conf))) {
    let depth = 1;
    let index = marker.lastIndex;
    while (index < conf.length && depth > 0) {
      const char = conf[index];
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      index += 1;
    }
    blocks.push({
      body: conf.slice(marker.lastIndex, index - 1),
      start: match.index,
    });
  }

  return blocks;
}

function blockNamed(conf, host) {
  const pattern = new RegExp(
    `^\\s*server_name\\s+${host.replace(/\./g, "\\.")}\\s*;`,
    "m",
  );
  return serverBlocks(conf).find((block) => pattern.test(block.body));
}

test("the main server block no longer claims the www host", () => {
  const main = blockNamed(readConf(), "mirabellier.com");
  assert.ok(main, "the apex server block must exist");
  const serverName = main.body.match(/^\s*server_name\s+([^;]+);/m);
  assert.ok(serverName, "the apex block must declare server_name");
  assert.doesNotMatch(
    serverName[1],
    /www\.mirabellier\.com/,
    "www must not be listed on the apex block, or it wins the match again",
  );
});

test("a dedicated www block redirects to the apex", () => {
  const conf = readConf();
  const www = blockNamed(conf, "www.mirabellier.com");
  assert.ok(www, "the www redirect block must exist");
  assert.match(
    www.body,
    /return 301 https:\/\/mirabellier\.com\$request_uri;/,
    "www must 301 to the apex and preserve the path + query",
  );
});

// `$request_uri` is the raw original request line; `$uri` is normalized and
// decoded, which would corrupt encoded paths and double-encode others.
test("the redirect preserves the original request URI", () => {
  const www = blockNamed(readConf(), "www.mirabellier.com");
  assert.doesNotMatch(
    www.body,
    /return 301 https:\/\/mirabellier\.com\$uri/,
    "use $request_uri, not $uri",
  );
});

test("the www block serves no content of its own", () => {
  const www = blockNamed(readConf(), "www.mirabellier.com");
  assert.doesNotMatch(
    www.body,
    /^\s*root\s/m,
    "the www block must not have a root; it only redirects",
  );
  assert.doesNotMatch(
    www.body,
    /^\s*location\s/m,
    "the www block must not declare locations; it only redirects",
  );
});

// Without a certificate covering the www hostname the redirect cannot complete
// over HTTPS: the handshake fails before the 301 is ever sent. The single
// mirabellier.com certificate already carries a www SAN, so both blocks point
// at the same files.
test("the www block reuses the apex certificate", () => {
  const conf = readConf();
  const apex = blockNamed(conf, "mirabellier.com");
  const www = blockNamed(conf, "www.mirabellier.com");

  const certOf = (block) =>
    block.body.match(/^\s*ssl_certificate\s+(\S+);/m)?.[1];
  const keyOf = (block) =>
    block.body.match(/^\s*ssl_certificate_key\s+(\S+);/m)?.[1];

  assert.ok(certOf(www), "the www block must load a certificate");
  assert.equal(certOf(www), certOf(apex));
  assert.equal(keyOf(www), keyOf(apex));
  assert.match(certOf(www), /live\/mirabellier\.com\//);
});

// A port-80 www block is intentionally absent: http://www currently hits the
// distro default site, and how certbot serves its HTTP-01 challenge is not
// visible from this repo. A blind catch-all on port 80 could break renewals.
test("no port-80 www listener was added (documented tradeoff)", () => {
  const conf = readConf();
  const www = blockNamed(conf, "www.mirabellier.com");
  assert.doesNotMatch(
    www.body,
    /listen\s+80/,
    "port 80 stays untouched until the certbot renewal path is confirmed",
  );
});

