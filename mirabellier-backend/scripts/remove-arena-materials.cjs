const { SHOP_ITEMS } = require("../lib/arena-constants");

const MATERIAL_ITEM_IDS = SHOP_ITEMS
  .filter((item) => item.type === "material")
  .map((item) => item.id);

function removeArenaMaterials(db, { apply = false } = {}) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("A database connection is required.");
  }
  if (MATERIAL_ITEM_IDS.length === 0) {
    return { apply, rows: 0, quantity: 0, deletedRows: 0 };
  }

  const placeholders = MATERIAL_ITEM_IDS.map(() => "?").join(", ");
  const summary = db
    .prepare(
      `SELECT COUNT(*) AS rows, COALESCE(SUM(quantity), 0) AS quantity
       FROM arena_inventory
       WHERE itemId IN (${placeholders})`,
    )
    .get(...MATERIAL_ITEM_IDS);

  let deletedRows = 0;
  if (apply) {
    deletedRows = db.transaction(() =>
      db
        .prepare(
          `DELETE FROM arena_inventory
           WHERE itemId IN (${placeholders})`,
        )
        .run(...MATERIAL_ITEM_IDS).changes,
    )();
  }

  return {
    apply,
    rows: Number(summary?.rows || 0),
    quantity: Number(summary?.quantity || 0),
    deletedRows,
  };
}

if (require.main === module) {
  require("dotenv").config();
  const { db } = require("../lib/db");
  const apply = process.argv.includes("--apply");
  const result = removeArenaMaterials(db, { apply });

  if (!apply) {
    console.log(
      `Dry run: ${result.rows} material inventory rows (${result.quantity} total items) would be deleted.`,
    );
    console.log("Run with --apply to perform the migration.");
  } else {
    console.log(
      `Deleted ${result.deletedRows} material inventory rows (${result.quantity} total items) without reimbursement.`,
    );
  }
}

module.exports = {
  MATERIAL_ITEM_IDS,
  removeArenaMaterials,
};
