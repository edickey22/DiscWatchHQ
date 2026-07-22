/**
 * alertChecker.ts — checks tracked items against user alert preferences and
 * triggers email notifications when a condition is met.
 *
 * ── How it works ──────────────────────────────────────────────────────────────
 * 1. Fetch all enabled alert_prefs with their joined tracked_item and user email.
 * 2. For each pref, retrieve the current status/price of the item from the DB.
 * 3. Compare current value to baseline_value stored at opt-in time.
 * 4. If the condition is triggered and last_notified_at is > 24h ago (or null),
 *    send an alert email and update last_notified_at.
 *
 * ── Email sending ──────────────────────────────────────────────────────────────
 * All email sending goes through sendAlertEmail() in src/lib/email.ts.
 * That function is fully implemented but requires SMTP credentials.
 * See email.ts for the Resend integration point.
 *
 * ── Scheduling ────────────────────────────────────────────────────────────────
 * Called from src/index.ts on server start and then on a periodic interval.
 * Frequency: every 4 hours. Not a concern for quota since all lookups are DB reads.
 */

import { db } from "@workspace/db";
import {
  alertPrefsTable,
  trackedItemsTable,
  usersTable,
  releasesTable,
} from "@workspace/db/schema";
import { eq, and, or, isNull, lt } from "drizzle-orm";
import { sendAlertEmail } from "./email";
import { logger } from "./logger";

const APP_URL = process.env.APP_URL ?? "https://discwatchhq.com";
const NOTIFY_COOLOFF_MS = 24 * 60 * 60 * 1000; // 24 h between alerts for same item

// ── Main check function ───────────────────────────────────────────────────────

export async function checkAlerts(): Promise<void> {
  logger.info("alertChecker: starting check");

  try {
    const cooloffCutoff = new Date(Date.now() - NOTIFY_COOLOFF_MS);

    // Load all enabled prefs where cooloff has passed
    const prefs = await db
      .select({
        pref:  alertPrefsTable,
        item:  trackedItemsTable,
        email: usersTable.email,
      })
      .from(alertPrefsTable)
      .innerJoin(trackedItemsTable, eq(alertPrefsTable.trackedItemId, trackedItemsTable.id))
      .innerJoin(usersTable, eq(alertPrefsTable.userId, usersTable.id))
      .where(
        and(
          eq(alertPrefsTable.enabled, true),
          or(
            isNull(alertPrefsTable.lastNotifiedAt),
            lt(alertPrefsTable.lastNotifiedAt, cooloffCutoff),
          ),
        ),
      );

    logger.info({ count: prefs.length }, "alertChecker: prefs to check");

    for (const { pref, item, email } of prefs) {
      try {
        await checkSingleAlert({ pref, item, email });
      } catch (err) {
        logger.error({ err, prefId: pref.id }, "alertChecker: error checking pref");
      }
    }
  } catch (err) {
    logger.error({ err }, "alertChecker: fatal error");
  }
}

// ── Per-alert logic ───────────────────────────────────────────────────────────

async function checkSingleAlert(ctx: {
  pref:  typeof alertPrefsTable.$inferSelect;
  item:  typeof trackedItemsTable.$inferSelect;
  email: string;
}): Promise<void> {
  const { pref, item, email } = ctx;
  const itemData = item.itemData as Record<string, unknown>;

  let shouldNotify = false;
  let detail       = "";
  let itemUrl      = APP_URL;

  // ── Release alerts (restock / status_change) ──────────────────────────────
  if (item.itemType === "release") {
    const releaseId = Number(item.itemId);
    if (Number.isNaN(releaseId)) return;

    const [release] = await db
      .select({ status: releasesTable.status, title: releasesTable.title })
      .from(releasesTable)
      .where(eq(releasesTable.id, releaseId))
      .limit(1);

    if (!release) return;

    itemUrl = `${APP_URL}/boutique`;

    if (pref.alertType === "restock" && pref.baselineValue !== "in_stock") {
      if (release.status === "in_stock") {
        shouldNotify = true;
        detail = `"${release.title}" is now available for order.`;
      }
    } else if (pref.alertType === "status_change") {
      if (release.status !== pref.baselineValue) {
        shouldNotify = true;
        detail = `"${release.title}" status changed to: ${release.status.replace("_", " ")}.`;
        // Update baseline so we don't re-notify on the same status
        await db
          .update(alertPrefsTable)
          .set({ baselineValue: release.status })
          .where(eq(alertPrefsTable.id, pref.id));
      }
    }
  }

  // ── Game alerts (price_drop) ──────────────────────────────────────────────
  // Games don't have a stored current price in the DB — they link out to
  // retailers. Price drop alerts for games are best-effort based on whether
  // the RAWG metadata changed; a full price-drop check would need a price
  // scrape pass, which is out of scope for Phase 3.
  // TODO: wire in a live price check when a price-scraping layer is added.
  if (item.itemType === "game") {
    // Placeholder: log that we'd check here
    logger.debug({ itemId: item.itemId }, "alertChecker: game price check not yet implemented");
    return;
  }

  // ── Console alerts (price_drop) ──────────────────────────────────────────
  // Console listings come from eBay; price comparison would need the current
  // lowest listing price from the console listings cache.
  // TODO: integrate with consoleListingsCache when price tracking is added.
  if (item.itemType === "console") {
    logger.debug({ itemId: item.itemId }, "alertChecker: console price check not yet implemented");
    return;
  }

  // ── Send notification ─────────────────────────────────────────────────────
  if (!shouldNotify) return;

  const title = (itemData.title as string | undefined) ?? "Tracked item";

  await sendAlertEmail({
    to:        email,
    itemTitle: title,
    alertType: pref.alertType as "restock" | "price_drop" | "status_change",
    detail,
    itemUrl,
  });

  await db
    .update(alertPrefsTable)
    .set({ lastNotifiedAt: new Date() })
    .where(eq(alertPrefsTable.id, pref.id));

  logger.info({ prefId: pref.id, email, alertType: pref.alertType }, "alertChecker: alert sent");
}

// ── Scheduler entry point ─────────────────────────────────────────────────────

export function startAlertChecker(): void {
  const INTERVAL_MS = 4 * 60 * 60 * 1000; // every 4 hours

  // First run: 2 minutes after server start (avoids startup burst)
  setTimeout(() => {
    void checkAlerts();
    setInterval(() => void checkAlerts(), INTERVAL_MS);
  }, 2 * 60 * 1000);

  logger.info("alertChecker: scheduler registered (4h interval, first run in 2m)");
}
