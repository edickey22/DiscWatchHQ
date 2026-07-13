/**
 * eBay Browse API client — fetches lowest Buy-It-Now price for a title.
 *
 * Separate from the eBay Partner Network affiliate config.
 * Requires two env vars:
 *   EBAY_APP_ID          — OAuth Client ID (App ID) from developer.ebay.com
 *   EBAY_CLIENT_SECRET   — OAuth Client Secret from developer.ebay.com
 *
 * When either is absent the module returns null for every lookup (silent
 * no-op — retailer buttons stay as plain "Search on eBay" with no price).
 *
 * IMPORTANT — quota management:
 *   This client is ONLY called by the eBay price scheduler background job.
 *   It must never be called from visitor-facing request handlers. The
 *   scheduler writes results into the DB; all visitor traffic reads from there.
 *
 * Token lifecycle: OAuth tokens are cached in-process for their full
 * lifetime (typically 2 h). No per-title price caching here — that is
 * handled at the DB layer by the scheduler's 72-hour refresh interval.
 */

import { applyEbayEpnParams } from "./affiliateConfig";
import { checkAndReserveEbayCall } from "./ebayBudget";
import { logger } from "./logger";

const APP_ID     = (process.env.EBAY_APP_ID     ?? "").trim();
const APP_SECRET = (process.env.EBAY_CLIENT_SECRET ?? "").trim();

export const ebayBrowseConfigured = !!(APP_ID && APP_SECRET);

/**
 * Thrown when eBay responds 429 (rate limited) to a Browse API search call.
 * Callers that loop over many items (schedulers) should catch this
 * specifically and abort the REST of the current run immediately rather
 * than continuing to hammer an API that's already throttling us — a plain
 * `console.warn` per item would otherwise silently burn through the rest
 * of the loop against a wall of 429s.
 */
export class EbayRateLimitError extends Error {
  constructor(context: string) {
    super(`eBay Browse API rate limit (429) hit during: ${context}`);
    this.name = "EbayRateLimitError";
  }
}

// ── OAuth token cache ─────────────────────────────────────────────────────────

interface TokenCache {
  token: string;
  expiresAt: number; // ms epoch
}

let tokenCache: TokenCache | null = null;

/**
 * Exported so other Browse API clients (e.g. ebayConsolesClient.ts) can
 * reuse the same cached OAuth token instead of requesting their own.
 */
export async function getAccessToken(): Promise<string | null> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }
  try {
    const credentials = Buffer.from(`${APP_ID}:${APP_SECRET}`).toString("base64");
    const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.warn("[eBay Browse] OAuth token request failed", res.status);
      return null;
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1_000,
    };
    return tokenCache.token;
  } catch (err) {
    console.warn("[eBay Browse] OAuth error:", err);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the lowest current Buy-It-Now price (USD) for the given title on
 * eBay, or null when:
 *   - credentials are not configured
 *   - no active listings found
 *   - the API call fails
 *
 * This function is intentionally uncached — call-frequency management is
 * the caller's responsibility (i.e. the scheduled batch job).
 */
export async function getEbayLowestPrice(title: string): Promise<number | null> {
  if (!ebayBrowseConfigured) return null;

  if (!(await checkAndReserveEbayCall("price"))) {
    logger.debug({ title }, "[eBay Browse] Daily call budget exhausted — skipping price lookup");
    return null;
  }

  try {
    const token = await getAccessToken();
    if (!token) return null;

    // category_ids=139973 = Video Games on eBay US
    // sort=price          = lowest price first
    // filter=buyingOptions:{FIXED_PRICE}  = Buy It Now only (no auction-only)
    const q = encodeURIComponent(title);
    const url =
      `https://api.ebay.com/buy/browse/v1/item_summary/search` +
      `?q=${q}&category_ids=139973&sort=price&limit=5` +
      `&filter=buyingOptions%3A%7BFIXED_PRICE%7D`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(6_000),
    });

    if (res.status === 429) {
      logger.error({ title }, "[eBay Browse] Rate limited (429) — signaling caller to back off");
      throw new EbayRateLimitError(`price lookup for "${title}"`);
    }

    if (!res.ok) {
      console.warn("[eBay Browse] Search failed", res.status, title);
      return null;
    }

    const data = (await res.json()) as {
      itemSummaries?: Array<{ price?: { value?: string; currency?: string } }>;
    };

    const prices = (data.itemSummaries ?? [])
      .map(item => parseFloat(item.price?.value ?? ""))
      .filter(n => !isNaN(n) && n > 0);

    return prices.length > 0 ? Math.min(...prices) : null;
  } catch (err) {
    if (err instanceof EbayRateLimitError) throw err; // let the caller's loop see it and back off
    console.warn("[eBay Browse] Lookup error:", err);
    return null;
  }
}

