import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  isSafeRedirectPath,
  rememberPostLoginRedirect,
  consumePostLoginRedirect,
} from "./post-login-redirect.ts";

class MemorySessionStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

beforeEach(() => {
  (globalThis as { sessionStorage?: unknown }).sessionStorage =
    new MemorySessionStorage();
});

test("isSafeRedirectPath accepts root-relative in-app paths", () => {
  assert.equal(isSafeRedirectPath("/pixies"), true);
  assert.equal(isSafeRedirectPath("/profile/mira?tab=posts"), true);
  assert.equal(isSafeRedirectPath("/"), true);
});

test("isSafeRedirectPath rejects off-site and auth-flow targets", () => {
  assert.equal(isSafeRedirectPath("//evil.com"), false);
  assert.equal(isSafeRedirectPath("https://evil.com"), false);
  assert.equal(isSafeRedirectPath("/\\evil.com"), false);
  assert.equal(isSafeRedirectPath("relative"), false);
  assert.equal(isSafeRedirectPath(null), false);
  assert.equal(isSafeRedirectPath("/login"), false);
  assert.equal(isSafeRedirectPath("/auth/callback"), false);
  assert.equal(isSafeRedirectPath("/register"), false);
});

test("remember then consume returns the stored path once", () => {
  rememberPostLoginRedirect("/pixies/abc123");
  assert.equal(consumePostLoginRedirect(), "/pixies/abc123");
  // Cleared after the first read.
  assert.equal(consumePostLoginRedirect(), null);
});

test("remember ignores auth-flow paths so the prior target survives", () => {
  rememberPostLoginRedirect("/arena/shop");
  rememberPostLoginRedirect("/login");
  assert.equal(consumePostLoginRedirect(), "/arena/shop");
});

test("full flow: the page before /login is the post-login target", () => {
  // Visiting /arena, then heading into the login flow.
  for (const [before, expected] of [
    ["/arena", "/arena"],
    ["/pixies", "/pixies"],
  ] as const) {
    (globalThis as { sessionStorage?: unknown }).sessionStorage =
      new MemorySessionStorage();
    rememberPostLoginRedirect(before); // App tracker on the real page
    rememberPostLoginRedirect("/login"); // tracker on /login (ignored)
    rememberPostLoginRedirect("/auth/callback"); // tracker on callback (ignored)
    assert.equal(consumePostLoginRedirect(), expected);
  }
});

test("consume returns null when nothing is stored", () => {
  assert.equal(consumePostLoginRedirect(), null);
});
