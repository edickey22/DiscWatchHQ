/**
 * alertChecker.ts — checks tracked items against user alert preferences and
 * triggers email notifications when a condition is met.
 *
 * ── How it works ──────────────────────────────────────────────────────────────
 * 1. Fetch all enabled alert_prefs with their joined tracked_item and user email.
 * 2. For each pref, retrieve the current status/price of the item.
 * 3. Compare current value to baseline_value stored at opt-in time (or at the
 *    last notification, whichever is more recent).
 * 4. If the condition is triggered and last_notified_at is > 24h ago (or null),
 *    send an alert email and update last_notified_at.
 *
 * ── Alert types by item type ──────────────────────────────────────────────────
 *
 *   release  → restock        fires when status changes to "in_stock"
 *   release  → status_change  fires on any status change vs baseline
 *   game     → price_drop     fires when lowest live retailer price drops ≥10%
 *                             below the stored baseline. Baseline is auto-
 *                             initialised on the first check run (skips notify,
 *                             records current price as baseline so future runs
 *                             have a reference point). Updates baseline to the
 *                             new lower price after firing so the next alert
 *                             requires a further drop (no repeat spam).
 *                             Source: Best Buy Products API + Amazon PA-API
 *                             (in-process 4-hour cache). No-ops silently when
 *                             neither pricing API is configured.
 *   console  → price_drop     same 10% threshold; price = lowest eBay Buy-It-Now
 *                             listing across all cached ConsoleListing entries
 *                             (auction bids excluded from baseline — uses
 *                             BIN price only for stable comparison).
 *                             Source: ebayConsolesClient / consoleListingsCache
 *                             (persisted across restarts; re-fetched every 24h).
 *
 * ── Email sending ──────────────────────────────────────────────────────────────
 * All email sending goes through sendAlertEmail() in src/lib/email.ts.
 * Requires SMTP_HOST / SMTP_USER / SMTP_PASS secrets; logs in stub mode if absent.
 *
 * ── Scheduling ────────────────────────────────────────────────────────────────
 * Called from src/index.ts on server start and then on a periodic interval.
 * Frequency: every 4 hours. Caches are warm by then so external API calls are
 * rare — primarily DB reads.
 */

import { db } from "@workspace/db";
import {
  alertPrefsTable,
  trackedItemsTable,
  usersTable,
  releasesTable,
  priceSnapshotsTable,
} from "@workspace/db/schema";
// NOTE: releasesTable.ebayPrice is used for boutique release price-drop alerts.
import { eq, and, or, isNull, lt, gte, sql } from "drizzle-orm";
import { sendAlertEmail } from "./email";
import { logger } from "./logger";
import { fetchLivePricing } from "./catalogLivePricing";
import { getConsoleListingsEntry } from "./consoleListingsCache";

const APP_URL = process.env.APP_URL ?? "https://discwatchhq.com";
const NOTIFY_COOLOFF_MS = 24 * 60 * 60 * 1000; // 24 h between alerts for same item

/**
 * Price-drop threshold: alert fires when current price is this fraction or
 * more below the stored baseline. 0.90 = 10% drop required.
 * Chosen to avoid noise from minor retailer repricing while catching real
 * sales / price cuts (a $60 game would need to drop to ≤$54 to trigger).
 */
const PRICE_DROP_THRESHOLD = 0.90;

// ── Main check function ───────────────────────────────────────────────────────

