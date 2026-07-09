import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const publishersTable = pgTable("publishers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  websiteUrl: text("website_url").notNull(),
  logoUrl: text("logo_url"),
  enabled: boolean("enabled").notNull().default(true),
  scrapeConfig: text("scrape_config"), // JSON blob with publisher-specific scrape settings
  lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPublisherSchema = createInsertSchema(publishersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPublisher = z.infer<typeof insertPublisherSchema>;
export type Publisher = typeof publishersTable.$inferSelect;
