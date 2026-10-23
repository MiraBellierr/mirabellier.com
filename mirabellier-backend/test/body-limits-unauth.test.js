const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const express = require("express");
const bodyParser = require("body-parser");

const { createJsonBodyParser } = require("../lib/body-limits");

// A large unauthenticated body is refused before it is buffered. The client
// must still receive the 401 (not a socket reset): the server drains the rest
// of the upload without keeping it. This exercises that path with a body well
// over the default cap.
test("unauthenticated large post save gets 401 without a connection error", async () => {
  const app = express();
  app.use(createJsonBodyParser({ authFromReq: () => null }));
  app.post("/posts", (_req, res) => res.status(500).json({ error: "should not run" }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const payload = JSON.stringify({ title: "x", content: "y".repeat(3 * 1024 * 1024) });

    const result = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          path: "/posts",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () =>
            resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }),
          );
        },
      );
      req.on("error", reject);
      req.end(payload);
    });

    assert.equal(result.status, 401);
    assert.match(result.body, /unauthorized/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
