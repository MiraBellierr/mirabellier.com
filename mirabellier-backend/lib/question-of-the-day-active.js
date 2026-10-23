"use strict";

// Question of the Day live-date semantics.
//
// `daily_questions.recordedDate` is the queue slot AND the day a question is
// presented and archived under. Answers are keyed by it, the archive resolves
// `/question-of-the-day/archive/<recordedDate>`, and the sitemap, feeds, and
// search index all derive their URLs from it.
//
// A question stays live until it receives an answer. When the UTC day ends with
// the active question still unanswered, the *question* is carried to the
// current day: its row is re-dated to today and every question queued behind it
// shifts forward by the same number of days, preserving the queue order and the
// one-question-per-day spacing. The date itself is never carried along — the
// question simply becomes today's question.
//
// That keeps every consumer correct without a parallel "effective date": by the
// time anything reads the row, `recordedDate` already *is* the day the question
// is displayed and archived under. `carriedFromRecordedDate` remembers the slot
// the question originally came from so the UI can still say it is still waiting
// for its first answer without printing the old date.

function getCurrentRecordedDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function addDaysToRecordedDate(recordedDate, days) {
  const [year, month, day] = String(recordedDate)
    .split("-")
    .map((value) => Number(value));

  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function daysBetweenRecordedDates(fromRecordedDate, toRecordedDate) {
  const from = Date.parse(`${fromRecordedDate}T00:00:00Z`);
  const to = Date.parse(`${toRecordedDate}T00:00:00Z`);

  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return 0;
  }

  return Math.round((to - from) / 86400000);
}

/**
 * Owns "which question is live today" and the carry-forward re-date.
 *
 * `getActiveQuestionRow(currentRecordedDate)` is the write-through entry point
 * (public page, answers, admin, notifiers, boot): it returns the question that
 * should be live today after moving an unanswered one forward.
 * `findActiveQuestionRow` is the read-only lookup for callers that must not
 * mutate (diagnostics, tests).
 */
