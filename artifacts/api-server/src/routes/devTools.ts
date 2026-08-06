/**
 * devTools.ts — development-only routes for end-to-end testing.
 *
 * ONLY mounted when NODE_ENV !== "production".
 * These endpoints create real DB rows, call real SMTP, and should never
 * be reachable in the deployed production environment.
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  trackedItemsTable,
  alertPrefsTable,
  releasesTable,
  priceSnapshotsTable,
} from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { checkAlerts } from "../lib/alertChecker";
import { getConsoleListingsEntry } from "../lib/consoleListingsCache";
import { logger } from "../lib/logger";
import { backfillUnknownPlatforms } from "../lib/backfillUnknownPlatforms";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/dev/test-price-alert
//
// Creates a synthetic price-drop scenario for a console and fires the full
// alert check pipeline. Use this to confirm SMTP delivery end-to-end without
// waiting for a real price change.
//
// Body: { email: string, consoleId: string, inflatedBaseline?: number }
//   email            – where to send the test alert
//   consoleId        – eBay console slug, e.g. "ps5", "ps5-pro", "switch-2"
//   inflatedBaseline – optional override for baseline price (default: 2× current lowest)
//
// Returns a JSON report of every step taken.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/dev/test-price-alert", async (req, res) => {
  const { email, consoleId, inflatedBaseline } = req.body as {
    email?:            string;
    consoleId?:        string;
    inflatedBaseline?: number;
  };

  if (!email || !consoleId) {
    res.status(400).json({ error: "email and consoleId are required" });
    return;
  }

  const steps: string[] = [];

  try {
    // 1. Resolve current lowest BIN price from the eBay listings cache
    const entry = getConsoleListingsEntry(consoleId);
    if (!entry || entry.listings.length === 0) {
      res.status(422).json({
        error: `No cached listings for consoleId "${consoleId}". ` +
               `Try a known slug like "ps5", "ps5-pro", "xbox-series-x", "switch-2".`,
      });
      return;
    }

    const binListings  = entry.listings.filter(l => !l.isAuction);
    const useListings  = binListings.length > 0 ? binListings : entry.listings;
    const currentPrice = Math.min(...useListings.map(l => l.price));
    const baseline     = inflatedBaseline ?? parseFloat((currentPrice * 2).toFixed(2));

    steps.push(`Current lowest BIN price: $${currentPrice.toFixed(2)}`);
    steps.push(`Synthetic baseline (2× current): $${baseline.toFixed(2)}`);
    steps.push(`Expected drop: ${((1 - currentPrice / baseline) * 100).toFixed(1)}% — should trigger (≥10% threshold)`);

    // 2. Upsert test user
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    let userId: number;
    if (existing.length > 0) {
      userId = existing[0].id;
      steps.push(`Using existing user id=${userId} for ${email}`);
    } else {
      const [newUser] = await db.insert(usersTable).values({ email }).returning();
      userId = newUser.id;
      steps.push(`Created test user id=${userId} for ${email}`);
    }

    // 3. Upsert tracked item (ignored if already exists for this user+console)
    let trackedId: number;
    const existingItem = await db
      .select()
      .from(trackedItemsTable)
      .where(and(eq(trackedItemsTable.userId, userId), eq(trackedItemsTable.itemId, consoleId)))
      .limit(1);

    if (existingItem.length > 0) {
      trackedId = existingItem[0].id;
      steps.push(`Using existing tracked_item id=${trackedId}`);
    } else {
      const [ti] = await db
        .insert(trackedItemsTable)
        .values({
          userId,
          itemType: "console",
          itemId:   consoleId,
          itemData: { title: consoleId, image: null },
        })
        .returning();
      trackedId = ti.id;
      steps.push(`Created tracked_item id=${trackedId}`);
    }

    // 4. Insert alert_pref with inflated baseline — this guarantees a drop fires
    // Always insert fresh (don't reuse stale prefs with a different baseline)
    const [pref] = await db
      .insert(alertPrefsTable)
      .values({
        userId,
        trackedItemId: trackedId,
        alertType:     "price_drop",
        baselineValue: baseline.toFixed(2),
        enabled:       true,
      })
      .returning();

    steps.push(`Created alert_pref id=${pref.id} with baseline $${baseline.toFixed(2)}`);

    // 5. Run the full alert check — will pick up the new pref
    steps.push("Running checkAlerts()…");
    await checkAlerts();
    steps.push("checkAlerts() completed — check API server logs for SMTP send confirmation");

    // 6. Re-read the pref to report whether it fired
    const [updated] = await db
      .select()
      .from(alertPrefsTable)
      .where(eq(alertPrefsTable.id, pref.id))
      .limit(1);

    const fired = updated?.lastNotifiedAt != null;
    steps.push(fired
      ? `✅ Alert fired — lastNotifiedAt=${updated!.lastNotifiedAt!.toISOString()}`
      : "❌ Alert did NOT fire — check logs for reason");

    // 7. Clean up the synthetic pref (leave tracked_item + user intact for inspection)
    await db.delete(alertPrefsTable).where(eq(alertPrefsTable.id, pref.id));
    steps.push(`Cleaned up synthetic alert_pref id=${pref.id}`);

    res.json({
      ok:           fired,
      email,
      consoleId,
      currentPrice,
      baseline,
      steps,
    });
  } catch (err) {
    logger.error({ err }, "devTools: test-price-alert error");
    res.status(500).json({ error: String(err), steps });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/dev/test-release-alert
//
// Forces a status-change alert for a boutique release by temporarily setting
// the alert_pref baseline to a different status, then running checkAlerts.
//
// Body: { email: string, releaseId: number }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/dev/test-release-alert", async (req, res) => {
  const { email, releaseId } = req.body as { email?: string; releaseId?: number };

  if (!email || !releaseId) {
    res.status(400).json({ error: "email and releaseId are required" });
    return;
  }

  const steps: string[] = [];

  try {
    // 1. Verify release exists
    const [release] = await db
      .select()
      .from(releasesTable)
      .where(eq(releasesTable.id, releaseId))
      .limit(1);

    if (!release) {
      res.status(404).json({ error: `Release id=${releaseId} not found` });
      return;
    }

    steps.push(`Found release "${release.title}" (status="${release.status}")`);

    // 2. Upsert test user
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    let userId: number;
    if (existing.length > 0) {
      userId = existing[0].id;
      steps.push(`Using existing user id=${userId}`);
    } else {
      const [u] = await db.insert(usersTable).values({ email }).returning();
      userId = u.id;
      steps.push(`Created test user id=${userId}`);
    }

    // 3. Upsert tracked_item for this release
    let trackedId: number;
    const existingItem = await db
      .select()
      .from(trackedItemsTable)
      .where(and(eq(trackedItemsTable.userId, userId), eq(trackedItemsTable.itemId, String(releaseId))))
      .limit(1);

    if (existingItem.length > 0) {
      trackedId = existingItem[0].id;
      steps.push(`Using existing tracked_item id=${trackedId}`);
    } else {
      const [ti] = await db
        .insert(trackedItemsTable)
        .values({
          userId,
          itemType: "release",
          itemId:   String(releaseId),
          itemData: { title: release.title, status: release.status },
        })
        .returning();
      trackedId = ti.id;
      steps.push(`Created tracked_item id=${trackedId}`);
    }

    // 4. Set baseline to a DIFFERENT status so the checker fires immediately
    const fakeBaseline = release.status === "sold_out" ? "coming_soon" : "sold_out";
    const [pref] = await db
      .insert(alertPrefsTable)
      .values({
        userId,
        trackedItemId: trackedId,
        alertType:     "status_change",
        baselineValue: fakeBaseline,
        enabled:       true,
      })
      .returning();

    steps.push(`Created alert_pref id=${pref.id} with baseline="${fakeBaseline}" (current="${release.status}")`);
    steps.push("Running checkAlerts()…");
    await checkAlerts();

    const [updated] = await db
      .select()
      .from(alertPrefsTable)
      .where(eq(alertPrefsTable.id, pref.id))
      .limit(1);

    const fired = updated?.lastNotifiedAt != null;
    steps.push(fired
      ? `✅ Alert fired — lastNotifiedAt=${updated!.lastNotifiedAt!.toISOString()}`
      : "❌ Alert did NOT fire — check logs");

    // Clean up
    await db.delete(alertPrefsTable).where(eq(alertPrefsTable.id, pref.id));
    steps.push(`Cleaned up synthetic alert_pref id=${pref.id}`);

    res.json({ ok: fired, email, releaseId, releaseName: release.title, steps });
  } catch (err) {
    logger.error({ err }, "devTools: test-release-alert error");
    res.status(500).json({ error: String(err), steps });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/dev/test-release-price-alert
//
// Forces a price-drop alert for a boutique release by creating a synthetic
// alert_pref with a 2× inflated baseline against the release's stored ebayPrice,
// then running the full alert check pipeline.
//
// Body: { email: string, releaseId: number, inflatedBaseline?: number }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/dev/test-release-price-alert", async (req, res) => {
  const { email, releaseId, inflatedBaseline } = req.body as {
    email?:            string;
    releaseId?:        number;
    inflatedBaseline?: number;
  };

  if (!email || !releaseId) {
    res.status(400).json({ error: "email and releaseId are required" });
    return;
  }

  const steps: string[] = [];

  try {
    // 1. Load the release and verify it has an eBay price
    const [release] = await db
      .select({
        id:        releasesTable.id,
        title:     releasesTable.title,
        status:    releasesTable.status,
        ebayPrice: releasesTable.ebayPrice,
      })
      .from(releasesTable)
      .where(eq(releasesTable.id, releaseId))
      .limit(1);

    if (!release) {
      res.status(404).json({ error: `Release id=${releaseId} not found` });
      return;
    }

    if (release.ebayPrice == null) {
      res.status(422).json({
        error: `Release id=${releaseId} has no ebayPrice yet — eBay price scheduler hasn't run for this title. ` +
               `Try a sold_out release that has eBay data (e.g. ids: 971, 277, 332, 153).`,
      });
      return;
    }

    const currentPrice = release.ebayPrice;
    const baseline     = inflatedBaseline ?? parseFloat((currentPrice * 2).toFixed(2));

    steps.push(`Release "${release.title}" (id=${release.id}, status="${release.status}")`);
    steps.push(`Current eBay resale price: $${currentPrice.toFixed(2)}`);
    steps.push(`Synthetic baseline (2× current): $${baseline.toFixed(2)}`);
    steps.push(`Expected drop: ${((1 - currentPrice / baseline) * 100).toFixed(1)}% — should trigger (≥10% threshold)`);

    // 2. Upsert test user
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    let userId: number;
    if (existing.length > 0) {
      userId = existing[0].id;
      steps.push(`Using existing user id=${userId} for ${email}`);
    } else {
      const [newUser] = await db.insert(usersTable).values({ email }).returning();
      userId = newUser.id;
      steps.push(`Created test user id=${userId} for ${email}`);
    }

    // 3. Upsert tracked_item for this release
    let trackedId: number;
    const existingItem = await db
      .select()
      .from(trackedItemsTable)
      .where(and(eq(trackedItemsTable.userId, userId), eq(trackedItemsTable.itemId, String(releaseId))))
      .limit(1);

    if (existingItem.length > 0) {
      trackedId = existingItem[0].id;
      steps.push(`Using existing tracked_item id=${trackedId}`);
    } else {
      const [ti] = await db
        .insert(trackedItemsTable)
        .values({
          userId,
          itemType: "release",
          itemId:   String(releaseId),
          itemData: { title: release.title, status: release.status },
        })
        .returning();
      trackedId = ti.id;
      steps.push(`Created tracked_item id=${trackedId}`);
    }

    // 4. Insert price_drop alert_pref with inflated baseline
    const [pref] = await db
      .insert(alertPrefsTable)
      .values({
        userId,
        trackedItemId: trackedId,
        alertType:     "price_drop",
        baselineValue: baseline.toFixed(2),
        enabled:       true,
      })
      .returning();

    steps.push(`Created alert_pref id=${pref.id} (type=price_drop) with baseline $${baseline.toFixed(2)}`);

    // 5. Run the full alert check
    steps.push("Running checkAlerts()…");
    await checkAlerts();

    // 6. Re-read pref to confirm it fired
    const [updated] = await db
      .select()
      .from(alertPrefsTable)
      .where(eq(alertPrefsTable.id, pref.id))
      .limit(1);

    const fired = updated?.lastNotifiedAt != null;
    steps.push(fired
      ? `✅ Alert fired — lastNotifiedAt=${updated!.lastNotifiedAt!.toISOString()}`
      : "❌ Alert did NOT fire — check logs for reason");

    // 7. Clean up the synthetic pref
    await db.delete(alertPrefsTable).where(eq(alertPrefsTable.id, pref.id));
    steps.push(`Cleaned up synthetic alert_pref id=${pref.id}`);

    res.json({
      ok:           fired,
      email,
      releaseId,
      releaseName:  release.title,
      currentPrice,
      baseline,
      steps,
    });
  } catch (err) {
    logger.error({ err }, "devTools: test-release-price-alert error");
    res.status(500).json({ error: String(err), steps });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/dev/test-30day-low-alert
//
// Forces a price_drop_low alert for a boutique release by inserting synthetic
// price_snapshots spanning >7 days, then creating an alert_pref whose baseline
// is 2× the synthetic price so the checker fires immediately.
//
// Body: { email: string, releaseId: number }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/dev/test-30day-low-alert", async (req, res) => {
  const { email, releaseId } = req.body as { email?: string; releaseId?: number };

  if (!email || !releaseId) {
    res.status(400).json({ error: "email and releaseId are required" });
    return;
  }

  const steps: string[] = [];
  const syntheticSnapIds: number[] = [];

  try {
    // 1. Verify release exists
    const [release] = await db
      .select({ id: releasesTable.id, title: releasesTable.title, status: releasesTable.status, coverImageUrl: releasesTable.coverImageUrl })
      .from(releasesTable)
      .where(eq(releasesTable.id, releaseId))
      .limit(1);

    if (!release) {
      res.status(404).json({ error: `Release id=${releaseId} not found` });
      return;
    }
    steps.push(`Found release "${release.title}" (id=${release.id}, status="${release.status}")`);

    // 2. Insert synthetic price_snapshots that satisfy the alertChecker's history guard:
    //    - Oldest snapshot must be ≤ 7 days ago (i.e. at least 7 days of history)
    //    - All snapshots within the 30-day window
    const syntheticPrice = 34.99;
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() -  2 * 24 * 60 * 60 * 1000);

    const [snap1] = await db.insert(priceSnapshotsTable).values({
      itemType:  "release_ebay",
      itemId:    String(releaseId),
      source:    "ebay",
      priceUsd:  syntheticPrice,
      snappedAt: tenDaysAgo,
    }).returning();
    syntheticSnapIds.push(snap1.id);

    const [snap2] = await db.insert(priceSnapshotsTable).values({
      itemType:  "release_ebay",
      itemId:    String(releaseId),
      source:    "ebay",
      priceUsd:  syntheticPrice,
      snappedAt: twoDaysAgo,
    }).returning();
    syntheticSnapIds.push(snap2.id);

    steps.push(`Inserted synthetic snapshots: $${syntheticPrice} at -10d (id=${snap1.id}) and -2d (id=${snap2.id})`);
    steps.push(`30-day min will be $${syntheticPrice} — oldest snapshot 10 days ago satisfies ≥7-day history guard`);

    // 3. Upsert test user
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    let userId: number;
    if (existing.length > 0) {
      userId = existing[0].id;
      steps.push(`Using existing user id=${userId} for ${email}`);
    } else {
      const [newUser] = await db.insert(usersTable).values({ email }).returning();
      userId = newUser.id;
      steps.push(`Created test user id=${userId} for ${email}`);
    }

    // 4. Upsert tracked_item for this release
    let trackedId: number;
    const existingItem = await db
      .select()
      .from(trackedItemsTable)
      .where(and(eq(trackedItemsTable.userId, userId), eq(trackedItemsTable.itemId, String(releaseId))))
      .limit(1);

    if (existingItem.length > 0) {
      trackedId = existingItem[0].id;
      steps.push(`Using existing tracked_item id=${trackedId}`);
    } else {
      const [ti] = await db
        .insert(trackedItemsTable)
        .values({
          userId,
          itemType: "release",
          itemId:   String(releaseId),
          itemData: { title: release.title, status: release.status, coverImageUrl: release.coverImageUrl ?? undefined },
        })
        .returning();
      trackedId = ti.id;
      steps.push(`Created tracked_item id=${trackedId}`);
    }

    // 5. Insert price_drop_low pref with baseline 2× synthetic price
    //    (guarantees thirtyDayLow < baseline → checker fires)
    const baseline = parseFloat((syntheticPrice * 2).toFixed(2));
    const [pref] = await db
      .insert(alertPrefsTable)
      .values({
        userId,
        trackedItemId: trackedId,
        alertType:     "price_drop_low" as "price_drop_low",
        baselineValue: baseline.toFixed(2),
        enabled:       true,
      })
      .returning();

    steps.push(`Created alert_pref id=${pref.id} (type=price_drop_low) with baseline $${baseline.toFixed(2)}`);
    steps.push(`Expected: $${syntheticPrice} < $${baseline} → should fire`);

    // 6. Run the full alert check
    steps.push("Running checkAlerts()…");
    await checkAlerts();

    // 7. Re-read pref to confirm it fired
    const [updated] = await db
      .select()
      .from(alertPrefsTable)
      .where(eq(alertPrefsTable.id, pref.id))
      .limit(1);

    const fired = updated?.lastNotifiedAt != null;
    steps.push(fired
      ? `✅ Alert fired — lastNotifiedAt=${updated!.lastNotifiedAt!.toISOString()}`
      : "❌ Alert did NOT fire — check logs for reason");

    // 8. Clean up synthetic pref + snapshots
    await db.delete(alertPrefsTable).where(eq(alertPrefsTable.id, pref.id));
    steps.push(`Cleaned up synthetic alert_pref id=${pref.id}`);

    if (syntheticSnapIds.length > 0) {
      await db.delete(priceSnapshotsTable).where(inArray(priceSnapshotsTable.id, syntheticSnapIds));
      steps.push(`Cleaned up ${syntheticSnapIds.length} synthetic snapshot(s): ids=${syntheticSnapIds.join(",")}`);
    }

    res.json({
      ok:           fired,
      email,
      releaseId,
      releaseName:  release.title,
      syntheticPrice,
      baseline,
      steps,
    });
  } catch (err) {
    // Best-effort cleanup on error
    if (syntheticSnapIds.length > 0) {
      await db.delete(priceSnapshotsTable)
        .where(inArray(priceSnapshotsTable.id, syntheticSnapIds))
        .catch(() => {});
    }
    logger.error({ err }, "devTools: test-30day-low-alert error");
    res.status(500).json({ error: String(err), steps });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/dev/backfill-unknown-platforms
//
// One-time backfill: scans all releases with platforms = {Unknown} and either
// extracts the platform from the title or clears the Unknown sentinel to [].
//
// Safe to call multiple times — already-fixed rows are simply not found.
// Returns a JSON summary of every row touched.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/dev/backfill-unknown-platforms", async (_req, res) => {
  try {
    const result = await backfillUnknownPlatforms();
    res.json({
      ok: true,
      total:   result.total,
      updated: result.updated,
      cleared: result.cleared,
    });
  } catch (err) {
    logger.error({ err }, "devTools: backfill-unknown-platforms error");
    res.status(500).json({ error: String(err) });
  }
});

export default router;
