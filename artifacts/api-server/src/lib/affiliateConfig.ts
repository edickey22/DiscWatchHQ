/**
 * Affiliate Link Configuration
 * ─────────────────────────────────────────────────────────────────
 * Set the environment variables below to activate affiliate revenue.
 * Until an ID is provided the site falls back to a plain, unmonetized
 * search link. No UI breaks — links just don't earn until IDs are set.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  SECRET NAME              WHERE TO GET IT                              │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │  EBAY_CAMPAIGN_ID         https://partnernetwork.ebay.com/             │
 * │                           Format: numeric string "5339099999"          │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │  EBAY_APP_ID              https://developer.ebay.com/                  │
 * │  EBAY_CLIENT_SECRET       OAuth Client ID + Secret for Browse API      │
 * │                           (distinct from Partner Network above)        │
 * │                           Enables live "From $X" pricing on eBay cards │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │  AMAZON_ASSOCIATES_TAG    https://affiliate-program.amazon.com/        │
 * │                           Format: "discwatch-20"                       │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │  AMAZON_PA_API_KEY        https://webservices.amazon.com/paapi5/       │
 * │  AMAZON_PA_API_SECRET     Product Advertising API v5 credentials       │
 * │                           Reserved — enables live Amazon pricing later  │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │  GAMESTOP_RAKUTEN_ID      https://rakutenadvertising.com/              │
 * │                           (Publisher/Affiliate ID from Rakuten)        │
 * │                           Format: numeric string "1234567"             │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │  BESTBUY_IMPACT_ID        https://partners.bestbuy.com/                │
 * │                           (SID / Affiliate ID from Impact)             │
 * │                           Format: numeric string "1234567"             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export const affiliateConfig = {
  ebay: {
    /** eBay Partner Network Campaign ID → EBAY_CAMPAIGN_ID secret */
    campaignId: (process.env.EBAY_CAMPAIGN_ID ?? "").trim(),
    /** Standard eBay US rotation ID — do not change */
    rotationId: "711-53200-19255-0",
    toolId: "10001",
  },

  amazon: {
    /** Amazon Associates tracking tag → AMAZON_ASSOCIATES_TAG secret */
    associatesTag: (process.env.AMAZON_ASSOCIATES_TAG ?? "").trim(),
  },

  gamestop: {
    /**
     * Rakuten Advertising (formerly LinkShare) Publisher/Affiliate ID.
     * Sign up at https://rakutenadvertising.com/ and join the GameStop program.
     * → GAMESTOP_RAKUTEN_ID secret
     * GameStop's fixed Rakuten merchant ID is 35864 — do not change.
     */
    affiliateId: (process.env.GAMESTOP_RAKUTEN_ID ?? "").trim(),
    merchantId: "35864",
  },

  bestbuy: {
    /**
     * Impact (formerly Impact Radius) Affiliate/SID.
     * Sign up at https://partners.bestbuy.com/ (powered by Impact).
     * → BESTBUY_IMPACT_ID secret
     * Best Buy's fixed Impact program ID is 1706643 — do not change.
     */
    affiliateId: (process.env.BESTBUY_IMPACT_ID ?? "").trim(),
    programId: "1706643",
  },
} as const;

// ─── URL builders ────────────────────────────────────────────────────────────

/**
 * eBay video-game category search.
 * Appends EPN affiliate params when EBAY_CAMPAIGN_ID is set.
 */
export function buildEbaySearchUrl(title: string): string {
  const q = encodeURIComponent(title);
  const base = `https://www.ebay.com/sch/i.html?_nkw=${q}&_sacat=139973`;
  if (!affiliateConfig.ebay.campaignId) return base;
  const { campaignId, rotationId, toolId } = affiliateConfig.ebay;
  return `${base}&mkcid=1&mkrid=${rotationId}&siteid=0&campid=${campaignId}&toolid=${toolId}&mkevt=1`;
}

/**
 * Amazon search URL.
 * Appends Associates tag when AMAZON_ASSOCIATES_TAG is set.
 */