function createQuestionOfTheDayLiveStore(db) {
  // The active question is the earliest unarchived day at or before today that
  // is either unanswered or was locked today — a question answered earlier
  // stays on the live page for the rest of the UTC day.
  const selectActiveQuestion = db.prepare(
    `SELECT
       q.recordedDate,
       q.prompt,
       q.lockedAt,
       q.archivedAt,
       q.carriedFromRecordedDate,
       q.discordNotifiedAt,
       q.pushNotifiedAt,
       q.createdAt,
       q.updatedAt
     FROM daily_questions q
     LEFT JOIN daily_question_answers a ON a.recordedDate = q.recordedDate
     WHERE q.recordedDate <= ? AND q.archivedAt IS NULL
     GROUP BY q.recordedDate, q.prompt, q.lockedAt, q.archivedAt,
              q.carriedFromRecordedDate, q.discordNotifiedAt, q.pushNotifiedAt,
              q.createdAt, q.updatedAt
     HAVING COUNT(a.id) = 0 OR substr(q.lockedAt, 1, 10) = ?
     ORDER BY q.recordedDate ASC
     LIMIT 1`,
  );
  const selectQuestionByRecordedDate = db.prepare(
    `SELECT recordedDate, prompt, lockedAt, archivedAt, carriedFromRecordedDate,
            discordNotifiedAt, pushNotifiedAt, createdAt, updatedAt
     FROM daily_questions
     WHERE recordedDate = ?`,
  );
  const selectAnswerCountByRecordedDate = db.prepare(
    `SELECT COUNT(*) AS answerCount
     FROM daily_question_answers
     WHERE recordedDate = ?`,
  );
  const selectLaterRecordedDates = db.prepare(
    `SELECT recordedDate
     FROM daily_questions
     WHERE recordedDate > ?
     ORDER BY recordedDate DESC`,
  );
  const updateAnswerRecordedDate = db.prepare(
    `UPDATE daily_question_answers
     SET recordedDate = ?
     WHERE recordedDate = ?`,
  );
  const updateQuestionRecordedDate = db.prepare(
    `UPDATE daily_questions
     SET recordedDate = ?
     WHERE recordedDate = ?`,
  );
  const reDateActiveQuestion = db.prepare(
    `UPDATE daily_questions
     SET recordedDate = ?,
         updatedAt = ?,
         carriedFromRecordedDate = COALESCE(carriedFromRecordedDate, ?)
     WHERE recordedDate = ? AND archivedAt IS NULL`,
  );

  // Move every row after the active question in descending date order so each
  // destination slot is freed before it is reused (`recordedDate` is the
  // primary key, so ascending would collide with the row that has not moved
  // yet). Answers move with their question so `/archive/<date>`, the answer
  // rows, and the search index stay aligned.
  const carryForwardTransaction = db.transaction(
    ({ fromRecordedDate, toRecordedDate, now }) => {
      // Re-verify inside the transaction: a caller that raced past the
      // pre-check must not shift the queue twice.
      const question = selectQuestionByRecordedDate.get(fromRecordedDate);
      if (
        !question ||
        question.archivedAt ||
        question.recordedDate >= toRecordedDate
      ) {
        return false;
      }

      const dayDelta = daysBetweenRecordedDates(
        fromRecordedDate,
        toRecordedDate,
      );
      if (dayDelta <= 0) {
        return false;
      }

      for (const row of selectLaterRecordedDates.all(fromRecordedDate)) {
        const nextRecordedDate = addDaysToRecordedDate(
          row.recordedDate,
          dayDelta,
        );
        updateAnswerRecordedDate.run(nextRecordedDate, row.recordedDate);
        updateQuestionRecordedDate.run(nextRecordedDate, row.recordedDate);
      }

      reDateActiveQuestion.run(
        toRecordedDate,
        now,
        fromRecordedDate,
        fromRecordedDate,
      );

      return true;
    },
  );

  function findActiveQuestionRow(currentRecordedDate) {
    const todaysQuestion = selectQuestionByRecordedDate.get(currentRecordedDate);

    return (
      selectActiveQuestion.get(currentRecordedDate, currentRecordedDate) ||
      (todaysQuestion && !todaysQuestion.archivedAt ? todaysQuestion : null)
    );
  }

  function carryForwardActiveQuestion(currentRecordedDate) {
    const activeQuestion = findActiveQuestionRow(currentRecordedDate);

    if (!activeQuestion || activeQuestion.recordedDate >= currentRecordedDate) {
      return activeQuestion;
    }

    // A question with answers keeps its recordedDate: that is where its
    // answers and `/archive/<date>` live, and it can only still be active
    // because it was locked today, so there is nothing to carry.
    const answerCount = Number(
      selectAnswerCountByRecordedDate.get(activeQuestion.recordedDate)
        ?.answerCount,
    );

    if (Number.isFinite(answerCount) && answerCount > 0) {
      return activeQuestion;
    }

    try {
      carryForwardTransaction({
        fromRecordedDate: activeQuestion.recordedDate,
        toRecordedDate: currentRecordedDate,
        now: new Date().toISOString(),
      });
    } catch (error) {
      // A failed carry leaves the question on its old date (previous
      // behaviour) rather than taking the live page down; the next pass
      // retries.
      console.warn(
        `[qotd] Failed to carry ${activeQuestion.recordedDate} forward to ${currentRecordedDate}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      return activeQuestion;
    }

    return findActiveQuestionRow(currentRecordedDate) || activeQuestion;
  }

  return {
    findActiveQuestionRow,
    getActiveQuestionRow(
      currentRecordedDate = getCurrentRecordedDate(),
    ) {
      return carryForwardActiveQuestion(currentRecordedDate);
    },
  };
}

module.exports = {
  addDaysToRecordedDate,
  createQuestionOfTheDayLiveStore,
  daysBetweenRecordedDates,
  getCurrentRecordedDate,
};
