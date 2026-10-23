// Server-side record that a user cleared Cloudflare Turnstile before fighting.
//
// Kept in memory (same trade-off as arena-fight-guard.js): a process restart
// just forces the player to re-verify, and it is not shared across instances.
// The window slides on every successful check so an actively-playing session
// (auto-battle can chain many fights) is never interrupted mid-run.

const VERIFICATION_TTL_MS = 30 * 60_000; // 30 minutes

const verifiedUntilByUser = new Map();

function pruneVerifications(now) {
  verifiedUntilByUser.forEach((expiresAt, key) => {
    if (expiresAt <= now) verifiedUntilByUser.delete(key);
  });
}

function markArenaFightVerified(userId, now = Date.now()) {
  const key = String(userId || "");
  if (!key) return;
  pruneVerifications(now);
  verifiedUntilByUser.set(key, now + VERIFICATION_TTL_MS);
}

function isArenaFightVerified(userId, now = Date.now()) {
  const key = String(userId || "");
  if (!key) return false;
  const expiresAt = verifiedUntilByUser.get(key);
  if (!expiresAt || expiresAt <= now) {
    if (expiresAt) verifiedUntilByUser.delete(key);
    return false;
  }
  // Sliding expiry: keep an engaged player verified for the whole session.
  verifiedUntilByUser.set(key, now + VERIFICATION_TTL_MS);
  return true;
}

function clearArenaFightVerification(userId) {
  verifiedUntilByUser.delete(String(userId || ""));
}

function resetArenaFightVerifications() {
  verifiedUntilByUser.clear();
}

module.exports = {
  VERIFICATION_TTL_MS,
  markArenaFightVerified,
  isArenaFightVerified,
  clearArenaFightVerification,
  resetArenaFightVerifications,
};
