/**
 * price_snapshots — append-only time-series of prices captured by the
 * schedulers on each run.
 *
 * item_type   — discriminator for what the row tracks:
 *   "release_ebay"    → eBay resale lowest Buy-It-Now price for a sold-out
 *                       boutique release (written by ebayPriceScheduler.ts,
 *                       72h cycle)
 *   "release_list"    → publisher list price scraped from the publisher's
 *                       own storefront (written by scraper/runner.ts, 2h cycle)
 *   "console_ebay"    → lowest active BIN price across all eBay listings for
 *                       a curated console model (written by
 *                       consoleListingsScheduler.ts, 24h cycle)
 *
 * item_id     — string key for the item being tracked:
 *   release_* → the numeric release ID cast to text
 *   console_* → the ConsoleModel.id string (e.g. "ps5", "switch-2")
 *
 * source      — originating data source ("ebay", "publisher", etc.)
 *
 * price_usd   — null means the scheduler ran but found no active listings
 *               or no price data (not the same as "not checked yet").
 *               null rows are still written so trend calcs can distinguish
 *               "scheduler ran, nothing found" from "no snapshot at all".
 *
 * snapped_at  — UTC timestamp of when the snapshot was captured.
 *
 * Retention: keep 90 days. A nightly cleanup job (priceSnapshotCleanup.ts)
 * deletes rows older than 90 days to keep the table bounded.
 *
 * Indexing strategy: most queries are range scans by (item_type, item_id)
 * ordered by snapped_at desc — the composite index covers this efficiently.
 * A dedicated snapped_at index supports the cleanup job's DELETE.
 */
import { pgTable, serial, text, real, timestamp, index } from "drizzle-orm/pg-core";

export const priceSnapshotsTable = pgTable("price_snapshots", {
  id:        serial("id").primaryKey(),
  itemType:  text("item_type", { enum: ["release_ebay", "release_list", "console_ebay"] }).notNull(),
  itemId:    text("item_id").notNull(),
  source:    text("source").notNull(),
  priceUsd:  real("price_usd"),                                                    // null = no data found
  snappedAt: timestamp("snapped_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("price_snapshots_item_idx").on(table.itemType, table.itemId, table.snappedAt),
  // DESC variant used by the DISTINCT ON (item_id) query in scraper/runner.ts:
  // ORDER BY item_id, snapped_at DESC needs (item_type, item_id, snapped_at DESC)
  // to allow an index scan returning one row per release regardless of history depth.
  index("price_snapshots_item_desc_idx").on(table.itemType, table.itemId, table.snappedAt.desc()),
  index("price_snapshots_snapped_at_idx").on(table.snappedAt),
]);

export type PriceSnapshot    = typeof priceSnapshotsTable.$inferSelect;
export type InsertPriceSnapshot = typeof priceSnapshotsTable.$inferInsert;
