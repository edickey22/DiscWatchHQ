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
import { getConsoleSummaries, getConsoleDetail } from "../lib/consoleListingsCache";
import { ebayConsolesConfigured } from "../lib/ebayConsolesClient";
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

export default router;
