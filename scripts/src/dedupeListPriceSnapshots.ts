/**
 * dedupeListPriceSnapshots.ts
 *
 * One-time cleanup: removes duplicate consecutive release_list snapshots from
 * the price_snapshots table.
 *
 * Background
 * ----------
 * Before dedup logic was added to scraper/runner.ts, every 2-hour scrape run
 * wrote a new release_list snapshot even when the price hadn't changed.  This
 * can leave tens-of-thousands of redundant rows that inflate storage and slow
 * range-scan queries.
 *
 * What counts as a duplicate
 * --------------------------
 * A snapshot is a duplicate when the immediately preceding snapshot for the
 * same item_id (ordered by snapped_at asc) carries the same price_usd, where
 * "same" means:
 *   • both NULL, OR
 *   • both non-NULL and |a − b| < 0.001
 *
 * Keeping only the *first* row in each consecutive run of identical prices
 * preserves the moment a price first appeared (useful for history charts) while
 * discarding the noise.
 *
 * Safety
 * ------
 * • Uses batched DELETEs (default 1 000 rows per batch) to avoid long-running
 *   transactions and table locks.
 * • Each batch is a short, index-driven DELETE by primary key — safe on a live DB.
 * • Dry-run mode (--dry-run flag) prints the count without deleting anything.
 *
 * Usage
 * -----
 *   pnpm --filter @workspace/scripts run dedupe-list-price-snapshots
 *   pnpm --filter @workspace/scripts run dedupe-list-price-snapshots -- --dry-run
 */

import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";

const BATCH_SIZE = 1_000;
const DRY_RUN = process.argv.includes("--dry-run");

/** Returns up to `limit` IDs of duplicate consecutive release_list snapshots. */
async function fetchDuplicateBatch(limit: number): Promise<number[]> {
  // For each release_list snapshot, look at the snapshot immediately before it
  // (by snapped_at) for the same item_id.  If the prices are identical (both
  // NULL, or within floating-point tolerance), this row is a duplicate.
  //
  // We cap the CTE scan with ORDER BY + LIMIT so Postgres can stop early once
  // it has found `limit` candidates, keeping each batch cheap.
  const result = await db.execute<{ id: number }>(sql`
    WITH ordered AS (
      SELECT
        id,
        item_id,
        price_usd,
        LAG(price_usd) OVER (
          PARTITION BY item_id
          ORDER BY snapped_at ASC
        ) AS prev_price_usd
      FROM price_snapshots
      WHERE item_type = 'release_list'
    )
    SELECT id
    FROM ordered
    WHERE
      -- both NULL  → duplicate
      (price_usd IS NULL AND prev_price_usd IS NULL)
      OR
      -- both non-NULL and within floating-point tolerance → duplicate
      (
        price_usd IS NOT NULL
        AND prev_price_usd IS NOT NULL
        AND ABS(price_usd - prev_price_usd) < 0.001
      )
    ORDER BY id
    LIMIT ${sql.raw(String(limit))}
  `);

  return result.rows.map((r) => Number(r.id));
}

/** Counts all duplicate consecutive release_list snapshots (for reporting). */
async function countDuplicates(): Promise<number> {
  const result = await db.execute<{ cnt: string }>(sql`
    WITH ordered AS (
      SELECT
        id,
        item_id,
        price_usd,
        LAG(price_usd) OVER (
          PARTITION BY item_id
          ORDER BY snapped_at ASC
        ) AS prev_price_usd
      FROM price_snapshots
      WHERE item_type = 'release_list'
    )
    SELECT COUNT(*) AS cnt
    FROM ordered
    WHERE
      (price_usd IS NULL AND prev_price_usd IS NULL)
      OR
      (
        price_usd IS NOT NULL
        AND prev_price_usd IS NOT NULL
        AND ABS(price_usd - prev_price_usd) < 0.001
      )
  `);

  return Number(result.rows[0]?.cnt ?? 0);
}

async function main() {
  console.log("=== Dedupe release_list price snapshots ===");
  if (DRY_RUN) console.log("DRY-RUN mode — no rows will be deleted.\n");

  const total = await countDuplicates();
  console.log(`Duplicate rows found: ${total.toLocaleString()}`);

  if (total === 0) {
    console.log("Nothing to clean up.");
    return;
  }

  if (DRY_RUN) {
    console.log("(Dry-run: skipping delete.)");
    return;
  }

  let deleted = 0;
  let batch = 1;

  while (true) {
    const ids = await fetchDuplicateBatch(BATCH_SIZE);
    if (ids.length === 0) break;

    // DELETE by primary key — fast, index-only, short transaction
    await db.execute(sql`
      DELETE FROM price_snapshots
      WHERE id = ANY(${sql.raw(`ARRAY[${ids.join(",")}]::int[]`)})`);

    deleted += ids.length;
    const pct = ((deleted / total) * 100).toFixed(1);
    console.log(
      `  Batch ${batch}: deleted ${ids.length} rows  (${deleted.toLocaleString()} / ${total.toLocaleString()} = ${pct}%)`,
    );
    batch++;
  }

  console.log(`\nDone. Removed ${deleted.toLocaleString()} duplicate rows.`);
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
