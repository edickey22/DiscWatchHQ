import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { publishersTable } from "./publishers";

export const releasesTable = pgTable("releases", {
  id: serial("id").primaryKey(),
  publisherId: integer("publisher_id").notNull().references(() => publishersTable.id),
  externalId: text("external_id"), // publisher-specific ID to detect duplicates
  title: text("title").notNull(),
  platforms: text("platforms").array().notNull().default([]),
  status: text("status", { enum: ["available", "sold_out", "coming_soon"] }).notNull().default("coming_soon"),
  coverImageUrl: text("cover_image_url"),
  productUrl: text("product_url").notNull(),
  price: text("price"),
  editionType: text("edition_type"),
  preorderCloseDate: text("preorder_close_date"), // ISO date string YYYY-MM-DD
  releaseDate: text("release_date"),              // ISO date string YYYY-MM-DD
  soldOutAt: timestamp("sold_out_at", { withTimezone: true }),
  amazonUrl: text("amazon_url"),  // direct Amazon product link if known (for affiliate linking)
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("releases_publisher_id_idx").on(table.publisherId),
  index("releases_status_idx").on(table.status),
]);

export const insertReleaseSchema = createInsertSchema(releasesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRelease = z.infer<typeof insertReleaseSchema>;
export type Release = typeof releasesTable.$inferSelect;
