/**
 * catalog_games — unified game index (RAWG + TheGamesDB entries).
 *
 * Distinct from `releases` (boutique scarcity-tracked titles).
 * This table accumulates organic search results and periodic backfill
 * from both external catalog APIs, giving the site its own persistent
 * search index that grows over time.
 *
 * source_id is the canonical dedup key: "rawg:12345" or "tgdb:456".
 */
import {
  pgTable, text, serial, timestamp, integer,
  index, uniqueIndex, jsonb,
} from "drizzle-orm/pg-core";

export const catalogGamesTable = pgTable("catalog_games", {
  id:             serial("id").primaryKey(),
  /** 'rawg' | 'tgdb' */
  source:         text("source").notNull(),
  /** Namespaced external key: 'rawg:12345' or 'tgdb:456'. Used for upsert dedup. */
  sourceId:       text("source_id").notNull(),
  title:          text("title").notNull(),
  platforms:      text("platforms").array().notNull().default([]),
  publisherName:  text("publisher_name"),
  coverImageUrl:  text("cover_image_url"),
  /** 4-digit year extracted from releaseDate; avoids parsing ambiguous date strings. */
  releaseYear:    integer("release_year"),
  /** Metacritic score 0-100 (RAWG only; null for TGDB entries). */
  metacritic:     integer("metacritic"),
  /** ESRB content rating string: "E", "E10+", "T", "M", "AO", "RP" (TGDB only). */
  esrbRating:     text("esrb_rating"),
  /** Precomputed affiliate search URLs. Regenerated on upsert. */
  retailerUrls:   jsonb("retailer_urls").$type<{
    ebay: string; amazon: string; gamestop: string; bestbuy: string;
  }>(),
  createdAt:      timestamp("created_at",  { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at",  { withTimezone: true }).notNull().defaultNow()
                    .$onUpdate(() => new Date()),
}, table => [
  uniqueIndex("catalog_games_source_id_uidx").on(table.sourceId),
  index("catalog_games_title_idx").on(table.title),
]);

export type CatalogGameRow    = typeof catalogGamesTable.$inferSelect;
export type InsertCatalogGame = typeof catalogGamesTable.$inferInsert;
