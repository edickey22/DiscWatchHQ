/**
 * system_kv — general-purpose persistent key-value store.
 *
 * Used for:
 *   "tgdb_budget"          → daily TGDB API call counter (resets at UTC midnight)
 *   "tgdb_backfill_idx"    → which POPULAR_TITLES index the TGDB enrichment backfill
 *                            has reached (allows resuming across server restarts)
 *
 * Value is arbitrary JSONB — callers are responsible for type-narrowing.
 */
import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const systemKv = pgTable("system_kv", {
  key:       text("key").primaryKey(),
  value:     jsonb("value").notNull().default(sql`'{}'::jsonb`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SystemKvRow    = typeof systemKv.$inferSelect;
export type InsertSystemKv = typeof systemKv.$inferInsert;
