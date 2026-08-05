import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * users — minimal user record for magic-link auth.
 * Created automatically on first successful login; no password ever stored.
 */
export const usersTable = pgTable("users", {
  id:          serial("id").primaryKey(),
  email:       text("email").notNull().unique(),
  displayName: text("display_name"),           // optional, user-settable; max 60 chars
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User       = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
