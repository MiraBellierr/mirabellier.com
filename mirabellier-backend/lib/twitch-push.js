const {
  webpush,
  CONFIG_ERROR_CODE,
  readPushConfig: readConfig,
  hasPushConfig: hasConfig,
  createPushConfigError: createConfigError,
  ensureVapidDetails,
} = require("./push-config");

function buildLiveNotificationPayload(input) {
  return JSON.stringify({
    title: `${input.displayName} is live on Twitch`,
    body: input.gameName ? `playing ${input.gameName}` : "streaming right now",
    url: "https://mirabellier.com/twitch",
    login: input.login,
  });
}

async function sendLiveNotification(db, channelLogin, displayName, stream) {
  const config = readConfig();
  if (!hasConfig(config)) {
    return { ok: false, sent: 0, removed: 0, error: "not-configured" };
  }

  ensureVapidDetails(config);

  const subscriptions = db
    .prepare("SELECT * FROM twitch_push_subscriptions WHERE channelLogin = ?")
    .all(channelLogin);

  const payload = buildLiveNotificationPayload({
    login: channelLogin,
    displayName,
    gameName: stream?.gameName || "",
  });

  let sent = 0;
  let removed = 0;

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        payload,
      );
      sent += 1;
    } catch (error) {
      const statusCode = Number(error?.statusCode);
      if (statusCode === 404 || statusCode === 410) {
        db.prepare("DELETE FROM twitch_push_subscriptions WHERE id = ?").run(
          subscription.id,
        );
        removed += 1;
      }
    }
  }

  return { ok: true, sent, removed };
}

module.exports = {
  CONFIG_ERROR_CODE,
  buildLiveNotificationPayload,
  createConfigError,
  hasConfig,
  readConfig,
  sendLiveNotification,
};
