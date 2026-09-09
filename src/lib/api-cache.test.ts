import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { swrJson, clearApiCache } from "./api-cache.ts";

type FetchCall = { url: string };
let calls: FetchCall[] = [];
let nextBody: () => unknown = () => ({ n: 1 });
let nextOk = true;
let nextStatus = 200;

const originalFetch = globalThis.fetch;

function installFetch() {
  globalThis.fetch = (async (input: unknown) => {
    calls.push({ url: String(input) });
    return {
      ok: nextOk,
      status: nextStatus,
      json: async () => nextBody(),
    } as unknown as Response;
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
  nextBody = () => ({ n: 1 });
  nextOk = true;
  nextStatus = 200;
  clearApiCache();
  installFetch();
});

const id = (j: unknown) => j as { n: number };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("second call within freshMs is served from cache with no fetch", async () => {
  const a = await swrJson("/x", id);
  const b = await swrJson("/x", id);
  assert.deepEqual(a, { n: 1 });
  assert.deepEqual(b, { n: 1 });
  assert.equal(calls.length, 1);
});

test("after freshMs, returns cached immediately and revalidates in the background", async () => {
  await swrJson("/x", id, { freshMs: 5 });
  await wait(20);
  nextBody = () => ({ n: 2 });

  const stale = await swrJson("/x", id, { freshMs: 5 });
  assert.deepEqual(stale, { n: 1 }, "serves the stale value right away");
  assert.equal(calls.length, 2, "kicked a background refresh");

  await wait(30); // let the background refresh settle into the cache
  const fresh = await swrJson("/x", id, { freshMs: 5, maxAgeMs: 60_000 });
  assert.deepEqual(fresh, { n: 2 }, "the refreshed value lands for next time");
});

test("concurrent misses for the same url share one fetch", async () => {
  const [a, b] = await Promise.all([swrJson("/y", id), swrJson("/y", id)]);
  assert.deepEqual(a, b);
  assert.equal(calls.length, 1);
});

test("a failed first fetch throws; a failed refresh keeps the stale value", async () => {
  clearApiCache();
  nextOk = false;
  nextStatus = 503;
  await assert.rejects(() => swrJson("/z", id), /Request failed \(503\)/);

  nextOk = true;
  nextBody = () => ({ n: 10 });
  assert.deepEqual(await swrJson("/z", id, { freshMs: 5 }), { n: 10 });

  await wait(15);
  nextOk = false; // refresh will fail
  const stillStale = await swrJson("/z", id, { freshMs: 5 });
  assert.deepEqual(stillStale, { n: 10 });
});

test("errorFrom customises the thrown error", async () => {
  nextOk = false;
  nextStatus = 418;
  await assert.rejects(
    () =>
      swrJson("/e", id, {
        errorFrom: (res) => new Error(`teapot ${res.status}`),
      }),
    /teapot 418/,
  );
});

test("clearApiCache forces the next call to refetch", async () => {
  await swrJson("/x", id);
  clearApiCache();
  await swrJson("/x", id);
  assert.equal(calls.length, 2);
});

test("cache is bounded (LRU eviction past the cap)", async () => {
  for (let i = 0; i < 130; i += 1) {
    await swrJson(`/n/${i}`, id);
  }
  calls = [];
  await swrJson("/n/0", id); // evicted -> must refetch
  await swrJson("/n/129", id); // still cached
  assert.equal(calls.length, 1);
});

test.after(() => {
  globalThis.fetch = originalFetch;
});
