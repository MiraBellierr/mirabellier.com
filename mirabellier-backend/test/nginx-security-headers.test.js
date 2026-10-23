const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const helmet = require("helmet");

// The audit (improve.md item 6) found HSTS, X-Content-Type-Options, and
// Referrer-Policy absent from every nginx-served response. The backend sends
// all three via helmet (app.js), but nginx serves the homepage, prerendered
// heads, static assets, and the 404 document itself — those had none.
//
// The fix mirrors helmet's values in the nginx config. These tests pin that
// mirror in both directions: the values must equal what helmet produces on the
// proxied routes (so one origin's header set never disagrees with the other's),
// and every location that declares its own add_header must repeat them (nginx
// does not merge inherited add_header directives).
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

// The header values helmet emits with no options, which is how app.js
// configures hsts, referrerPolicy, and xContentTypeOptions. If helmet ever
// changes a default, the nginx mirror has to change with it — deriving the
// expected values here is what makes that a test failure instead of a silent
// divergence between the two response paths.
function helmetHeaderValue(middleware) {
  const res = {
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
    },
    removeHeader() {},
  };
  middleware({ method: "GET", headers: {} }, res, () => {});
  return Object.values(res.headers)[0];
}

const EXPECTED = {
  hsts: helmetHeaderValue(helmet.strictTransportSecurity()),
  nosniff: helmetHeaderValue(helmet.noSniff()),
  referrerPolicy: helmetHeaderValue(helmet.referrerPolicy()),
};

const SECURITY_HEADERS = [
  { name: "Strict-Transport-Security", value: EXPECTED.hsts },
  { name: "X-Content-Type-Options", value: EXPECTED.nosniff },
  { name: "Referrer-Policy", value: EXPECTED.referrerPolicy },
];

function addHeaderLines(body) {
  return [
    ...body.matchAll(
      /^\s*add_header\s+(\S+)\s+"([^"]*)"(\s+always)?;/gm,
    ),
  ].map((match) => ({
    name: match[1],
    value: match[2],
    always: Boolean(match[3]),
  }));
}

// Every `location { ... }` body, brace-matched, with its opening line.
function locationBodies(conf) {
  const locations = [];
  const marker = /^\s*location\s+([^{]*)\{/gm;
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
    locations.push({
      selector: match[1].trim(),
      body: conf.slice(marker.lastIndex, index - 1),
    });
  }

  return locations;
}

test("the expected header values match helmet's defaults", () => {
  // Pinned literals so a helmet default change is loud in the diff, and so the
  // test still documents the deployed policy if the dependency changes shape.
  assert.equal(EXPECTED.hsts, "max-age=31536000; includeSubDomains");
  assert.equal(EXPECTED.nosniff, "nosniff");
  assert.equal(EXPECTED.referrerPolicy, "no-referrer");
});

for (const host of ["mirabellier.com", "www.mirabellier.com", "api.mirabellier.com"]) {
  test(`the ${host} server block sets all three security headers`, () => {
    const block = blockNamed(readConf(), host);
    assert.ok(block, `${host} must have its own server block`);

    for (const { name, value } of SECURITY_HEADERS) {
      assert.match(
        block.body,
        new RegExp(`^\\s*add_header\\s+${name}\\s+"${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s+always;`, "m"),
        `${host} must send ${name}: ${value}`,
      );
    }
  });
}

// Without `always`, nginx omits add_header on 4xx/5xx responses, so the 404
// document (and nginx's own 50x page) would miss HSTS exactly when a browser
// is deciding whether to upgrade. It also drops the headers on the www 301.
test("security headers are sent on non-2xx responses too", () => {
  const conf = readConf();
  for (const block of serverBlocks(conf)) {
    for (const header of addHeaderLines(block.body)) {
      if (SECURITY_HEADERS.some(({ name }) => name === header.name)) {
        assert.equal(
          header.always,
          true,
          `${header.name} must use the "always" flag`,
        );
      }
    }
  }
});

// nginx's add_header never merges with a parent's: a location that declares
// any add_header drops every inherited one. So every location with its own
// Cache-Control has to repeat the set, or that response path loses them.
test("locations with their own add_header repeat the security headers", () => {
  const conf = readConf();
  const locations = locationBodies(conf);
  const cacheLocations = locations.filter((location) =>
    addHeaderLines(location.body).some(({ name }) => name === "Cache-Control"),
  );

  assert.ok(
    cacheLocations.length >= 5,
    `expected several Cache-Control locations, got ${cacheLocations.length}`,
  );

  for (const location of cacheLocations) {
    const names = addHeaderLines(location.body).map(({ name }) => name);
    for (const { name } of SECURITY_HEADERS) {
      assert.ok(
        names.includes(name),
        `location ${location.selector} sets Cache-Control but drops ${name}`,
      );
    }
  }
});

// The proxied routes get all three from the backend's helmet as well. Hiding
// the upstream copies keeps the field sent exactly once (RFC 6797 says a
// response MUST NOT carry more than one Strict-Transport-Security field), so
// the nginx copy above is the only one a client sees.
test("proxied locations hide the upstream copy to avoid duplicates", () => {
  const conf = readConf();
  const apex = blockNamed(conf, "mirabellier.com");
  const api = blockNamed(conf, "api.mirabellier.com");

  for (const block of [apex, api]) {
    for (const { name } of SECURITY_HEADERS) {
      assert.match(
        block.body,
        new RegExp(`^\\s*proxy_hide_header\\s+${name};`, "m"),
        `the proxied block must hide the upstream ${name}`,
      );
    }
  }
});

// The values must match what the backend actually emits, not just helmet's
// documented defaults. A local run of the app against the proxy path is not
// part of this file; the indexable-hosts tests cover the app itself.
test("the www redirect carries the policy for visitors who land there first", () => {
  const www = blockNamed(readConf(), "www.mirabellier.com");
  assert.match(
    www.body,
    /add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;/,
    "the redirect response must set HSTS before the apex is ever reached",
  );
});
