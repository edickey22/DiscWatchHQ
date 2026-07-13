/**
 * Console Listings Scheduler — background job that refreshes multi-listing
 * live eBay data for every curated console model on a fixed, quota-conscious
 * interval.
 *
 * ── Design rationale ────────────────────────────────────────────────────────
 *
 * This is the ONLY code that calls the eBay Browse API for console listings.
 * Visitor-facing request handlers (routes/consoles.ts) read exclusively from
 * consoleListingsCache.ts. No visitor action (page load, navigating to a
 * console detail page, etc.) can trigger an eBay API call.
 *
 * One Browse API call fetches up to 30 raw candidates for a model in a
 * single request — showing multiple listings per console costs no extra
 * API calls versus the previous single-cheapest-listing design; the cost is
 * exactly 1 call per model per refresh cycle.
 *
 * ── Quota calculation ───────────────────────────────────────────────────────
 *
 *   eBay Browse API quota: 5,000 calls / month, shared with ebayPriceScheduler
 *   (which uses ~3,310 calls/month at its default 72h interval for ~331
 *   sold-out titles).
 *
 *   Console models: 24 (see consoleModels.ts)
 *
 *   Interval  │ Runs/month │ Calls/month │ Combined w/ price scheduler
 *   ──────────┼────────────┼─────────────┼──────────────────────────────────
 *   Every 6h  │    120     │    2,880    │ ✗ 6,190 total — exceeds quota
 *   Every 12h │     60     │    1,440    │ ✗ 4,750 total — too little headroom
 *   Every 24h │     30     │      720    │ ✓ 4,030 total — safe, ~80% of quota
 *
 *   Default interval: 24 hours. Console listings don't need to update more
 *   often than daily — override via CONSOLE_LISTINGS_REFRESH_INTERVAL_MS if
 *   the price scheduler's budget changes.
 *
 * ── Override via env vars ───────────────────────────────────────────────────
 *
 *   CONSOLE_LISTINGS_REFRESH_INTERVAL_MS — override the refresh interval (ms).
 *                                          Default: 86400000 (24 h).
 *   EBAY_CALL_DELAY_MS                   — pause between individual model
 *                                          lookups (shared with the price
 *                                          scheduler's setting). Default: 2000.
 */

import { logger } from "./logger";
import { CONSOLE_MODELS } from "./consoleModels";
import { getEbayConsoleListings, ebayConsolesConfigured } from "./ebayConsolesClient";
import { setConsoleListings } from "./consoleListingsCache";

/** Default refresh interval: 24 hours. */
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1_000;

const REFRESH_INTERVAL_MS =
  parseInt(process.env.CONSOLE_LISTINGS_REFRESH_INTERVAL_MS ?? "") || DEFAULT_INTERVAL_MS;

/** Pause between individual model lookups to avoid burst rate-limiting. */
const CALL_DELAY_MS =
  parseInt(process.env.EBAY_CALL_DELAY_MS ?? "") || 2_000;

let consoleListingsInterval: ReturnType<typeof setInterval> | null = null;

async function refreshConsoleListings(): Promise<void> {
  logger.info(
    { count: CONSOLE_MODELS.length, intervalHours: REFRESH_INTERVAL_MS / 3_600_000 },
    "Console listings refresh starting",
  );

  let updated = 0;
  let empty   = 0;
  let failed  = 0;

  for (const model of CONSOLE_MODELS) {
    try {
      const listings = await getEbayConsoleListings(model.query, model.generation);
      setConsoleListings(model.id, listings);
      if (listings.length > 0) updated++; else empty++;
    } catch (err) {
      logger.warn({ err, consoleId: model.id }, "Console listings fetch failed");
      failed++;
      // Still record an empty result so the cache reflects "fetched, no data"
      // rather than leaving stale data indefinitely on repeated failures.
      setConsoleListings(model.id, []);
    }

    await new Promise(r => setTimeout(r, CALL_DELAY_MS));
  }

  logger.info({ updated, empty, failed, total: CONSOLE_MODELS.length },
    "Console listings refresh complete");
}

export function startConsoleListingsScheduler(): void {
  if (!ebayConsolesConfigured) {
    logger.info(
      "EBAY_APP_ID / EBAY_CLIENT_SECRET not set — console listings scheduler disabled. " +
      "Add these secrets to activate scheduled live listings.",
    );
    return;
  }

  const intervalHours = (REFRESH_INTERVAL_MS / 3_600_000).toFixed(1);
  logger.info({ intervalHours }, "Starting console listings scheduler");

  // First run: wait 30s after startup — independent of the eBay price
  // scheduler's 90s delay so the two don't burst-call the API at the same
  // instant on cold start.
  setTimeout(() => {
    refreshConsoleListings().catch(err =>
      logger.error({ err }, "Initial console listings refresh failed"),
    );
  }, 30_000);

  consoleListingsInterval = setInterval(() => {
    refreshConsoleListings().catch(err =>
      logger.error({ err }, "Scheduled console listings refresh failed"),
    );
  }, REFRESH_INTERVAL_MS);
}

export function stopConsoleListingsScheduler(): void {
  if (consoleListingsInterval) {
    clearInterval(consoleListingsInterval);
    consoleListingsInterval = null;
    logger.info("Console listings scheduler stopped");
  }
}
