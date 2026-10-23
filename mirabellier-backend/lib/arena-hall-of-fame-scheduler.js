const { snapshotAndResetElo } = require("./arena/hall-of-fame");

const MAX_TIMEOUT_MS = 2_147_483_647;

let schedulerStarted = false;
let scheduledTimer = null;

function getNextFirstOfMonthTime() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return next.getTime();
}

function scheduleNextCheck(db, targetTime = getNextFirstOfMonthTime()) {
  if (scheduledTimer) {
    clearTimeout(scheduledTimer);
  }

  const delay = Math.max(0, targetTime - Date.now());
  const timeoutMs = Math.min(delay, MAX_TIMEOUT_MS);

  scheduledTimer = setTimeout(() => {
    scheduledTimer = null;
    if (Date.now() < targetTime) {
      scheduleNextCheck(db, targetTime);
      return;
    }

    snapshotAndResetElo(db);
    scheduleNextCheck(db);
  }, timeoutMs);

  if (typeof scheduledTimer.unref === "function") {
    scheduledTimer.unref();
  }
}

function startHallOfFameScheduler(db) {
  if (schedulerStarted) {
    return;
  }

  schedulerStarted = true;
  scheduleNextCheck(db);
}

module.exports = { startHallOfFameScheduler };
