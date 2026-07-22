import { pgTable, serial, integer, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * tracked_items — a user's personal watchlist.
 *
 * item_type identifies which section of the site the item comes from:
 *   'game'    → Browse Games catalog (catalog_games row)
 *   'release' → Boutique Tracker release (releases row)
 *   'console' → Consoles section (a console model slug, e.g. "ps5")
 *
 * item_id is the canonical identifier for the item within its type:
 *   game:    catalog_games.source_id  (e.g. "rawg:12345")
 *   release: releases.id as string    (e.g. "42")
 *   console: console model slug       (e.g. "ps5-pro")
 *
 * item_data is a snapshot of display-relevant fields at tracking time
 * (title, image, etc.) so the /tracking page can render without
 * additional API calls even if the underlying item changes.
 */
export const trackedItemsTable = pgTable("tracked_items", {
  id:        serial("id").primaryKey(),
  userId:    integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  itemType:  text("item_type", { enum: ["game", "release", "console"] }).notNull(),
  itemId:    text("item_id").notNull(),
  /** Snapshot of title, image, etc. at time of tracking. */
  itemData:  jsonb("item_data").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // A user can only track the same item once.
  uniqueIndex("tracked_items_user_type_id_uidx").on(table.userId, table.itemType, table.itemId),
]);

export type TrackedItem       = typeof trackedItemsTable.$inferSelect;
export type InsertTrackedItem = typeof trackedItemsTable.$inferInsert;
