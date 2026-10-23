const { ArenaHttpError } = require("../../lib/arena/utils");
const { TurnstileError } = require("../../lib/turnstile");
const { isArenaFightVerified } = require("../../lib/arena-fight-verification");

const VERIFICATION_REQUIRED_CODE = "ARENA_VERIFICATION_REQUIRED";
const VERIFICATION_REQUIRED_MESSAGE =
  "Complete human verification before fighting.";

function setNoStoreHeaders(res) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

function requireAuthUser(req, authFromReq) {
  const user = authFromReq(req);
  if (!user) {
    throw new ArenaHttpError(401, "Authentication required.", "ARENA_UNAUTHENTICATED");
  }
  return user;
}

// Every fight entry point (HTTP and WebSocket) must confirm the user cleared
// Turnstile via POST /arena/verify first. Without this the gate is client-only.
function requireArenaFightVerified(userId) {
  if (!isArenaFightVerified(userId)) {
    throw new ArenaHttpError(
      403,
      VERIFICATION_REQUIRED_MESSAGE,
      VERIFICATION_REQUIRED_CODE,
    );
  }
}

function handleArenaError(error, res) {
  if (error instanceof TurnstileError) {
    setNoStoreHeaders(res);
    return res.status(error.status).json({
      code: error.code,
      error: error.message,
    });
  }

  if (error instanceof ArenaHttpError) {
    setNoStoreHeaders(res);
    return res.status(error.status).json({
      code: error.code,
      error: error.message,
      ...error.details,
    });
  }

  if (error && typeof error === "object" && error.code === "MAL_POOL_EMPTY") {
    setNoStoreHeaders(res);
    return res.status(503).json({
      code: "MAL_POOL_EMPTY",
      error:
        "Arena card pool is currently unavailable. Please try again in a moment.",
    });
  }

  setNoStoreHeaders(res);
  return res.status(500).json({
    code: "ARENA_FAILED",
    error: "Arena request failed.",
  });
}

module.exports = {
  handleArenaError,
  requireAuthUser,
  requireArenaFightVerified,
  setNoStoreHeaders,
  VERIFICATION_REQUIRED_CODE,
  VERIFICATION_REQUIRED_MESSAGE,
};
