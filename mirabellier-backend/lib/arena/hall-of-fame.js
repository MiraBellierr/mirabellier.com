const { nowIso, toInt, toPositiveInt, clamp } = require("./utils");


function snapshotAndResetElo(db) {
  const now = nowIso();
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const month = d.toISOString().slice(0, 7);

  const existing = db.prepare("SELECT id FROM arena_hall_of_fame WHERE id = ?").get(month);
  if (existing) return { month, snapshot: false };

  const topEntries = db
    .prepare(
      `SELECT p.userId, u.username, u.avatar, p.level, p.eloRating, p.eloMatches, p.peakElo
       FROM arena_profiles p
       JOIN users u ON u.id = p.userId
       WHERE p.eloMatches > 0
       ORDER BY p.eloRating DESC, p.eloMatches DESC, p.peakElo DESC
       LIMIT 3`,
    )
    .all()
    .map((row, index) => ({
      rank: index + 1,
      userId: row.userId,
      username: row.username || "Unknown",
      avatar: row.avatar || null,
      level: row.level,
      eloRating: row.eloRating,
      eloMatches: row.eloMatches,
      peakElo: row.peakElo,
    }));

  db.prepare(
    "INSERT INTO arena_hall_of_fame (id, month, entriesJson, createdAt) VALUES (?, ?, ?, ?)",
  ).run(month, month, JSON.stringify(topEntries), now);

  db.prepare(
    "UPDATE arena_profiles SET eloRating = 1000, eloMatches = 0, peakElo = 1000",
  ).run();

  return { month, snapshot: true, entries: topEntries };
}

function getHallOfFame(db, options = {}) {
  const { month, page = 1, perPage = 12 } = options;

  if (month) {
    const row = db
      .prepare("SELECT * FROM arena_hall_of_fame WHERE id = ?")
      .get(month);

    return {
      months: row
        ? [
            {
              month: row.month,
              entries: JSON.parse(row.entriesJson),
              createdAt: row.createdAt,
            },
          ]
        : [],
      page: 1,
      perPage,
      totalPages: row ? 1 : 0,
      total: row ? 1 : 0,
    };
  }

  const total = db.prepare("SELECT COUNT(*) AS count FROM arena_hall_of_fame").get().count;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const offset = (page - 1) * perPage;

  const rows = db
    .prepare(
      "SELECT * FROM arena_hall_of_fame ORDER BY month DESC LIMIT ? OFFSET ?",
    )
    .all(perPage, offset);

  return {
    months: rows.map((row) => ({
      month: row.month,
      entries: JSON.parse(row.entriesJson),
      createdAt: row.createdAt,
    })),
    page,
    perPage,
    totalPages,
    total,
  };
}

module.exports = {
  snapshotAndResetElo,
  getHallOfFame,
};
