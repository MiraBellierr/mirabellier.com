"use strict";

// Local dev-server origins that must NOT be trusted in production. A page served
// from one of these on a victim's machine could otherwise make credentialed
// calls to the deployed API. They are only added to the CORS / Socket.IO
// allowlists (and only accepted by resolveFrontendOrigin) when
// ALLOW_DEV_ORIGINS is explicitly set to "true".
const DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

function devOriginsEnabled() {
  return (
    String(process.env.ALLOW_DEV_ORIGINS || "").trim().toLowerCase() === "true"
  );
}

module.exports = { DEV_ORIGINS, devOriginsEnabled };
