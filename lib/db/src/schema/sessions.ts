import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * sessions — persistent login sessions for authenticated users.
 *
 * Security properties:
 *   - Session token: 32 cryptographically random bytes, hex-encoded (64 chars).
 *     Only the SHA-256 hash is stored here; the raw token lives only in the
 *     httpOnly cookie, never in logs or API responses.
 *   - expires_at: 30 days from creation (sliding not implemented intentionally —
 *     keeps the model simple and predictable).
 *   - Deleting a user cascades and removes all their sessions.
 */
export const sessionsTable = pgTable("sessions", {
  id:        serial("id").primaryKey(),
  userId:    integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  /** SHA-256 hex digest of the raw 32-byte random session token. */
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Session       = typeof sessionsTable.$inferSelect;
export type InsertSession = typeof sessionsTable.$inferInsert;
