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
 *
 * ── eBay is intentionally excluded from live pricing ────────────────────────
 *
 *   eBay's Browse API has no reliable way to confirm a `q=<title>` keyword
 *   match is actually the specific game (no UPC/catalog-id matching like
 *   Best Buy's Products API) — sorting by lowest price on a bare keyword
 *   search tends to surface accessories, unrelated bundles, or entirely
 *   different games that happen to share words with the title. That showed
 *   up as catalog game cards linking to "random items" instead of the game
 *   itself. Best Buy's Products API matches by catalog identity, not raw
 *   keywords, so it stays. eBay always falls back to the plain, always-
 *   correct affiliate search URL (`buildEbaySearchUrl`) — see RetailerLinks/
 *   the frontend, which already renders that URL whenever `pricing.ebay` is
 *   absent. Do not re-add a `getEbayListingForCatalog` call here without a
 *   real per-item match signal (e.g. GTIN/UPC) to back it.
 */

import { logger } from "./logger";
import { getBestBuyProduct, bestbuyConfigured } from "./bestbuyClient";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LiveListing {
  price:     number;   // current asking price in USD
  url:       string;   // direct product/listing URL with affiliate params applied
  cachedAt:  number;   // ms epoch — lets the frontend show data freshness
}

export interface LivePricingResult {
  // eBay is never populated here — see the module doc comment above.
  // Kept as an optional/nullable field so the frontend type & fallback
  // logic (RetailerLinks / GameDetailModal) still compile and behave
  // correctly if this ever changes.
  ebay?:    LiveListing | null;
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

  const [bestbuySettled] = await Promise.allSettled([
    bestbuyConfigured ? getBestBuyProduct(title) : Promise.resolve(undefined),
  ]);

  const result: LivePricingResult = {};

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
    { sourceId, bestbuy: result.bestbuy?.price ?? null },
    "catalogLivePricing: fetched and cached",
  );

  return result;
}

/** Manually invalidate a cached entry (e.g. after a known price change). */
export function invalidateLivePricing(sourceId: string): void {
  _cache.delete(sourceId);
}
