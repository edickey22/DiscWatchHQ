/**
 * Console Listings Scheduler — background job that refreshes multi-listing
 * live eBay data for every curated console model on a fixed interval, with
 * an enforced daily call budget.
 *
 * ── Design rationale ────────────────────────────────────────────────────────
 *
 * This is the ONLY code that calls getEbayConsoleListings(). Visitor-facing
 * request handlers (routes/consoles.ts) read exclusively from
 * consoleListingsCache.ts. No visitor action (page load, navigating to a
 * console detail page, etc.) can trigger an eBay API call.
 *
 * One Browse API call fetches up to 200 raw candidates for a model in a
 * single request (the Browse API's max page size) — showing more listings
 * per console costs no extra API calls; the cost is exactly 1 call per
 * model per refresh cycle regardless of how many raw candidates or filtered
 * results come back.
 *
 * ── Quota enforcement ───────────────────────────────────────────────────────
 *
 * The actual enforced ceiling is ebayBudget.ts's persisted daily call budget
 * (see that file for why the old "5,000 calls / month, ~80% of quota"
 * comment that used to live here was an unverified placeholder rather than
 * a confirmed eBay limit). getEbayConsoleListings() checks and reserves
 * against that budget before every call and returns [] once the "console"
 * allocation is exhausted for the day.
 *
 * An EbayRateLimitError (thrown by ebayConsolesClient.ts on an actual HTTP
 * 429 from eBay) aborts the rest of the current run immediately instead of
 * continuing to loop through the remaining console models.
 *
 *   Console models: 24 (see consoleModels.ts). Default interval: 24 hours —
 *   console listings don't need to update more often than daily.
 *
 * ── Override via env vars ───────────────────────────────────────────────────
 *
 *   CONSOLE_LISTINGS_REFRESH_INTERVAL_MS — override the refresh interval (ms).
 *                                          Default: 86400000 (24 h).
 *   EBAY_CALL_DELAY_MS                   — pause between individual model
 *                                          lookups (shared with the price
 *                                          scheduler's setting). Default: 2000.
 *   EBAY_DAILY_CALL_BUDGET               — see ebayBudget.ts. Default: 500
 *                                          total across price/console/catalog.
 */

import { logger } from "./logger";
import { CONSOLE_MODELS } from "./consoleModels";
import { getEbayConsoleListings, ebayConsolesConfigured } from "./ebayConsolesClient";
import { EbayRateLimitError } from "./ebayBrowseClient";
import { setConsoleListings, getConsoleListingsEntry, loadPersistedConsoleListings } from "./consoleListingsCache";

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

  let updated     = 0;
  let empty       = 0;
  let failed      = 0;
  let skipped     = 0;
  let rateLimited = false;

  for (const model of CONSOLE_MODELS) {
    // Skip models refreshed recently enough to still be within the normal
    // refresh cadence — this is what stops every dev restart from burning a
    // fresh 26-call cycle out of the shared daily eBay budget for data that
    // was already fetched an hour ago (see consoleListingsCache.ts).
    //
    // Exception: an entry that came back EMPTY is never treated as "still
    // fresh" — a 0-listing result is far more often a transient fetch
    // failure (timeout, momentary throttling) than genuine zero inventory
    // for a real console model, and previously got stuck showing "no
    // listings" to visitors for a full 24h with no way to recover before
    // the next scheduled cycle. Always retry empty models on the next run
    // (subject to the same budget) so a bad fetch self-heals quickly
    // instead of persisting for a whole day.
    const existing = getConsoleListingsEntry(model.id);
    if (existing && existing.listings.length > 0 && Date.now() - existing.updatedAt < REFRESH_INTERVAL_MS) {
      skipped++;
      continue;
    }

    try {
      const listings = await getEbayConsoleListings(model);
      setConsoleListings(model.id, listings);
      if (listings.length > 0) updated++; else empty++;
    } catch (err) {
      if (err instanceof EbayRateLimitError) {
        logger.error(
          { consoleId: model.id, processed: updated + empty + failed, remaining: CONSOLE_MODELS.length - (updated + empty + failed) },
          "Console listings refresh: rate limited by eBay — aborting rest of this run"
        );
        rateLimited = true;
        break;
      }
      logger.warn({ err, consoleId: model.id }, "Console listings fetch failed");
      failed++;
      // Still record an empty result so the cache reflects "fetched, no data"
      // rather than leaving stale data indefinitely on repeated failures.
      setConsoleListings(model.id, []);
    }

    await new Promise(r => setTimeout(r, CALL_DELAY_MS));
  }

  logger.info({ updated, empty, failed, skipped, rateLimited, total: CONSOLE_MODELS.length },
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
  // instant on cold start. Load the persisted snapshot first so a restart
  // recognizes models refreshed earlier today as still-fresh instead of
  // re-fetching all of them (see consoleListingsCache.ts).
  setTimeout(() => {
    loadPersistedConsoleListings()
      .then(() => refreshConsoleListings())
      .catch(err => logger.error({ err }, "Initial console listings refresh failed"));
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
