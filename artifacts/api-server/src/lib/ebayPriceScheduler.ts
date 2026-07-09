/**
 * eBay Price Scheduler — background job that refreshes eBay prices for
 * sold-out releases on a fixed, quota-conscious interval.
 *
 * ── Design rationale ────────────────────────────────────────────────────────
 *
 * eBay Browse API quota: 5,000 calls / month.
 * Prices are only meaningful for the "Recently Sold Out" category — collectors
 * look for secondary-market prices, not publisher prices (already shown for
 * available/pre-order titles). Currently-available releases already display the
 * publisher's own price, so eBay lookups there add no value.
 *
 * ── Quota calculation (as of current catalog size) ─────────────────────────
 *
 *   Sold-out titles:    ~331 (verified July 2026)
 *   Safety budget:      75% of 5,000 = 3,750 calls / month
 *
 *   Interval  │ Runs/month │ Calls/month │ Status
 *   ──────────┼────────────┼─────────────┼──────────────────────────────────
 *   Every 24h │    30      │   9,930     │ ✗ exceeds quota
 *   Every 48h │    15      │   4,965     │ ✗ exceeds safety budget
 *   Every 72h │    10      │   3,310     │ ✓ safe  (headroom to ~375 titles)
 *   Every 96h │     7.5    │   2,483     │ ✓ safe  (headroom to ~500 titles)
 *
 *   Default interval: 72 hours. When the sold-out catalog exceeds ~375 titles,
 *   set EBAY_PRICE_REFRESH_INTERVAL_MS to 345600000 (96 h) via Replit Secrets.
 *
 * ── Traffic isolation ───────────────────────────────────────────────────────
 *
 *   This scheduler is the ONLY code that calls the eBay Browse API.
 *   Visitor-facing request handlers read prices exclusively from the
 *   `releases.ebay_price` DB column written here. No visitor action of any
 *   kind (page load, search, filter, button click) can trigger an eBay API
 *   call.
 *
 * ── Override via env vars ───────────────────────────────────────────────────
 *
 *   EBAY_PRICE_REFRESH_INTERVAL_MS — override the refresh interval (ms).
 *                                    Default: 259200000 (72 h).
 *   EBAY_CALL_DELAY_MS             — pause between individual title lookups
 *                                    to avoid burst rate-limiting.
 *                                    Default: 2000 (2 s).
 */

import { eq } from "drizzle-orm";
import { db, releasesTable } from "@workspace/db";
import { logger } from "./logger";
import { getEbayLowestPrice, ebayBrowseConfigured } from "./ebayBrowseClient";

/** Default refresh interval: 72 hours. */
const DEFAULT_INTERVAL_MS = 72 * 60 * 60 * 1_000;

const REFRESH_INTERVAL_MS =
  parseInt(process.env.EBAY_PRICE_REFRESH_INTERVAL_MS ?? "") || DEFAULT_INTERVAL_MS;

/** Pause between individual title lookups to avoid burst rate-limiting. */
const CALL_DELAY_MS =
  parseInt(process.env.EBAY_CALL_DELAY_MS ?? "") || 2_000;

let ebayInterval: ReturnType<typeof setInterval> | null = null;

// ── Core refresh logic ────────────────────────────────────────────────────────

async function refreshEbayPrices(): Promise<void> {
  logger.info("eBay price refresh starting — querying sold-out titles");

  const soldOut = await db
    .select({ id: releasesTable.id, title: releasesTable.title })
    .from(releasesTable)
    .where(eq(releasesTable.status, "sold_out"));

  logger.info(
    { count: soldOut.length, intervalHours: REFRESH_INTERVAL_MS / 3_600_000 },
    "eBay price refresh: fetching prices for sold-out catalog"
  );

  let updated = 0;
  let noData  = 0;
  let failed  = 0;

  for (const release of soldOut) {
    try {
      const price = await getEbayLowestPrice(release.title);
      await db
        .update(releasesTable)
        .set({ ebayPrice: price, ebayPriceUpdatedAt: new Date() })
        .where(eq(releasesTable.id, release.id));

      if (price !== null) updated++; else noData++;
    } catch (err) {
      logger.warn({ err, releaseId: release.id, title: release.title },
        "eBay price fetch failed for title");
      failed++;
    }

    // Respectful pacing — avoid burst rate-limiting across hundreds of calls
    await new Promise(r => setTimeout(r, CALL_DELAY_MS));
  }

  logger.info({ updated, noData, failed, total: soldOut.length },
    "eBay price refresh complete");
}

// ── Scheduler lifecycle ───────────────────────────────────────────────────────

export function startEbayPriceScheduler(): void {
  if (!ebayBrowseConfigured) {
    logger.info(
      "EBAY_APP_ID / EBAY_CLIENT_SECRET not set — eBay price scheduler disabled. " +
      "Add these secrets to activate scheduled price refresh."
    );
    return;
  }

  const intervalHours = (REFRESH_INTERVAL_MS / 3_600_000).toFixed(1);
  logger.info({ intervalHours }, "Starting eBay price scheduler");

  // First run: wait 90 s after startup so the initial publisher scrape has time
  // to populate the catalog before we start pricing it.
  setTimeout(() => {
    refreshEbayPrices().catch(err =>
      logger.error({ err }, "Initial eBay price refresh failed")
    );
  }, 90_000);

  // Subsequent runs on the fixed interval
  ebayInterval = setInterval(() => {
    refreshEbayPrices().catch(err =>
      logger.error({ err }, "Scheduled eBay price refresh failed")
    );
  }, REFRESH_INTERVAL_MS);
}

export function stopEbayPriceScheduler(): void {
  if (ebayInterval) {
    clearInterval(ebayInterval);
    ebayInterval = null;
    logger.info("eBay price scheduler stopped");
  }
}
