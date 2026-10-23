"use strict";

// Shared Web Push (VAPID) config + client, used by every push feature
// (Twitch live notifications, and the generic topic subscriptions in
// push-subscriptions.js). One VAPID keypair for the whole site — the public
// key is the same regardless of what a subscriber is notified about.

const webpush = require("web-push");

const CONFIG_ERROR_CODE = "PUSH_CONFIG_MISSING";

let vapidInitialized = false;

function readPushConfig() {
  return {
    publicKey: String(process.env.VAPID_PUBLIC_KEY || "").trim(),
    privateKey: String(process.env.VAPID_PRIVATE_KEY || "").trim(),
    subject:
      String(process.env.VAPID_SUBJECT || "mailto:admin@mirabellier.com").trim(),
  };
}

function hasPushConfig(config) {
  return Boolean(config.publicKey && config.privateKey);
}

function createPushConfigError() {
  const error = new Error(
    "Web Push config missing. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in mirabellier-backend/.env.",
  );
  error.code = CONFIG_ERROR_CODE;
  return error;
}

function ensureVapidDetails(config) {
  if (!vapidInitialized) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    vapidInitialized = true;
  }
}

module.exports = {
  webpush,
  CONFIG_ERROR_CODE,
  readPushConfig,
  hasPushConfig,
  createPushConfigError,
  ensureVapidDetails,
};
