/**
 * Best Buy Products API client — finds the best matching product listing
 * for a given game title and returns its live price + direct product URL.
 *
 * Requires:
 *   BESTBUY_API_KEY — from developer.bestbuy.com (Products API key)
 *
 * When the key is absent the module returns null for every lookup (silent
 * no-op — retailer buttons stay as plain "Search on Best Buy" with no price).
 *
 * Quota: the Products API allows ~5 req/s with a generous monthly cap.
 * This client is only called through catalogLivePricing, which guards it
 * with a 4-hour in-process cache per title — so steady-state API traffic
 * is negligible.
 *
 * Affiliate wrapping:
 *   When BESTBUY_IMPACT_ID is configured the returned URL is wrapped in
 *   the Impact deep-link so every click-through earns the affiliate fee.
 *   When absent, the raw bestbuy.com product URL is returned instead.
 */

import { logger } from "./logger";
import { buildBestBuyDirectUrl } from "./affiliateConfig";

const API_KEY = (process.env.BESTBUY_API_KEY ?? "").trim();
export const bestbuyConfigured = !!API_KEY;

export interface BestBuyListing {
  price:  number;   // current selling price (salePrice if lower, otherwise regularPrice)
  url:    string;   // direct product URL, wrapped with Impact affiliate link if configured
  name:   string;   // product name as returned by Best Buy
}

/**
 * Find the best matching Buy It Now listing for a given game title on
 * Best Buy, or null when:
 *   - BESTBUY_API_KEY is not configured
 *   - no available product found
 *   - the API call fails or times out
 *
 * Results are intentionally uncached here — call-frequency management
 * is the caller's responsibility (catalogLivePricing 4-hour cache).
 */
export async function getBestBuyProduct(title: string): Promise<BestBuyListing | null> {
  if (!bestbuyConfigured) return null;

  try {
    // Products API query language: (search=TITLE&department=Video+Games&onlineAvailability=true)
    // show= selects which fields to return; pageSize=5 gives a small candidate set.
    const query   = encodeURIComponent(title);
    const show    = "name,sku,regularPrice,salePrice,url,onlineAvailability";
    const apiUrl  =
      `https://api.bestbuy.com/v1/products` +
      `(search=${query}&department=Video+Games&onlineAvailability=true)` +
      `?apiKey=${API_KEY}&format=json&pageSize=5&show=${show}&sort=bestSellingRank.asc`;

    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(8_000) });

    if (!res.ok) {
      logger.warn({ status: res.status, title }, "[BestBuy] Product search failed");
      return null;
    }

    const data = (await res.json()) as {
      products?: Array<{
        name:              string;
        sku:               number;
        regularPrice:      number;
        salePrice:         number;
        url:               string;
        onlineAvailability: boolean;
      }>;
    };

    const available = (data.products ?? []).filter(p => p.onlineAvailability);
    if (available.length === 0) return null;

    // Pick the first result (Best Buy sorts by bestSellingRank — highest relevance first).
    const product = available[0];
    const price   = product.salePrice ?? product.regularPrice;
    if (!price || price <= 0) return null;

    return {
      price,
      url:  buildBestBuyDirectUrl(product.url),
      name: product.name,
    };
  } catch (err) {
    logger.warn({ err, title }, "[BestBuy] Product lookup error");
    return null;
  }
}
