/**
 * alerts.ts — email alert preference routes.
 *
 * GET    /api/alerts                 List alert prefs for current user.
 * POST   /api/alerts                 Enable an alert for a tracked item.
 * DELETE /api/alerts/:id             Disable/remove an alert pref.
 * PATCH  /api/alerts/:id             Toggle enabled state.
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { alertPrefsTable, trackedItemsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/authMiddleware";
import { logger } from "../lib/logger";

const router = Router();

// ── GET /api/alerts ───────────────────────────────────────────────────────────

router.get("/alerts", requireAuth, async (req, res) => {
  try {
    const prefs = await db
      .select({
        alert: alertPrefsTable,
        item:  trackedItemsTable,
      })
      .from(alertPrefsTable)
      .innerJoin(trackedItemsTable, eq(alertPrefsTable.trackedItemId, trackedItemsTable.id))
      .where(eq(alertPrefsTable.userId, req.user!.id))
      .orderBy(alertPrefsTable.createdAt);

    res.json({ prefs });
  } catch (err) {
    logger.error({ err }, "Error fetching alert prefs");
    res.status(500).json({ error: "Failed to fetch alert preferences" });
  }
});

// ── POST /api/alerts ──────────────────────────────────────────────────────────

router.post("/alerts", requireAuth, async (req, res) => {
  const { trackedItemId, alertType, baselineValue } = req.body as {
    trackedItemId?: number;
    alertType?:     string;
    baselineValue?: string;
  };

  if (!trackedItemId || !alertType) {
    res.status(400).json({ error: "trackedItemId and alertType are required" });
    return;
  }

  if (!["restock", "price_drop", "status_change", "price_drop_low"].includes(alertType)) {
    res.status(400).json({ error: "alertType must be restock, price_drop, status_change, or price_drop_low" });
    return;
  }

  // Verify the tracked item belongs to the user
  const [item] = await db
    .select()
    .from(trackedItemsTable)
    .where(
      and(
        eq(trackedItemsTable.id, trackedItemId),
        eq(trackedItemsTable.userId, req.user!.id),
      ),
    )
    .limit(1);

  if (!item) {
    res.status(404).json({ error: "Tracked item not found" });
    return;
  }

  try {
    const [pref] = await db
      .insert(alertPrefsTable)
      .values({
        userId:        req.user!.id,
        trackedItemId,
        alertType:     alertType as "restock" | "price_drop" | "status_change" | "price_drop_low",
        baselineValue: baselineValue ?? null,
        enabled:       true,
      })
      .returning();

    res.status(201).json({ pref });
  } catch (err) {
    logger.error({ err }, "Error creating alert pref");
    res.status(500).json({ error: "Failed to create alert preference" });
  }
});

// ── DELETE /api/alerts/:id ────────────────────────────────────────────────────

router.delete("/alerts/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [pref] = await db
    .select()
    .from(alertPrefsTable)
    .where(eq(alertPrefsTable.id, id))
    .limit(1);

  if (!pref || pref.userId !== req.user!.id) {
    res.status(404).json({ error: "Alert preference not found" });
    return;
  }

  try {
    await db.delete(alertPrefsTable).where(eq(alertPrefsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error deleting alert pref");
    res.status(500).json({ error: "Failed to delete alert preference" });
  }
});

// ── PATCH /api/alerts/:id ─────────────────────────────────────────────────────

router.patch("/alerts/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { enabled } = req.body as { enabled?: boolean };

  if (Number.isNaN(id) || typeof enabled !== "boolean") {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [pref] = await db
    .select()
    .from(alertPrefsTable)
    .where(eq(alertPrefsTable.id, id))
    .limit(1);

  if (!pref || pref.userId !== req.user!.id) {
    res.status(404).json({ error: "Alert preference not found" });
    return;
  }

  try {
    const [updated] = await db
      .update(alertPrefsTable)
      .set({ enabled })
      .where(eq(alertPrefsTable.id, id))
      .returning();

    res.json({ pref: updated });
  } catch (err) {
    logger.error({ err }, "Error updating alert pref");
    res.status(500).json({ error: "Failed to update alert preference" });
  }
});

export default router;
