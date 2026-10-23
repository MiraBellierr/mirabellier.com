"use strict";

// Push-notification sibling to question-of-the-day-discord.js: same
// "which question is active right now" detection (reused directly from that
// module, including its carried-forward-question fallback), same reactive +
// polled trigger shape, but its own `pushNotifiedAt` gate column so it works
// whether or not the Discord webhook is configured, and doesn't touch that
// module's working code at all.

const {
  getCurrentRecordedDate,
  createNotifier,
  buildQuestionPageUrl,
} = require("./question-of-the-day-discord");
const { sendToTopic, TOPIC_NEW_QOTD } = require("./push-subscriptions");

const CHECK_INTERVAL_MS = 60 * 1000;

let schedulerStarted = false;
let scheduledCheckTimer = null;
let inFlightCheck = null;

function markQuestionAsPushNotified(db, recordedDate) {
  db.prepare(
    `UPDATE daily_questions
     SET pushNotifiedAt = COALESCE(pushNotifiedAt, ?)
     WHERE recordedDate = ?`,
  ).run(new Date().toISOString(), recordedDate);
}

function maybeNotifyNewQuestionOfTheDayPush(db, options = {}) {
  if (inFlightCheck) {
    return inFlightCheck;
  }

  inFlightCheck = Promise.resolve()
    .then(async () => {
      const notifier = createNotifier(db);
      const currentRecordedDate = getCurrentRecordedDate(options.now);
      const activeQuestion = notifier.getActiveQuestionRow(currentRecordedDate);

      if (!activeQuestion) {
        return { skipped: true, reason: "no active question" };
      }
      if (activeQuestion.pushNotifiedAt) {
        return {
          skipped: true,
          reason: "already notified",
          recordedDate: activeQuestion.recordedDate,
        };
      }

      const result = await sendToTopic(db, TOPIC_NEW_QOTD, {
        title: "New Question of the Day",
        body: activeQuestion.prompt,
        url: buildQuestionPageUrl(),
      });

      if (result.ok) {
        markQuestionAsPushNotified(db, activeQuestion.recordedDate);
      }

      return { ...result, recordedDate: activeQuestion.recordedDate };
    })
    .catch((error) => {
      const message =
        error instanceof Error ? error.message : "Unknown QOTD push error";
      console.warn(`[qotd-push] ${message}`);
      return { ok: false, error: message };
    })
    .finally(() => {
      inFlightCheck = null;
    });

  return inFlightCheck;
}

function scheduleNextCheck(db) {
  if (scheduledCheckTimer) {
    clearTimeout(scheduledCheckTimer);
  }

  scheduledCheckTimer = setTimeout(async () => {
    scheduledCheckTimer = null;
    scheduleNextCheck(db);
    await maybeNotifyNewQuestionOfTheDayPush(db);
  }, CHECK_INTERVAL_MS);

  if (typeof scheduledCheckTimer.unref === "function") {
    scheduledCheckTimer.unref();
  }
}

// Catches the date-rollover case nothing else triggers (a pre-queued
// question becoming "today's" with no admin/answer action to react to).
function startQuestionOfTheDayPushScheduler(db) {
  if (schedulerStarted) {
    return;
  }

  schedulerStarted = true;
  scheduleNextCheck(db);
  void maybeNotifyNewQuestionOfTheDayPush(db);
}

module.exports = {
  maybeNotifyNewQuestionOfTheDayPush,
  startQuestionOfTheDayPushScheduler,
};
