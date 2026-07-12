/**
 * /api/consoles — live eBay console listings for the top-level "Consoles"
 * section (separate from Browse Games and Boutique Tracker).
 *
 * Consoles earn meaningfully more affiliate commission per sale than games
 * at the same EPN commission rate because of their higher average sale
 * price — this endpoint surfaces one qualifying live listing per curated
 * console model, spanning current-gen, previous-gen, and retro hardware.
 *
 * Condition safety: never returns consoles listed as broken or for parts —
 * see ebayConsolesClient.ts for the two-layer filter (API conditionIds
 * exclusion + title blocklist backup).
 *
 * Every listing URL is EPN-tagged via affiliateConfig.applyEbayEpnParams,
 * so click-throughs earn the configured EBAY_CAMPAIGN_ID commission.
 *
 * Graceful degradation: when EBAY_APP_ID / EBAY_CLIENT_SECRET are not set,
 * `configured` is false and every console's `listing` is null — the
 * frontend shows an informative empty state rather than infinite loading.
 */

import { Router } from "express";
import { fetchAllConsoleListings } from "../lib/consoleListingsCache";
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
 *       id: string; name: string; generation: "current"|"previous"|"retro";
 *       listing: { title, price, url, imageUrl, condition } | null;
 *     }>
 *   }
 */
router.get("/consoles", async (_req, res): Promise<void> => {
  try {
    const consoles = await fetchAllConsoleListings();
    // Results are demand-driven and cached in-process — no HTTP caching so
    // the 4-hour in-process TTL remains the single source of truth.
    res.set("Cache-Control", "no-store");
    res.json({ configured: ebayConsolesConfigured, consoles });
  } catch (err) {
    logger.error({ err }, "Consoles listing request failed");
    res.json({ configured: ebayConsolesConfigured, consoles: [] });
  }
});

export default router;