export function buildAmazonSearchUrl(title: string): string {
  const q = encodeURIComponent(title);
  const base = `https://www.amazon.com/s?k=${q}`;
  if (!affiliateConfig.amazon.associatesTag) return base;
  return `${base}&tag=${affiliateConfig.amazon.associatesTag}`;
}

/**
 * GameStop search URL via Rakuten deep-link wrapper.
 * Falls back to direct search when GAMESTOP_RAKUTEN_ID is not set.
 */
export function buildGameStopSearchUrl(title: string): string {
  // GameStop search parameter is "q" (not "searchTerm" — that returns zero results).
  const directUrl = `https://www.gamestop.com/search/?q=${encodeURIComponent(title)}`;
  if (!affiliateConfig.gamestop.affiliateId) return directUrl;
  const { affiliateId, merchantId } = affiliateConfig.gamestop;
  return `https://click.linksynergy.com/deeplink?id=${affiliateId}&mid=${merchantId}&murl=${encodeURIComponent(directUrl)}`;
}

/**
 * Best Buy search URL via Impact deep-link wrapper.
 * Falls back to direct search when BESTBUY_IMPACT_ID is not set.
 */
export function buildBestBuySearchUrl(title: string): string {
  const directUrl = `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(title)}`;
  if (!affiliateConfig.bestbuy.affiliateId) return directUrl;
  const { affiliateId, programId } = affiliateConfig.bestbuy;
  return `https://bestbuy.7eer.net/c/${affiliateId}/${programId}?url=${encodeURIComponent(directUrl)}`;
}

/**
 * eBay strategy guide search — searches for "{title} strategy guide".
 * Most physical guides are out-of-print / used, making eBay the primary market.
 * Appends EPN affiliate params when EBAY_CAMPAIGN_ID is set.
 */
export function buildEbayStrategyGuideUrl(title: string): string {
  const q = encodeURIComponent(`${title} strategy guide`);
  const base = `https://www.ebay.com/sch/i.html?_nkw=${q}`;
  if (!affiliateConfig.ebay.campaignId) return base;
  const { campaignId, rotationId, toolId } = affiliateConfig.ebay;
  return `${base}&mkcid=1&mkrid=${rotationId}&siteid=0&campid=${campaignId}&toolid=${toolId}&mkevt=1`;
}

/**
 * Amazon strategy guide search — searches for "{title} official strategy guide".
 * Covers new guides from Prima / Future Press for major releases as well as used stock.
 * Appends Associates tag when AMAZON_ASSOCIATES_TAG is set.
 */
export function buildAmazonStrategyGuideUrl(title: string): string {
  const q = encodeURIComponent(`${title} official strategy guide`);
  const base = `https://www.amazon.com/s?k=${q}`;
  if (!affiliateConfig.amazon.associatesTag) return base;
  return `${base}&tag=${affiliateConfig.amazon.associatesTag}`;
}

/**
 * Add an Amazon Associates tag to a known Amazon product URL.
 * Used when the scraper found a direct ASIN link.
 */
const AMAZON_HOSTNAME_RE = /^(www\.)?amazon\.(com|co\.uk|ca|de|fr|es|it|co\.jp|com\.au)$/i;
const AMZN_SHORT_RE = /^amzn\.to$/i;

export function buildAmazonProductUrl(amazonUrl: string): string {
  if (!affiliateConfig.amazon.associatesTag || !amazonUrl) return amazonUrl;
  try {
    const url = new URL(amazonUrl);
    if (
      url.protocol !== "https:" ||
      (!AMAZON_HOSTNAME_RE.test(url.hostname) && !AMZN_SHORT_RE.test(url.hostname))
    ) {
      return amazonUrl;
    }
    url.searchParams.set("tag", affiliateConfig.amazon.associatesTag);
    url.searchParams.delete("linkCode");
    url.searchParams.delete("linkId");
    return url.toString();
  } catch {
    return amazonUrl;
  }
}

/** Returns true if any affiliate channel is active. */
export function isAnyAffiliateConfigured(): boolean {
  return !!(
    affiliateConfig.ebay.campaignId ||
    affiliateConfig.amazon.associatesTag ||
    affiliateConfig.gamestop.affiliateId ||
    affiliateConfig.bestbuy.affiliateId
  );
}