export async function checkAlerts(): Promise<void> {
  logger.info("alertChecker: starting check");

  try {
    const cooloffCutoff = new Date(Date.now() - NOTIFY_COOLOFF_MS);

    // Load all enabled prefs where cooloff has passed
    const prefs = await db
      .select({
        pref:        alertPrefsTable,
        item:        trackedItemsTable,
        email:       usersTable.email,
        displayName: usersTable.displayName,
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

    for (const { pref, item, email, displayName } of prefs) {
      try {
        await checkSingleAlert({ pref, item, email, displayName });
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
  pref:        typeof alertPrefsTable.$inferSelect;
  item:        typeof trackedItemsTable.$inferSelect;
  email:       string;
  displayName: string | null;
}): Promise<void> {
  const { pref, item, email, displayName } = ctx;
  const itemData = item.itemData as Record<string, unknown>;
  const title    = (itemData.title as string | undefined) ?? "Tracked item";

  let shouldNotify = false;
  let detail       = "";
  let itemUrl      = APP_URL;
  let imageUrl: string | null = null;

  // ── Release alerts (restock / status_change / price_drop) ───────────────
  if (item.itemType === "release") {
    const releaseId = Number(item.itemId);
    if (Number.isNaN(releaseId)) return;

    const [release] = await db
      .select({
        status:        releasesTable.status,
        title:         releasesTable.title,
        ebayPrice:     releasesTable.ebayPrice,
        coverImageUrl: releasesTable.coverImageUrl,
      })
      .from(releasesTable)
      .where(eq(releasesTable.id, releaseId))
      .limit(1);

    if (!release) return;

    itemUrl  = `${APP_URL}/boutique`;
    imageUrl = release.coverImageUrl ?? null;

    if (pref.alertType === "restock" && pref.baselineValue !== "available") {
      if (release.status === "available") {
        shouldNotify = true;
        detail = `"${release.title}" is now available for order.`;
      }
    } else if (pref.alertType === "status_change") {
      if (release.status !== pref.baselineValue) {
        shouldNotify = true;
        detail = `"${release.title}" status changed to: ${release.status.replace(/_/g, " ")}.`;
        // Update baseline so we don't re-notify on the same status
        await db
          .update(alertPrefsTable)
          .set({ baselineValue: release.status })
          .where(eq(alertPrefsTable.id, pref.id));
      }
    } else if (pref.alertType === "price_drop") {
      // ── Boutique release resale price-drop ──────────────────────────────────
      // Source: releases.ebay_price — lowest eBay BIN for this release, written
      // by ebayPriceScheduler on a 72-hour cycle. Only exists for sold_out items
      // with active secondary-market listings. Null until first scheduler run.
      if (release.ebayPrice == null) {
        logger.debug(
          { itemId: item.itemId },
          "alertChecker: release has no eBay resale price yet — skipping",
        );
        return;
      }

      const currentPrice = release.ebayPrice;

      // First run: no baseline — record current price and skip notification.
      if (!pref.baselineValue) {
        await db
          .update(alertPrefsTable)
          .set({ baselineValue: currentPrice.toFixed(2) })
          .where(eq(alertPrefsTable.id, pref.id));
        logger.info(
          { itemId: item.itemId, baselinePrice: currentPrice },
          "alertChecker: release eBay price baseline initialised",
        );
        return;
      }

      const baselinePrice = parseFloat(pref.baselineValue);
      if (isNaN(baselinePrice) || baselinePrice <= 0) return;

      // Fire if resale price is ≥10% below the stored baseline
      if (currentPrice <= baselinePrice * PRICE_DROP_THRESHOLD) {
        const saved = (baselinePrice - currentPrice).toFixed(2);
        detail = `Resale price dropped from $${baselinePrice.toFixed(2)} to $${currentPrice.toFixed(2)} — you save $${saved}.`;
        shouldNotify = true;

        // Lower baseline so the next alert requires a further drop
        await db
          .update(alertPrefsTable)
          .set({ baselineValue: currentPrice.toFixed(2) })
          .where(eq(alertPrefsTable.id, pref.id));
      }

    } else if (pref.alertType === "price_drop_low") {
      // ── New 30-day eBay low ──────────────────────────────────────────────────
      // Source: price_snapshots (item_type="release_ebay"), written by
      // ebayPriceScheduler on a 72-hour cycle.
      //
      // Logic:
      //   1. Query the 30-day window of non-null snapshots.
      //   2. Require ≥7 days of history (oldest snapshot ≤ 7 days ago) so the
      //      window is representative before any alert fires.
      //   3. On first run: record the 30-day min as baseline_value, skip notify.
      //   4. Fire when current 30-day min is strictly below the stored baseline.
      //   5. After firing: lower baseline to new min so the next alert requires
      //      a further drop (no repeat spam at the same low).
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000);

      const [stats] = await db
        .select({
          minPrice:   sql<number | null>`min(${priceSnapshotsTable.priceUsd})`,
          oldestSnap: sql<Date>`min(${priceSnapshotsTable.snappedAt})`,
        })
        .from(priceSnapshotsTable)
        .where(
          and(
            eq(priceSnapshotsTable.itemType, "release_ebay"),
            eq(priceSnapshotsTable.itemId, String(releaseId)),
            gte(priceSnapshotsTable.snappedAt, thirtyDaysAgo),
            sql`${priceSnapshotsTable.priceUsd} is not null`,
          ),
        );

      if (!stats || stats.minPrice == null) {
        logger.debug(
          { itemId: item.itemId },
          "alertChecker: no eBay snapshot history for release — skipping 30d low",
        );
        return;
      }

      // Require ≥7 days of history before the alert can fire
      if (new Date(stats.oldestSnap) > sevenDaysAgo) {
        logger.debug(
          { itemId: item.itemId, oldestSnap: stats.oldestSnap },
          "alertChecker: insufficient snapshot history (<7 days) — skipping 30d low",
        );
        return;
      }

      const thirtyDayLow = stats.minPrice;

      // First run: initialise baseline, skip notification
      if (!pref.baselineValue) {
        await db
          .update(alertPrefsTable)
          .set({ baselineValue: thirtyDayLow.toFixed(2) })
          .where(eq(alertPrefsTable.id, pref.id));
        logger.info(
          { itemId: item.itemId, thirtyDayLow },
          "alertChecker: 30d low baseline initialised",
        );
        return;
      }

      const baselineLow = parseFloat(pref.baselineValue);
      if (isNaN(baselineLow) || baselineLow <= 0) return;

      // ── Rolling-window baseline maintenance ─────────────────────────────────
      // The 30-day window slides forward on every check run. When the snapshot
      // that established the stored low ages out, thirtyDayLow rises above the
      // stored baseline. In that case we silently update the baseline to the
      // current window floor so the NEXT genuine drop fires correctly — without
      // sending an email.
      //
      //   thirtyDayLow < baselineLow  → new all-time low in window → FIRE + update
      //   thirtyDayLow > baselineLow  → old low aged out → quietly reset baseline
      //   thirtyDayLow === baselineLow → window unchanged → no-op
      if (thirtyDayLow < baselineLow) {
        // eBay search link for this release title (with affiliate tag if set)
        const ebayQuery    = encodeURIComponent(`"${release.title}"`);
        const campaignId   = process.env.EBAY_CAMPAIGN_ID;
        const affiliateSfx = campaignId
          ? `&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=${campaignId}&toolid=10001&mkevt=1`
          : "";
        const ebaySearchUrl =
          `https://www.ebay.com/sch/i.html?_nkw=${ebayQuery}&_sacat=139973&LH_BIN=1${affiliateSfx}`;

        detail  = `"${release.title}" hit a new 30-day eBay low: $${thirtyDayLow.toFixed(2)} (previous low was $${baselineLow.toFixed(2)}).`;
        itemUrl = ebaySearchUrl;
        shouldNotify = true;

        // Lower baseline so the next alert requires a further drop
        await db
          .update(alertPrefsTable)
          .set({ baselineValue: thirtyDayLow.toFixed(2) })
          .where(eq(alertPrefsTable.id, pref.id));

      } else if (thirtyDayLow > baselineLow) {
        // The snapshot that established the stored low has aged out of the window.
        // Reset baseline to the current window floor — no email, no notification.
        await db
          .update(alertPrefsTable)
          .set({ baselineValue: thirtyDayLow.toFixed(2) })
          .where(eq(alertPrefsTable.id, pref.id));
        logger.debug(
          { itemId: item.itemId, oldBaseline: baselineLow, newBaseline: thirtyDayLow },
          "alertChecker: 30d low baseline reset upward (old low aged out of window)",
        );
      }
      // thirtyDayLow === baselineLow → window floor unchanged, no action needed.
    }
  }

  // ── Game alerts (price_drop) ──────────────────────────────────────────────
  else if (item.itemType === "game") {
    if (pref.alertType !== "price_drop") return;

    // fetchLivePricing hits Best Buy Products API + Amazon PA-API (4-hour cache).
    // Returns empty object when neither is configured; that's handled below.
    const pricing = await fetchLivePricing(item.itemId, title);

    const prices: number[] = [];
    if (pricing.bestbuy?.price != null && pricing.bestbuy.price > 0) prices.push(pricing.bestbuy.price);
    if (pricing.amazon?.price  != null && pricing.amazon.price  > 0) prices.push(pricing.amazon.price);

    if (prices.length === 0) {
      logger.debug({ itemId: item.itemId }, "alertChecker: no live game pricing available — skipping");
      return;
    }

    const currentPrice = Math.min(...prices);

    // First run: no baseline yet — initialise and skip (don't fire on first check)
    if (!pref.baselineValue) {
      await db
        .update(alertPrefsTable)
        .set({ baselineValue: currentPrice.toFixed(2) })
        .where(eq(alertPrefsTable.id, pref.id));
      logger.info(
        { itemId: item.itemId, baselinePrice: currentPrice },
        "alertChecker: game price baseline initialised",
      );
      return;
    }

    const baselinePrice = parseFloat(pref.baselineValue);
    if (isNaN(baselinePrice) || baselinePrice <= 0) return;

    // Fire if current price is ≥10% below the stored baseline
    if (currentPrice <= baselinePrice * PRICE_DROP_THRESHOLD) {
      const saved = (baselinePrice - currentPrice).toFixed(2);
      detail  = `Price dropped from $${baselinePrice.toFixed(2)} to $${currentPrice.toFixed(2)} — you save $${saved}.`;
      itemUrl = `${APP_URL}/games`;
      shouldNotify = true;

      // Lower the baseline so the next alert requires a further drop
      await db
        .update(alertPrefsTable)
        .set({ baselineValue: currentPrice.toFixed(2) })
        .where(eq(alertPrefsTable.id, pref.id));
    }
  }

  // ── Console alerts (price_drop) ──────────────────────────────────────────
  else if (item.itemType === "console") {
    if (pref.alertType !== "price_drop") return;

    const entry = getConsoleListingsEntry(item.itemId);

    if (!entry || entry.listings.length === 0) {
      logger.debug({ itemId: item.itemId }, "alertChecker: no console listings cached — skipping");
      return;
    }

    // Use the lowest Buy-It-Now price (exclude auctions — bid prices are not
    // stable baselines; a current bid is almost never the final sale price).
    const binListings = entry.listings.filter(l => !l.isAuction);
    const allListings = binListings.length > 0 ? binListings : entry.listings;
    const currentPrice = Math.min(...allListings.map(l => l.price));

    // First run: no baseline yet — initialise and skip
    if (!pref.baselineValue) {
      await db
        .update(alertPrefsTable)
        .set({ baselineValue: currentPrice.toFixed(2) })
        .where(eq(alertPrefsTable.id, pref.id));
      logger.info(
        { itemId: item.itemId, baselinePrice: currentPrice },
        "alertChecker: console price baseline initialised",
      );
      return;
    }

    const baselinePrice = parseFloat(pref.baselineValue);
    if (isNaN(baselinePrice) || baselinePrice <= 0) return;

    // Use the cheapest BIN listing's image as the email hero image.
    // Prefer a listing that actually has an image; fall back to the first overall.
    const listingWithImage = allListings.find(l => l.imageUrl);
    imageUrl = listingWithImage?.imageUrl ?? allListings[0]?.imageUrl ?? null;

    // Fire if lowest BIN listing is ≥10% below baseline
    if (currentPrice <= baselinePrice * PRICE_DROP_THRESHOLD) {
      const saved = (baselinePrice - currentPrice).toFixed(2);
      detail  = `Lowest eBay listing dropped from $${baselinePrice.toFixed(2)} to $${currentPrice.toFixed(2)} — you save $${saved}.`;
      itemUrl = `${APP_URL}/consoles/${item.itemId}`;
      shouldNotify = true;

      // Lower the baseline so the next alert requires a further drop
      await db
        .update(alertPrefsTable)
        .set({ baselineValue: currentPrice.toFixed(2) })
        .where(eq(alertPrefsTable.id, pref.id));
    }
  }

  // ── Send notification ─────────────────────────────────────────────────────
  if (!shouldNotify) return;

  await sendAlertEmail({
    to:          email,
    itemTitle:   title,
    alertType:   pref.alertType as "restock" | "price_drop" | "status_change" | "price_drop_low",
    detail,
    itemUrl,
    imageUrl,
    displayName,
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
