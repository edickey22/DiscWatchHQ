/**
 * game_detail_cache — persistent L2 cache for RAWG game detail API responses.
 *
 * The detail endpoint (GET /api/games/detail/:sourceId) must fetch two live
 * RAWG endpoints (game detail + screenshots) that are NOT stored in
 * catalog_games.  Without persistence, every server restart or new autoscale
 * instance starts cold, causing 2 RAWG calls per unique game per process.
 *
 * This table stores only the fields that come exclusively from those two RAWG
 * calls.  Base fields (title, cover, metacritic, etc.) stay in catalog_games.
 * On a cache hit the route merges both rows and never touches RAWG at all.
 *
 * TTL: 60 days.  Descriptions and screenshots are essentially static after a
 * game ships, so long TTLs are safe.  Expired rows are pruned nightly by the
 * catalog backfill job.
 *
 * Only RAWG-sourced games are cached here — TGDB detail is already a cheap
 * DB read from catalog_games with no external API cost.
 */
import {
  pgTable, text, jsonb, timestamp, index,
} from "drizzle-orm/pg-core";

export const gameDetailCacheTable = pgTable("game_detail_cache", {
  /** Matches catalog_games.source_id — e.g. "rawg:12345". Primary key / upsert target. */
  sourceId:    text("source_id").primaryKey(),

  /** description_raw from RAWG /api/games/{id}. Null when RAWG returns no description. */
  description: text("description"),

  /** Up to 6 screenshot image URLs from RAWG /api/games/{id}/screenshots. */
  screenshots: jsonb("screenshots").$type<string[]>(),

  /** When this row was last fetched from RAWG. */
  fetchedAt:   timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),

  /** Row expires after this timestamp; the cleanup job deletes rows where expiresAt < NOW(). */
  expiresAt:   timestamp("expires_at", { withTimezone: true }).notNull(),
}, table => [
  // Index used by the nightly DELETE WHERE expires_at < NOW() cleanup query.
  index("game_detail_cache_expires_at_idx").on(table.expiresAt),
]);

export type GameDetailCacheRow    = typeof gameDetailCacheTable.$inferSelect;
export type InsertGameDetailCache = typeof gameDetailCacheTable.$inferInsert;
