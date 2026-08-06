import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * auth_tokens — single-use magic-link tokens.
 *
 * Security properties:
 *   - Only the SHA-256 hash of the raw token is stored here.
 *     The raw token is only ever present in the email link; it is never
 *     persisted to the database, never logged, and never returned by any API.
 *   - expires_at: 15 minutes from creation. Short window limits exposure.
 *   - used_at: set when the token is consumed. Any subsequent attempt to use
 *     the same token is rejected even if it hasn't expired.
 *   - user_id may be null before the user row is created (token is generated
 *     first, then user is upserted); set to the resolved user id on creation.
 */
export const authTokensTable = pgTable("auth_tokens", {
  id:        serial("id").primaryKey(),
  userId:    integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  /** SHA-256 hex digest of the raw 32-byte random token. Never the raw token. */
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  /** Set when the token is successfully consumed — makes it single-use. */
  usedAt:    timestamp("used_at",    { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuthToken       = typeof authTokensTable.$inferSelect;
export type InsertAuthToken = typeof authTokensTable.$inferInsert;
