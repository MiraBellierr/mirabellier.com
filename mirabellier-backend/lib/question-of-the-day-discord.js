const http = require("http");
const https = require("https");

const DEFAULT_WEBSITE_BASE = "https://mirabellier.com";
const DEFAULT_WEBHOOK_USERNAME = "Mirabellier QOTD";
const CHECK_INTERVAL_MS = 60 * 1000;
const DISCORD_EMBED_COLOR = 16738740;

const { S2C } = require("./websocket-events");
const {
  createQuestionOfTheDayLiveStore,
  getCurrentRecordedDate,
} = require("./question-of-the-day-active");

let schedulerStarted = false;
let scheduledCheckTimer = null;
let inFlightNotificationCheck = null;

function getWebsiteBase() {
  return String(process.env.WEBSITE_BASE || DEFAULT_WEBSITE_BASE)
    .trim()
    .replace(/\/+$/, "");
}

function getDiscordWebhookUrl() {
  return String(process.env.QOTD_DISCORD_WEBHOOK_URL || "").trim();
}

function getDiscordWebhookUsername() {
  return String(
    process.env.QOTD_DISCORD_WEBHOOK_USERNAME || DEFAULT_WEBHOOK_USERNAME,
  ).trim();
}

function getDiscordWebhookAvatarUrl() {
  return String(process.env.QOTD_DISCORD_WEBHOOK_AVATAR_URL || "").trim();
}

function isDiscordWebhookEnabled() {
  return Boolean(getDiscordWebhookUrl());
}

function postJson(urlString, payload) {
  return new Promise((resolve, reject) => {
    const target = new URL(urlString);
    const body = JSON.stringify(payload);
    const transport = target.protocol === "http:" ? http : https;

    const req = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "http:" ? 80 : 443),
        method: "POST",
        path: `${target.pathname}${target.search}`,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let responseBody = "";

        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          responseBody += chunk;
        });
        res.on("end", () => {
          const statusCode = res.statusCode || 0;
          if (statusCode >= 200 && statusCode < 300) {
            resolve({ statusCode, body: responseBody });
            return;
          }

          reject(
            new Error(
              `Discord webhook request failed (${statusCode}): ${responseBody.slice(0, 300)}`,
            ),
          );
        });
      },
    );

    req.setTimeout(15000, () => {
      req.destroy(new Error("Discord webhook request timed out"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function buildQuestionPageUrl() {
  return `${getWebsiteBase()}/question-of-the-day`;
}

function buildWebhookPayload(question) {
  const questionUrl = buildQuestionPageUrl();
  // A carried question is re-dated to today, so the "carried" signal comes from
  // carriedFromRecordedDate rather than a date comparison; the original date is
  // deliberately not printed anymore.
  const footerText = question.carriedFromRecordedDate
    ? "Carried forward and now live"
    : "Fresh drop";
  const payload = {
    content: "A new Question of the Day just dropped.",
    allowed_mentions: {
      parse: [],
    },
    embeds: [
      {
        title: "New Question of the Day",
        url: questionUrl,
        description: question.prompt,
        color: DISCORD_EMBED_COLOR,
        fields: [
          {
            name: "Recorded date",
            value: question.recordedDate,
            inline: true,
          },
          {
            name: "Open",
            value: `[Answer on Mirabellier.com](${questionUrl})`,
            inline: true,
          },
        ],
        footer: {
          text: footerText,
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const username = getDiscordWebhookUsername();
  if (username) {
    payload.username = username;
  }

  const avatarUrl = getDiscordWebhookAvatarUrl();
  if (avatarUrl) {
    payload.avatar_url = avatarUrl;
  }

  return payload;
}

function createNotifier(db) {
  const markQuestionAsDiscordNotified = db.prepare(
    `UPDATE daily_questions
     SET discordNotifiedAt = COALESCE(discordNotifiedAt, ?)
     WHERE recordedDate = ?`,
  );

  // Shares the live store with the public/admin routes so "which question is
  // active right now" (and the carry-forward re-date that follows it) lives in
  // exactly one place instead of drifting between callers.
  const liveStore = createQuestionOfTheDayLiveStore(db);
  const getActiveQuestionRow = liveStore.getActiveQuestionRow;

  return {
    getActiveQuestionRow,
    markQuestionAsDiscordNotified,
  };
}

function maybeNotifyNewQuestionOfTheDayDrop(db, options = {}) {
  if (inFlightNotificationCheck) {
    return inFlightNotificationCheck;
  }

  inFlightNotificationCheck = Promise.resolve()
    .then(async () => {
      if (!isDiscordWebhookEnabled()) {
        return {
          skipped: true,
          reason: "QOTD_DISCORD_WEBHOOK_URL is not configured",
        };
      }

      const notifier = createNotifier(db);
      const currentRecordedDate = getCurrentRecordedDate(options.now);
      const activeQuestion = notifier.getActiveQuestionRow(currentRecordedDate);

      if (!activeQuestion) {
        return { skipped: true, reason: "no active question" };
      }

      if (activeQuestion.discordNotifiedAt) {
        return {
          skipped: true,
          reason: "already notified",
          recordedDate: activeQuestion.recordedDate,
        };
      }

      await postJson(
        getDiscordWebhookUrl(),
        buildWebhookPayload(activeQuestion),
      );

      const notifiedAt = new Date().toISOString();
      notifier.markQuestionAsDiscordNotified.run(
        notifiedAt,
        activeQuestion.recordedDate,
      );

      console.log(
        `[qotd-discord] Sent Discord notification for ${activeQuestion.recordedDate}`,
      );

      const ws = require("./websocket-server").getWebSocketManager();
      if (ws) ws.broadcast({ type: S2C.QOTD_NEW_DAY, data: { recordedDate: activeQuestion.recordedDate } });

      return {
        ok: true,
        recordedDate: activeQuestion.recordedDate,
        notifiedAt,
      };
    })
    .catch((error) => {
      const message =
        error instanceof Error ? error.message : "Unknown Discord webhook error";
      console.warn(`[qotd-discord] ${message}`);
      return { ok: false, error: message };
    })
    .finally(() => {
      inFlightNotificationCheck = null;
    });

  return inFlightNotificationCheck;
}

function scheduleNextCheck(db) {
  if (scheduledCheckTimer) {
    clearTimeout(scheduledCheckTimer);
  }

  scheduledCheckTimer = setTimeout(async () => {
    scheduledCheckTimer = null;
    scheduleNextCheck(db);
    await maybeNotifyNewQuestionOfTheDayDrop(db);
  }, CHECK_INTERVAL_MS);

  if (typeof scheduledCheckTimer.unref === "function") {
    scheduledCheckTimer.unref();
  }
}

function startQuestionOfTheDayDiscordScheduler(db) {
  if (schedulerStarted) {
    return;
  }

  schedulerStarted = true;
  scheduleNextCheck(db);
  void maybeNotifyNewQuestionOfTheDayDrop(db);
}

module.exports = {
  buildQuestionPageUrl,
  buildWebhookPayload,
  getDiscordWebhookUrl,
  isDiscordWebhookEnabled,
  maybeNotifyNewQuestionOfTheDayDrop,
  startQuestionOfTheDayDiscordScheduler,
  // Reused by lib/question-of-the-day-push.js and the public routes so the
  // "which question is active right now" logic (including the carry-forward
  // re-date) lives in exactly one place instead of drifting between callers.
  getCurrentRecordedDate,
  createNotifier,
};
