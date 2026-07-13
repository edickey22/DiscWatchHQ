/**
 * eBay Price Scheduler — background job that refreshes eBay prices for
 * sold-out releases on a fixed interval, with an enforced daily call budget.
 *
 * ── Design rationale ────────────────────────────────────────────────────────
 *
 * Prices are only meaningful for the "Recently Sold Out" category — collectors
 * look for secondary-market prices, not publisher prices (already shown for
 * available/pre-order titles). Currently-available releases already display the
 * publisher's own price, so eBay lookups there add no value.
 *
 * ── Quota enforcement ───────────────────────────────────────────────────────
 *
 * The actual enforced ceiling is ebayBudget.ts's persisted daily call budget
 * (see that file — its own header explains why the previous "5,000 calls /
 * month" comment here was an unverified placeholder, not a confirmed eBay
 * limit). getEbayLowestPrice() checks and reserves against that budget on
 * every call and returns null once the "price" allocation is exhausted for
 * the day, so this scheduler degrades gracefully rather than needing its own
 * separate quota math.
 *
 * Two independent safety nets on top of the shared budget:
 *   - MAX_TITLES_PER_RUN caps how many sold-out titles a single run will
 *     process, regardless of how large the sold-out catalog grows.
 *   - EbayRateLimitError (thrown by ebayBrowseClient.ts on an actual HTTP 429
 *     from eBay) aborts the rest of the current run immediately instead of
 *     continuing to hammer an API that's already throttling us.
 *
 *   Default interval: 72 hours. Sold-out titles as of July 2026: ~331.
 *
 * ── Traffic isolation ───────────────────────────────────────────────────────
 *
 *   This scheduler is the ONLY code that calls getEbayLowestPrice().
 *   Visitor-facing request handlers read prices exclusively from the
 *   `releases.ebay_price` DB column written here. No visitor action of any
 *   kind (page load, search, filter, button click) can trigger an eBay API
 *   call from this scheduler's code path.
 *
 * ── Override via env vars ───────────────────────────────────────────────────
 *
 *   EBAY_PRICE_REFRESH_INTERVAL_MS  — override the refresh interval (ms).
 *                                     Default: 259200000 (72 h).
 *   EBAY_CALL_DELAY_MS              — pause between individual title lookups
 *                                     to avoid burst rate-limiting.
 *                                     Default: 2000 (2 s).
 *   EBAY_PRICE_MAX_TITLES_PER_RUN   — hard cap on titles processed per run.
 *                                     Default: 400.
 *   EBAY_DAILY_CALL_BUDGET          — see ebayBudget.ts. Default: 500 total
 *                                     across price/console/catalog callers.
 */

import { eq } from "drizzle-orm";
import { db, releasesTable } from "@workspace/db";
import { logger } from "./logger";
import { getEbayLowestPrice, ebayBrowseConfigured, EbayRateLimitError } from "./ebayBrowseClient";

/** Default refresh interval: 72 hours. */
const DEFAULT_INTERVAL_MS = 72 * 60 * 60 * 1_000;

const REFRESH_INTERVAL_MS =
  parseInt(process.env.EBAY_PRICE_REFRESH_INTERVAL_MS ?? "") || DEFAULT_INTERVAL_MS;

/** Pause between individual title lookups to avoid burst rate-limiting. */
const CALL_DELAY_MS =
  parseInt(process.env.EBAY_CALL_DELAY_MS ?? "") || 2_000;

/**
 * Hard ceiling on how many sold-out titles a single run will process,
 * independent of how large the sold-out catalog grows over time. Without
 * this, catalog growth alone (no code change) would silently increase the
 * API calls made per run forever. Titles beyond this cap simply wait for
 * the next run rather than being processed in the same pass — a growing
 * backlog is visible in logs (see `skipped` below) rather than invisible.
 */
const MAX_TITLES_PER_RUN =
  parseInt(process.env.EBAY_PRICE_MAX_TITLES_PER_RUN ?? "") || 400;

let ebayInterval: ReturnType<typeof setInterval> | null = null;

// ── Core refresh logic ────────────────────────────────────────────────────────

async function refreshEbayPrices(): Promise<void> {
  logger.info("eBay price refresh starting — querying sold-out titles");

  const allSoldOut = await db
    .select({ id: releasesTable.id, title: releasesTable.title })
    .from(releasesTable)
    .where(eq(releasesTable.status, "sold_out"));

  const soldOut = allSoldOut.slice(0, MAX_TITLES_PER_RUN);
  const skipped = allSoldOut.length - soldOut.length;

  logger.info(
    { count: soldOut.length, skipped, cap: MAX_TITLES_PER_RUN, intervalHours: REFRESH_INTERVAL_MS / 3_600_000 },
    "eBay price refresh: fetching prices for sold-out catalog"
  );
  if (skipped > 0) {
    logger.warn(
      { skipped, cap: MAX_TITLES_PER_RUN },
      "eBay price refresh: sold-out catalog exceeds per-run cap — excess titles deferred to next run"
    );
  }

  let updated   = 0;
  let noData    = 0;
  let failed    = 0;
  let rateLimited = false;

  for (const release of soldOut) {
    try {
      const price = await getEbayLowestPrice(release.title);
      await db
        .update(releasesTable)
        .set({ ebayPrice: price, ebayPriceUpdatedAt: new Date() })
        .where(eq(releasesTable.id, release.id));

      if (price !== null) updated++; else noData++;
    } catch (err) {
      if (err instanceof EbayRateLimitError) {
        logger.error(
          { releaseId: release.id, title: release.title, processed: updated + noData + failed, remaining: soldOut.length - (updated + noData + failed) },
          "eBay price refresh: rate limited by eBay — aborting rest of this run"
        );
        rateLimited = true;
        break;
      }
      logger.warn({ err, releaseId: release.id, title: release.title },
        "eBay price fetch failed for title");
      failed++;
    }

    // Respectful pacing — avoid burst rate-limiting across hundreds of calls
    await new Promise(r => setTimeout(r, CALL_DELAY_MS));
  }

  logger.info({ updated, noData, failed, rateLimited, total: soldOut.length },
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
