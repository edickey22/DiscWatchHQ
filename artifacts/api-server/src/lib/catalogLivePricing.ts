/**
 * catalogLivePricing — live price + direct listing URL for catalog games.
 *
 * Orchestrates eBay Browse API and Best Buy Products API lookups for
 * games shown in the catalog search / game detail modal. Results are kept
 * in a 4-hour in-process cache so API quotas aren't hammered by repeated
 * opens of the same game.
 *
 * ── Design rationale ─────────────────────────────────────────────────────────
 *
 * This is intentionally separate from the boutique-release eBay price
 * scheduler (ebayPriceScheduler.ts), which runs on a 72-hour batch cycle
 * and writes to the releases DB table. Catalog game pricing is:
 *   - demand-driven  (only fetched when a user opens a game's detail modal)
 *   - not persisted  (in-process cache only — prices change too often for DB)
 *   - dual-retailer  (eBay + Best Buy, vs. eBay-only for boutique releases)
 *
 * ── Cache strategy ───────────────────────────────────────────────────────────
 *
 *   TTL:  4 hours — enough to serve a typical browse session from cache
 *         while keeping prices reasonably fresh.
 *   Key:  sourceId (stable, unique per game regardless of title changes)
 *   Size: unbounded Map — catalog is large but detail opens are sparse.
 *         A future LRU eviction pass can be added if memory becomes a concern.
 *
 * ── Fallback behaviour ───────────────────────────────────────────────────────
 *
 *   When a retailer's credentials are absent, its entry is omitted from the
 *   result entirely (the frontend falls back to its existing search URL).
 *   When credentials are present but the API returns no match, the entry is
 *   explicitly null (the frontend knows to skip the "From $X" display).
 */

import { logger } from "./logger";
import { getEbayListingForCatalog, ebayBrowseConfigured } from "./ebayBrowseClient";
import { getBestBuyProduct,         bestbuyConfigured    } from "./bestbuyClient";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LiveListing {
  price:     number;   // current asking price in USD
  url:       string;   // direct product/listing URL with affiliate params applied
  cachedAt:  number;   // ms epoch — lets the frontend show data freshness
}

export interface LivePricingResult {
  ebay?:    LiveListing | null;   // null = configured but no result; absent = not configured
  bestbuy?: LiveListing | null;
}

// ── In-process cache ──────────────────────────────────────────────────────────

interface CacheEntry {
  result:    LivePricingResult;
  expiresAt: number;
}

const _cache    = new Map<string, CacheEntry>();
const TTL_MS    = 4 * 60 * 60 * 1_000; // 4 hours

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch live prices and direct listing URLs for the given catalog game.
 *
 * @param sourceId  Stable game ID — used as cache key (e.g. "rawg:3498")
 * @param title     Game title — passed to retailer search APIs
 *
 * Returns immediately from cache on a warm hit.
 * On a cold miss, fires both retailer fetches in parallel and caches the
 * combined result.
 *
 * Never throws — all errors are caught and logged internally.
 */
export async function fetchLivePricing(
  sourceId: string,
  title:    string,
): Promise<LivePricingResult> {
  // ── Cache hit ──────────────────────────────────────────────────────────────
  const cached = _cache.get(sourceId);
  if (cached && cached.expiresAt > Date.now()) {
    logger.debug({ sourceId }, "catalogLivePricing: cache hit");
    return cached.result;
  }

  // ── Parallel fetch ─────────────────────────────────────────────────────────
  // Each retailer fetch is individually guarded — one failure doesn't kill both.
  const now = Date.now();

  const [ebaySettled, bestbuySettled] = await Promise.allSettled([
    ebayBrowseConfigured   ? getEbayListingForCatalog(title)  : Promise.resolve(undefined),
    bestbuyConfigured      ? getBestBuyProduct(title)         : Promise.resolve(undefined),
  ]);

  const result: LivePricingResult = {};

  if (ebayBrowseConfigured) {
    if (ebaySettled.status === "fulfilled" && ebaySettled.value != null) {
      result.ebay = { price: ebaySettled.value.price, url: ebaySettled.value.url, cachedAt: now };
    } else {
      result.ebay = null; // configured, but no listing found or fetch failed
      if (ebaySettled.status === "rejected") {
        logger.warn({ err: ebaySettled.reason, sourceId, title }, "eBay listing fetch failed");
      }
    }
  }

  if (bestbuyConfigured) {
    if (bestbuySettled.status === "fulfilled" && bestbuySettled.value != null) {
      result.bestbuy = {
        price:    bestbuySettled.value.price,
        url:      bestbuySettled.value.url,
        cachedAt: now,
      };
    } else {
      result.bestbuy = null;
      if (bestbuySettled.status === "rejected") {
        logger.warn({ err: bestbuySettled.reason, sourceId, title }, "Best Buy product fetch failed");
      }
    }
  }

  _cache.set(sourceId, { result, expiresAt: now + TTL_MS });
  logger.debug(
    { sourceId, ebay: result.ebay?.price ?? null, bestbuy: result.bestbuy?.price ?? null },
    "catalogLivePricing: fetched and cached",
  );

  return result;
}

/** Manually invalidate a cached entry (e.g. after a known price change). */
export function invalidateLivePricing(sourceId: string): void {
  _cache.delete(sourceId);
}
