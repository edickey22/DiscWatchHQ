/**
 * /api/consoles — curated console grid + per-console live listings, for the
 * top-level "Consoles" section (separate from Browse Games and Boutique
 * Tracker).
 *
 * GET /api/consoles         → lightweight summary list for the grid page.
 *                              No live listing payloads — cards link to the
 *                              detail route instead of embedding a listing.
 * GET /api/consoles/:id     → full live-listings payload for one console's
 *                              detail page (multiple filtered listings).
 *
 * All live data is served from the in-process cache populated by
 * consoleListingsScheduler.ts's background refresh — this route NEVER calls
 * the eBay API directly, so no amount of visitor traffic can burn quota.
 *
 * Condition + junk safety: never returns consoles listed as broken, for
 * parts, or non-console items (manuals, replacement parts, accessories) —
 * see ebayConsolesClient.ts for the multi-layer filter.
 *
 * Every listing URL is EPN-tagged via affiliateConfig.applyEbayEpnParams
 * (applied when the listing is fetched, before it's cached), so click-
 * throughs earn the configured EBAY_CAMPAIGN_ID commission. The static
 * `searchUrl` fallback is tagged the same way.
 *
 * Graceful degradation: when EBAY_APP_ID / EBAY_CLIENT_SECRET are not set,
 * `configured` is false and every console has zero live listings — the
 * frontend shows an informative empty state rather than infinite loading.
 */

import { Router } from "express";
import { getConsoleSummaries, getConsoleDetail, setConsoleListings } from "../lib/consoleListingsCache";
import { ebayConsolesConfigured, getEbayConsoleListings } from "../lib/ebayConsolesClient";
import { CONSOLE_MODELS } from "../lib/consoleModels";
import { logger } from "../lib/logger";

const router = Router();

/**
 * GET /api/consoles
 *
 * Response shape:
 *   {
 *     configured: boolean,
 *     consoles: Array<{
 *       id, name, generation, query, searchUrl, hasFetched, listingCount
 *     }>
 *   }
 */
router.get("/consoles", (_req, res): void => {
  try {
    const consoles = getConsoleSummaries();
    res.set("Cache-Control", "no-store");
    res.json({ configured: ebayConsolesConfigured, consoles });
  } catch (err) {
    logger.error({ err }, "Consoles summary request failed");
    res.json({ configured: ebayConsolesConfigured, consoles: [] });
  }
});

/**
 * GET /api/consoles/:id
 *
 * Response shape:
 *   {
 *     configured: boolean,
 *     console: {
 *       id, name, generation, query, searchUrl,
 *       listings: Array<{ title, price, url, imageUrl, condition }>,
 *       updatedAt: number | null,
 *     } | null   // null when :id doesn't match a known console model
 *   }
 */
router.get("/consoles/:id", (req, res): void => {
  try {
    const detail = getConsoleDetail(req.params.id);
    res.set("Cache-Control", "no-store");
    if (!detail) {
      res.status(404).json({ configured: ebayConsolesConfigured, console: null });
      return;
    }
    res.json({ configured: ebayConsolesConfigured, console: detail });
  } catch (err) {
    logger.error({ err, id: req.params.id }, "Console detail request failed");
    res.status(500).json({ configured: ebayConsolesConfigured, console: null });
  }
});

/**
 * POST /api/consoles/:id/refresh
 *
 * Admin endpoint: immediately fetches fresh eBay listings for one console
 * and updates the in-memory + persisted cache. Useful for recovering a
 * console that got stuck at 0 listings without waiting for the 24-hour
 * scheduler cycle.
 *
 * Subject to the same eBay call budget as the scheduler — returns 429 if
 * the daily console budget is exhausted.
 *
 * Response: { listingCount: number, updatedAt: number }
 */
router.post("/consoles/:id/refresh", async (req, res): Promise<void> => {
  const model = CONSOLE_MODELS.find(m => m.id === req.params.id);
  if (!model) {
    res.status(404).json({ error: "Unknown console id" });
    return;
  }

  logger.info({ id: model.id }, "Manual console listings refresh triggered");

  try {
    const listings = await getEbayConsoleListings(model);
    if (listings === null) {
      res.status(503).json({ error: "eBay fetch failed or budget exhausted — try again later" });
      return;
    }
    setConsoleListings(model.id, listings);
    logger.info({ id: model.id, count: listings.length }, "Manual console refresh complete");
    res.json({ listingCount: listings.length, updatedAt: Date.now() });
  } catch (err) {
    logger.error({ err, id: model.id }, "Manual console refresh error");
    res.status(500).json({ error: "Unexpected error during refresh" });
  }
});

export default router;
