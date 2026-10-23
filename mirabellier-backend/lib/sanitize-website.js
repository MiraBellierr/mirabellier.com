"use strict";

// Shared URL sanitizers for user-supplied profile / guestbook fields that are
// later rendered as `href` or `src`. Anything that is not a plain http(s) URL
// (or, for media, a local `/images/...` path) collapses to `null` so the
// caller stores nothing rather than a `javascript:` / `data:` payload.

const MAX_URL_LENGTH = 200;

function collapseWhitespace(value) {
  return String(value == null ? "" : value)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

// A website users type into a profile / guestbook form. Bare hostnames are
// upgraded to https://. Returns a normalized absolute URL or null.
function sanitizeWebsite(value) {
  const trimmed = collapseWhitespace(value);
  if (!trimmed) return null;

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString().slice(0, MAX_URL_LENGTH);
  } catch {
    return null;
  }
}

// An avatar / banner reference. Allows a local upload path (`/images/...`) or an
// absolute https URL (Discord CDN, etc.). Everything else — http, protocol
// relative, `javascript:`, `data:`, bare strings — returns null so a caller can
// skip the write.
function sanitizeMediaUrl(value) {
  const trimmed = collapseWhitespace(value);
  if (!trimmed) return null;

  // Local, server-controlled upload path.
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed.slice(0, MAX_URL_LENGTH);
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return null;
    return url.toString().slice(0, MAX_URL_LENGTH);
  } catch {
    return null;
  }
}

module.exports = { sanitizeWebsite, sanitizeMediaUrl };
