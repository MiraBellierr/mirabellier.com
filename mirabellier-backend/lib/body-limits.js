const bodyParser = require("body-parser");

// Body-size caps for the JSON API.
//
// Most routes take small payloads and stay on the app-wide default, which keeps
// the "buffer a gigabyte per POST" DoS surface away. Blog save does not fit
// that bucket: a rich-text post carries its whole document inline, and any
// image that reached the editor as a data URL (pasted screenshot, legacy
// content) inflates it further — 1mb of image becomes ~1.37mb of base64 before
// any of the text. At the default cap a post with two screenshots fails to save
// with a bare 413 and no useful explanation.
//
// So the two post-save routes get their own parser with a higher cap. The
// dispatcher replaces the former app-wide `bodyParser.json`, so this is the only
// JSON parser on every request — exactly one size check, no double parse.
//
// The larger cap is only handed to an authenticated caller. Auth needs no body
// (bearer token or session cookie), so checking before the body is read means an
// anonymous request can never make the process buffer 25mb it would reject
// anyway; it gets the same 401 the route would have produced. Route handlers
// still enforce ownership — this is purely a pre-buffer gate.
const DEFAULT_JSON_LIMIT = "2mb";
// ~2mb of base64 per inline screenshot at the editor's 5mb file cap, several of
// them, plus text and mark structure. 25mb still rejects a runaway body while
// covering any post a person could realistically write.
const LARGE_JSON_LIMIT = "25mb";

// `/posts` (create) and `/posts/<id>` (edit) only. Comments/likes nest deeper
// (`/posts/:id/comments`) and carry tiny bodies, so they keep the default cap.
const POST_SAVE_PATH = /^\/posts(?:\/[^/]+)?$/;

// `normalizeApiPrefixMiddleware` strips `/v1` before this runs, so the path here
// is the route path. Trailing slashes are normalized away.
function needsLargeJsonLimit(method, url) {
  if (method !== "POST" && method !== "PUT") return false;
  const path = String(url || "").split("?")[0].replace(/\/+$/, "") || "/";
  return POST_SAVE_PATH.test(path);
}

function createJsonBodyParser({ authFromReq }) {
  const defaultJson = bodyParser.json({ limit: DEFAULT_JSON_LIMIT });
  const largeJson = bodyParser.json({ limit: LARGE_JSON_LIMIT });

  return function jsonBodyParser(req, res, next) {
    if (!needsLargeJsonLimit(req.method, req.url)) {
      defaultJson(req, res, next);
      return;
    }

    if (!authFromReq(req)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    largeJson(req, res, next);
  };
}

module.exports = {
  DEFAULT_JSON_LIMIT,
  LARGE_JSON_LIMIT,
  needsLargeJsonLimit,
  createJsonBodyParser,
};