/**
 * Returns the cheapest active Buy-It-Now listing for a catalog game —
 * both the price AND the direct eBay item URL.
 *
 * Unlike getEbayLowestPrice (price-only, used by the boutique release
 * scheduler), this function is designed for the catalog live-pricing path
 * where the frontend needs a direct link to replace the generic search URL.
 *
 * The returned URL has EPN affiliate params appended when EBAY_CAMPAIGN_ID
 * is set, so every click-through earns the affiliate commission.
 *
 * Returns null when:
 *   - credentials are not configured
 *   - no active Fixed-Price listings found
 *   - the API call fails or times out
 */
export async function getEbayListingForCatalog(
  title: string,
): Promise<{ price: number; url: string } | null> {
  if (!ebayBrowseConfigured) return null;

  // This path is visitor-triggered (catalog game detail opens) rather than
  // scheduler-driven, so it's the one call site here without a natural
  // per-run ceiling — the daily "catalog" allocation is what keeps it bounded.
  if (!(await checkAndReserveEbayCall("catalog"))) {
    logger.debug({ title }, "[eBay Browse] Daily call budget exhausted — skipping catalog lookup");
    return null;
  }

  try {
    const token = await getAccessToken();
    if (!token) return null;

    const q = encodeURIComponent(title);
    const apiUrl =
      `https://api.ebay.com/buy/browse/v1/item_summary/search` +
      `?q=${q}&category_ids=139973&sort=price&limit=5` +
      `&filter=buyingOptions%3A%7BFIXED_PRICE%7D`;

    const res = await fetch(apiUrl, {
      headers: {
        Authorization:             `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "Content-Type":            "application/json",
      },
      signal: AbortSignal.timeout(6_000),
    });

    if (res.status === 429) {
      logger.error({ title }, "[eBay Browse] Rate limited (429) on catalog lookup");
      throw new EbayRateLimitError(`catalog listing lookup for "${title}"`);
    }

    if (!res.ok) {
      console.warn("[eBay Browse] Catalog listing search failed", res.status, title);
      return null;
    }

    const data = (await res.json()) as {
      itemSummaries?: Array<{
        price?:      { value?: string; currency?: string };
        itemWebUrl?: string;
      }>;
    };

    // Find cheapest item that has both a parseable price and a URL
    const candidates = (data.itemSummaries ?? [])
      .map(item => ({
        price: parseFloat(item.price?.value ?? ""),
        url:   item.itemWebUrl ?? "",
      }))
      .filter(c => !isNaN(c.price) && c.price > 0 && c.url);

    if (candidates.length === 0) return null;

    const cheapest = candidates.reduce((a, b) => (b.price < a.price ? b : a));
    return {
      price: cheapest.price,
      url:   applyEbayEpnParams(cheapest.url),
    };
  } catch (err) {
    if (err instanceof EbayRateLimitError) throw err;
    console.warn("[eBay Browse] Catalog listing error:", err);
    return null;
  }
}

/** Reset OAuth token cache (used in tests / forced re-auth). */
export function clearEbayTokenCache(): void {
  tokenCache = null;
}
