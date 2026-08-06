import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { trackedItemsTable } from "./trackedItems";

/**
 * alert_prefs — per-item email alert preferences for a tracked user.
 *
 * alert_type controls what condition triggers a notification:
 *   'restock'         → boutique release status changes to 'in_stock'
 *   'price_drop'      → game/console listing price drops ≥10% below baseline_value
 *   'status_change'   → any status change on a boutique release
 *   'price_drop_low'  → boutique release hits a new 30-day eBay low (from
 *                        price_snapshots); requires ≥7 days of history before firing
 *
 * baseline_value stores the reference value at opt-in time (serialised as text):
 *   price_drop:    the USD price as a string, e.g. "49.99"
 *   restock:       the status string at opt-in, e.g. "sold_out"
 *   status_change: the status string at opt-in, e.g. "coming_soon"
 *
 * last_notified_at is updated whenever an alert email is sent. The checker
 * uses this to avoid sending duplicate alerts within a cool-off window.
 *
 * ── Email sending ─────────────────────────────────────────────────────────────
 * The alert checker (src/lib/alertChecker.ts) calls sendAlertEmail() from
 * src/lib/email.ts.  That function is fully implemented but requires
 * SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS environment variables.
 * Until Erik wires in a real transactional email provider, the function logs
 * the email content to the console instead of sending it.
 */
export const alertPrefsTable = pgTable("alert_prefs", {
  id:             serial("id").primaryKey(),
  userId:         integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  trackedItemId:  integer("tracked_item_id").notNull().references(() => trackedItemsTable.id, { onDelete: "cascade" }),
  alertType:      text("alert_type", { enum: ["restock", "price_drop", "status_change", "price_drop_low"] }).notNull(),
  /** Reference value at opt-in time. Compared against current value to detect changes. */
  baselineValue:  text("baseline_value"),
  enabled:        boolean("enabled").notNull().default(true),
  lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
  createdAt:      timestamp("created_at",       { withTimezone: true }).notNull().defaultNow(),
});

export type AlertPref       = typeof alertPrefsTable.$inferSelect;
export type InsertAlertPref = typeof alertPrefsTable.$inferInsert;
