/**
 * eBay Browse API client — real-time lowest-price lookup.
 *
 * Separate from the eBay Partner Network affiliate config.
 * Requires two env vars:
 *   EBAY_APP_ID          — OAuth Client ID (App ID) from developer.ebay.com
 *   EBAY_CLIENT_SECRET   — OAuth Client Secret from developer.ebay.com
 *
 * When either is absent the module returns null for every lookup (silent
 * no-op — retailer buttons stay as plain "Search on eBay" with no price).
 *
 * Token lifecycle: OAuth tokens are cached in-process for their full
 * lifetime (typically 2 h). Price lookups are cached for 30 min per
 * title to stay well within eBay's API rate limits.
 */

const APP_ID     = (process.env.EBAY_APP_ID     ?? "").trim();
const APP_SECRET = (process.env.EBAY_CLIENT_SECRET ?? "").trim();

export const ebayBrowseConfigured = !!(APP_ID && APP_SECRET);

// ── OAuth token cache ─────────────────────────────────────────────────────────

interface TokenCache {
  token: string;
  expiresAt: number; // ms epoch
}

let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string | null> {
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

// ── Price cache ───────────────────────────────────────────────────────────────

const PRICE_TTL_MS = 30 * 60 * 1_000; // 30 min

interface PriceEntry {
  price: number | null;
  cachedAt: number;
}

const priceCache = new Map<string, PriceEntry>();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the lowest current Buy-It-Now price (USD) for the given title on
 * eBay, or null when:
 *   - credentials are not configured
 *   - no active listings found
 *   - the API call fails
 *
 * Results are cached for 30 min; successive calls for the same title within
 * that window are free (no API hit).
 */
export async function getEbayLowestPrice(title: string): Promise<number | null> {
  if (!ebayBrowseConfigured) return null;

  const cached = priceCache.get(title);
  if (cached && Date.now() - cached.cachedAt < PRICE_TTL_MS) {
    return cached.price;
  }

  const store = (price: number | null) => {
    priceCache.set(title, { price, cachedAt: Date.now() });
    return price;
  };

  try {
    const token = await getAccessToken();
    if (!token) return store(null);

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

    if (!res.ok) {
      console.warn("[eBay Browse] Search failed", res.status, title);
      return store(null);
    }

    const data = (await res.json()) as {
      itemSummaries?: Array<{ price?: { value?: string; currency?: string } }>;
    };

    const prices = (data.itemSummaries ?? [])
      .map(item => parseFloat(item.price?.value ?? ""))
      .filter(n => !isNaN(n) && n > 0);

    return store(prices.length > 0 ? Math.min(...prices) : null);
  } catch (err) {
    console.warn("[eBay Browse] Lookup error:", err);
    return store(null);
  }
}

/** Wipe the in-process caches (used by tests / manual refresh). */
export function clearEbayPriceCache(): void {
  priceCache.clear();
  tokenCache = null;
}
