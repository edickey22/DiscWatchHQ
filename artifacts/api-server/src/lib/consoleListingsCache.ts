/**
 * consoleListingsCache — in-process, per-console-model cache for live eBay
 * console listings (Consoles section).
 *
 * Mirrors the 4-hour TTL / in-process Map pattern used by
 * catalogLivePricing.ts, keyed per console model id instead of per game.
 */

import { logger } from "./logger";
import { CONSOLE_MODELS, type ConsoleModel } from "./consoleModels";
import { getEbayConsoleListing, ebayConsolesConfigured, type ConsoleListing } from "./ebayConsolesClient";
import { buildEbaySearchUrl } from "./affiliateConfig";

export interface ConsoleWithListing extends ConsoleModel {
  listing: ConsoleListing | null; // null = no live listing (not configured, zero results, or fetch failure)
  /**
   * Static, EPN-tagged eBay search URL for this console model — built from
   * the same buildEbaySearchUrl/EPN-params pattern used sitewide (Browse
   * Games "eBay Search" buttons). Only requires EBAY_CAMPAIGN_ID, so it's
   * always present and functional regardless of Browse API credentials.
   * The frontend uses this as the fallback CTA whenever `listing` is null.
   */
  searchUrl: string;
}

interface CacheEntry {
  listing:   ConsoleListing | null;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry>();
const TTL_MS = 4 * 60 * 60 * 1_000; // 4 hours

async function fetchOne(model: ConsoleModel): Promise<ConsoleListing | null> {
  const cached = _cache.get(model.id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.listing;
  }

  let listing: ConsoleListing | null = null;
  try {
    listing = await getEbayConsoleListing(model.query);
  } catch (err) {
    logger.warn({ err, consoleId: model.id }, "Console listing fetch failed");
  }

  _cache.set(model.id, { listing, expiresAt: Date.now() + TTL_MS });
  return listing;
}

/**
 * Fetch (or serve from cache) the best qualifying listing for every curated
 * console model, in parallel. Never throws — individual failures resolve to
 * a null listing for that console rather than failing the whole page.
 */
export async function fetchAllConsoleListings(): Promise<ConsoleWithListing[]> {
  if (!ebayConsolesConfigured) {
    return CONSOLE_MODELS.map(model => ({
      ...model,
      listing:   null,
      searchUrl: buildEbaySearchUrl(model.query),
    }));
  }

  const settled = await Promise.allSettled(CONSOLE_MODELS.map(fetchOne));
  return CONSOLE_MODELS.map((model, i) => ({
    ...model,
    listing:   settled[i].status === "fulfilled" ? settled[i].value : null,
    searchUrl: buildEbaySearchUrl(model.query),
  }));
}
