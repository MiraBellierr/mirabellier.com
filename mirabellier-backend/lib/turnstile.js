const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;

class TurnstileError extends Error {
  constructor(status, message, code = "TURNSTILE_FAILED") {
    super(message);
    this.name = "TurnstileError";
    this.status = status;
    this.code = code;
  }
}

function getRequestIp(req) {
  const cloudflareIp = String(req.headers?.["cf-connecting-ip"] || "").trim();
  return cloudflareIp || req.ip || req.socket?.remoteAddress || undefined;
}

function getAllowedHostnames() {
  const configured = String(
    process.env.TURNSTILE_ALLOWED_HOSTNAMES ||
      "mirabellier.com,www.mirabellier.com,localhost,127.0.0.1",
  );
  return new Set(
    configured
      .split(",")
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isDevBypassEnabled() {
  // Explicit opt-in only. The safe state (verify for real) is the default even
  // when NODE_ENV drifts to "development" on a deployed process.
  return (
    String(process.env.TURNSTILE_DEV_BYPASS || "").trim().toLowerCase() ===
    "true"
  );
}

async function verifyTurnstileToken(req, token, expectedAction) {
  if (isDevBypassEnabled()) {
    return {
      success: true,
      action: expectedAction,
      hostname: "localhost",
      devBypass: true,
    };
  }

  const secret = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
  if (!secret) {
    throw new TurnstileError(
      503,
      "Human verification is temporarily unavailable.",
      "TURNSTILE_NOT_CONFIGURED",
    );
  }

  const responseToken = String(token || "").trim();
  if (!responseToken || responseToken.length > MAX_TOKEN_LENGTH) {
    throw new TurnstileError(
      400,
      "Please complete the human verification.",
      "TURNSTILE_TOKEN_REQUIRED",
    );
  }

  let response;
  try {
    response = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: responseToken,
        remoteip: getRequestIp(req),
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new TurnstileError(
      503,
      "Human verification could not be reached. Please try again.",
      "TURNSTILE_UNAVAILABLE",
    );
  }

  if (!response.ok) {
    throw new TurnstileError(
      503,
      "Human verification could not be completed. Please try again.",
      "TURNSTILE_UNAVAILABLE",
    );
  }

  const result = await response.json();
  if (!result?.success) {
    throw new TurnstileError(
      400,
      "Human verification expired or failed. Please try again.",
      "TURNSTILE_INVALID",
    );
  }

  if (expectedAction && result.action !== expectedAction) {
    throw new TurnstileError(
      400,
      "Human verification did not match this form. Please try again.",
      "TURNSTILE_ACTION_MISMATCH",
    );
  }

  const hostname = String(result.hostname || "").trim().toLowerCase();
  if (!hostname || !getAllowedHostnames().has(hostname)) {
    throw new TurnstileError(
      400,
      "Human verification came from an untrusted host.",
      "TURNSTILE_HOSTNAME_MISMATCH",
    );
  }

  return result;
}

module.exports = {
  TurnstileError,
  verifyTurnstileToken,
};
