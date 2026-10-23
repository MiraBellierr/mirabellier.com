"use strict";

// Sitewide counts for the public /stats page — posts, guestbook signatures
// (+ mood breakdown), QOTD questions/answers, Arena fights, Pixies, and
// accounts, plus how long the site has had content on it. Every query is a
// single `COUNT(*)`/`GROUP BY` over an already-indexed or tiny table, so
// nothing here needs caching at personal-site scale.

function count(db, sql) {
  return db.prepare(sql).get().c;
}

function getGuestbookMoodBreakdown(db) {
  const rows = db
    .prepare(
      `SELECT mood, COUNT(*) AS count FROM guestbook_entries
       GROUP BY mood ORDER BY count DESC, mood ASC`,
    )
    .all();
  return rows.map((row) => ({ mood: row.mood, count: row.count }));
}

// Earliest of any user-generated content's createdAt — a proxy for "when
// the site actually started having a life on it" rather than a hardcoded
// launch date that would drift out of sync with reality.
function getSiteSinceDate(db) {
  const dates = [
    "SELECT MIN(createdAt) AS d FROM posts",
    "SELECT MIN(createdAt) AS d FROM guestbook_entries",
    "SELECT MIN(createdAt) AS d FROM daily_questions",
  ]
    .map((sql) => db.prepare(sql).get().d)
    .filter(Boolean);
  if (dates.length === 0) return null;
  return dates.sort()[0];
}

function getSiteStats(db) {
  const guestbookMoods = getGuestbookMoodBreakdown(db);

  return {
    postsCount: count(db, "SELECT COUNT(*) AS c FROM posts"),
    guestbookCount: count(db, "SELECT COUNT(*) AS c FROM guestbook_entries"),
    guestbookMoods,
    topGuestbookMood: guestbookMoods[0]?.mood || null,
    qotdQuestionsCount: count(db, "SELECT COUNT(*) AS c FROM daily_questions"),
    qotdAnswersCount: count(db, "SELECT COUNT(*) AS c FROM daily_question_answers"),
    arenaFightsCount: count(db, "SELECT COUNT(*) AS c FROM arena_fights"),
    arenaWinsCount: count(
      db,
      "SELECT COUNT(*) AS c FROM arena_fights WHERE result = 'win'",
    ),
    pixiesCount: count(db, "SELECT COUNT(*) AS c FROM user_videos"),
    usersCount: count(db, "SELECT COUNT(*) AS c FROM users"),
    sinceDate: getSiteSinceDate(db),
  };
}

module.exports = { getSiteStats };
