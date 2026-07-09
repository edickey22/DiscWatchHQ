import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { publishersTable } from "./publishers";

export const scrapeLogsTable = pgTable("scrape_logs", {
  id: serial("id").primaryKey(),
  publisherId: integer("publisher_id").notNull().references(() => publishersTable.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: text("status", { enum: ["running", "success", "error"] }).notNull().default("running"),
  releasesFound: integer("releases_found"),
  errorMessage: text("error_message"),
});

export const insertScrapeLogSchema = createInsertSchema(scrapeLogsTable).omit({ id: true });
export type InsertScrapeLog = z.infer<typeof insertScrapeLogSchema>;
export type ScrapeLog = typeof scrapeLogsTable.$inferSelect;
