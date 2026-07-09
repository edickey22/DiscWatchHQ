/**
 * Affiliate Link Configuration
 * ─────────────────────────────────────────────────────────────────
 * Set the environment variables below to activate affiliate revenue.
 * Until an ID is provided the site falls back to plain, unmonetized links.
 *
 * HOW TO SET:
 *   In the Replit Secrets panel (or a .env file for local dev) add:
 *
 *   EBAY_CAMPAIGN_ID        — Your eBay Partner Network Campaign ID
 *                             Sign up / find it at: https://partnernetwork.ebay.com/
 *                             Example value:  "5339099999"
 *
 *   AMAZON_ASSOCIATES_TAG   — Your Amazon Associates tracking tag (Store ID)
 *                             Sign up / find it at: https://affiliate-program.amazon.com/
 *                             Example value:  "pressrun-20"
 *
 * Leave either variable unset (or empty) to disable that affiliate channel.
 * The site will silently fall back to plain links with no broken UI.
 */

export const affiliateConfig = {
  ebay: {
    /**
     * eBay Partner Network Campaign ID.
     * Paste your Campaign ID into the EBAY_CAMPAIGN_ID secret.
     * Format: numeric string, e.g. "5339099999"
     */
    campaignId: (process.env.EBAY_CAMPAIGN_ID ?? "").trim(),

    /** Standard eBay US rotation ID — do not change unless eBay instructs otherwise. */
    rotationId: "711-53200-19255-0",

    /** eBay tool ID for link-level tracking (standard web affiliate value). */
    toolId: "10001",
  },

  amazon: {
    /**
     * Amazon Associates tracking tag (your Store ID).
     * Paste your tag into the AMAZON_ASSOCIATES_TAG secret.
     * Format: lowercase-string-XX, e.g. "pressrun-20"
     */
    associatesTag: (process.env.AMAZON_ASSOCIATES_TAG ?? "").trim(),
  },
} as const;

/**
 * Build an eBay search URL for a sold-out title.
 * Appends Partner Network affiliate parameters when EBAY_CAMPAIGN_ID is set.
 */
export function buildEbaySearchUrl(title: string): string {
  const query = encodeURIComponent(title);
  const base = `https://www.ebay.com/sch/i.html?_nkw=${query}&_sacat=139973`; // 139973 = Video Games category
  if (!affiliateConfig.ebay.campaignId) return base;
  const { campaignId, rotationId, toolId } = affiliateConfig.ebay;
  return `${base}&mkcid=1&mkrid=${rotationId}&siteid=0&campid=${campaignId}&toolid=${toolId}&mkevt=1`;
}

/**
 * Add an Amazon Associates tag to an existing Amazon product URL.
 * Handles both full amazon.com URLs and amzn.to short links.
 * Returns the original URL unchanged when AMAZON_ASSOCIATES_TAG is not set.
 */
/** Allowlisted Amazon hostnames — rejects any non-Amazon URL that may have slipped through scraping */
const AMAZON_HOSTNAME_RE = /^(www\.)?amazon\.(com|co\.uk|ca|de|fr|es|it|co\.jp|com\.au)$/i;
const AMZN_SHORT_RE = /^amzn\.to$/i;

export function buildAmazonUrl(amazonUrl: string): string {
  if (!affiliateConfig.amazon.associatesTag || !amazonUrl) return amazonUrl;
  try {
    const url = new URL(amazonUrl);
    // Only inject the tag on verified Amazon domains — reject anything else
    if (url.protocol !== "https:" ||
        (!AMAZON_HOSTNAME_RE.test(url.hostname) && !AMZN_SHORT_RE.test(url.hostname))) {
      return amazonUrl;
    }
    url.searchParams.set("tag", affiliateConfig.amazon.associatesTag);
    // Remove existing affiliate parameters to avoid conflicts
    url.searchParams.delete("linkCode");
    url.searchParams.delete("linkId");
    return url.toString();
  } catch {
    // Unparseable URL — return as-is rather than silently corrupting it
    return amazonUrl;
  }
}

/** Returns true if any affiliate channel is active (used by the API status endpoint). */
export function isAnyAffiliateConfigured(): boolean {
  return !!(affiliateConfig.ebay.campaignId || affiliateConfig.amazon.associatesTag);
}
