/**
 * tracking.ts — user watchlist (tracked items) routes.
 *
 * All routes require authentication via the session cookie.
 *
 * GET    /api/tracking              List all tracked items for the current user.
 * POST   /api/tracking              Track a new item.
 * DELETE /api/tracking/:id          Remove a tracked item (and its alert prefs).
 * GET    /api/tracking/status       Check which of a set of items are tracked.
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { trackedItemsTable, alertPrefsTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/authMiddleware";
import { logger } from "../lib/logger";

const router = Router();

// ── GET /api/tracking ─────────────────────────────────────────────────────────

router.get("/tracking", requireAuth, async (req, res) => {
  try {
    const items = await db
      .select()
      .from(trackedItemsTable)
      .where(eq(trackedItemsTable.userId, req.user!.id))
      .orderBy(trackedItemsTable.createdAt);

    res.json({ items });
  } catch (err) {
    logger.error({ err }, "Error fetching tracking list");
    res.status(500).json({ error: "Failed to fetch tracking list" });
  }
});

// ── GET /api/tracking/status ──────────────────────────────────────────────────
// Returns a set of item_id values the current user is tracking, filtered
// to a given type+ids list. Used to render track buttons in the correct state.
// Query params:  type=game|release|console  &  ids=id1,id2,id3

router.get("/tracking/status", requireAuth, async (req, res) => {
  const { type, ids } = req.query as { type?: string; ids?: string };

  if (!type || !ids) {
    res.status(400).json({ error: "type and ids are required" });
    return;
  }

  const idList = ids.split(",").map((s) => s.trim()).filter(Boolean);

  if (idList.length === 0) {
    res.json({ tracked: [] });
    return;
  }

  if (!["game", "release", "console"].includes(type)) {
    res.status(400).json({ error: "type must be game, release, or console" });
    return;
  }

  try {
    const rows = await db
      .select({ itemId: trackedItemsTable.itemId })
      .from(trackedItemsTable)
      .where(
        and(
          eq(trackedItemsTable.userId, req.user!.id),
          eq(trackedItemsTable.itemType, type as "game" | "release" | "console"),
          inArray(trackedItemsTable.itemId, idList),
        ),
      );

    res.json({ tracked: rows.map((r) => r.itemId) });
  } catch (err) {
    logger.error({ err }, "Error fetching tracking status");
    res.status(500).json({ error: "Failed to fetch tracking status" });
  }
});

// ── POST /api/tracking ────────────────────────────────────────────────────────

router.post("/tracking", requireAuth, async (req, res) => {
  const { itemType, itemId, itemData } = req.body as {
    itemType?: string;
    itemId?:   string;
    itemData?: Record<string, unknown>;
  };

  if (!itemType || !itemId || !itemData) {
    res.status(400).json({ error: "itemType, itemId, and itemData are required" });
    return;
  }

  if (!["game", "release", "console"].includes(itemType)) {
    res.status(400).json({ error: "itemType must be game, release, or console" });
    return;
  }

  try {
    const [item] = await db
      .insert(trackedItemsTable)
      .values({
        userId:   req.user!.id,
        itemType: itemType as "game" | "release" | "console",
        itemId,
        itemData,
      })
      .onConflictDoNothing()
      .returning();

    if (!item) {
      // Already tracked — return existing row
      const [existing] = await db
        .select()
        .from(trackedItemsTable)
        .where(
          and(
            eq(trackedItemsTable.userId, req.user!.id),
            eq(trackedItemsTable.itemType, itemType as "game" | "release" | "console"),
            eq(trackedItemsTable.itemId, itemId),
          ),
        )
        .limit(1);
      res.json({ item: existing, alreadyTracked: true });
      return;
    }

    res.status(201).json({ item });
  } catch (err) {
    logger.error({ err }, "Error adding tracked item");
    res.status(500).json({ error: "Failed to track item" });
  }
});

// ── DELETE /api/tracking/:id ──────────────────────────────────────────────────

router.delete("/tracking/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  try {
    // Verify ownership before deleting
    const [item] = await db
      .select({ id: trackedItemsTable.id, userId: trackedItemsTable.userId })
      .from(trackedItemsTable)
      .where(eq(trackedItemsTable.id, id))
      .limit(1);

    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    if (item.userId !== req.user!.id) {
      res.status(403).json({ error: "Not your item" });
      return;
    }

    // alert_prefs cascade-delete via FK, but being explicit is cleaner
    await db.delete(alertPrefsTable).where(eq(alertPrefsTable.trackedItemId, id));
    await db.delete(trackedItemsTable).where(eq(trackedItemsTable.id, id));

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error removing tracked item");
    res.status(500).json({ error: "Failed to remove item" });
  }
});

export default router;
