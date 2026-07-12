/**
 * eBay Browse API client — live console listings for the "Consoles" section.
 *
 * Separate from ebayBrowseClient.ts (per-game pricing) even though it shares
 * the same OAuth token cache — consoles need a different eBay category,
 * multiple curated search queries, and condition-safety filtering that game
 * listings don't require.
 *
 * Requires the same two env vars as ebayBrowseClient.ts:
 *   EBAY_APP_ID          — OAuth Client ID (App ID) from developer.ebay.com
 *   EBAY_CLIENT_SECRET   — OAuth Client Secret from developer.ebay.com
 * When either is absent, ebayConsolesConfigured is false and every lookup
 * returns null (the Consoles page shows a graceful "coming soon" state).
 *
 * ── Condition safety (never show broken consoles) ─────────────────────────
 *   1. Primary filter: the Browse API request excludes conditionIds 7000
 *      ("For parts or not working") outright via the `conditionIds` filter.
 *   2. Backup filter: sellers don't always tag condition correctly, so every
 *      candidate's title is also checked against CONDITION_BLOCKLIST_TERMS
 *      and dropped if it matches, regardless of its declared condition.
 *   3. Badge safety: only listings whose condition normalizes cleanly to
 *      "New", "Used", or "Seller Refurbished" are shown. Anything else
 *      (ambiguous/unrecognized condition strings) is dropped rather than
 *      displayed with a vague or missing badge.
 */

import { applyEbayEpnParams } from "./affiliateConfig";
import { getAccessToken, ebayBrowseConfigured } from "./ebayBrowseClient";

export const ebayConsolesConfigured = ebayBrowseConfigured;

// eBay category ID for "Video Game Consoles" (distinct from 139973 = Video Games)
const CONSOLES_CATEGORY_ID = "139971";

// conditionIds included: 1000 New, 1500 New other, 2000 Certified Refurbished,
// 2500 Seller Refurbished, 3000 Used. 7000 (For parts or not working) is
// deliberately excluded — this is the primary safety filter.
const CONDITION_IDS_FILTER = "1000|1500|2000|2500|3000";

/**
 * Backup safety net — sellers don't always tag condition correctly, so any
 * listing whose title contains one of these terms is dropped regardless of
 * its declared condition code.
 */
const CONDITION_BLOCKLIST_TERMS = [
  "broken", "not working", "no power", "for parts", "spares/repair",
  "spares or repair", "faulty", "doa", "d.o.a", "doesn't work", "does not work",
  "won't turn on", "wont turn on", "cracked screen", "water damage",
];

function isBlocklisted(title: string): boolean {
  const lower = title.toLowerCase();
  return CONDITION_BLOCKLIST_TERMS.some(term => lower.includes(term));
}

export type ConsoleCondition = "New" | "Used" | "Seller Refurbished";

/**
 * Normalize eBay's free-text condition string to one of our three display
 * badges. Returns null for anything ambiguous — callers must drop the
 * listing rather than show an unclear badge.
 */
function normalizeCondition(raw: string | undefined): ConsoleCondition | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes("parts") || lower.includes("not working")) return null; // extra safety
  if (lower.includes("refurbished")) return "Seller Refurbished";
  if (lower.includes("new")) return "New";
  if (lower.includes("used")) return "Used";
  return null;
}

export interface ConsoleListing {
  title:     string;
  price:     number;             // USD
  url:       string;             // direct item URL, EPN-tagged
  imageUrl:  string | null;
  condition: ConsoleCondition;
}

/**
 * Search the eBay Browse API for one console model and return the cheapest
 * qualifying listing (safety-filtered, EPN-tagged), or null when:
 *   - credentials are not configured
 *   - no listing survives the condition + blocklist filters
 *   - the API call fails or times out
 */
export async function getEbayConsoleListing(query: string): Promise<ConsoleListing | null> {
  if (!ebayConsolesConfigured) return null;

  try {
    const token = await getAccessToken();
    if (!token) return null;

    const q = encodeURIComponent(query);
    const apiUrl =
      `https://api.ebay.com/buy/browse/v1/item_summary/search` +
      `?q=${q}&category_ids=${CONSOLES_CATEGORY_ID}&sort=price&limit=10` +
      `&filter=${encodeURIComponent(`buyingOptions:{FIXED_PRICE},conditionIds:{${CONDITION_IDS_FILTER}}`)}`;

    const res = await fetch(apiUrl, {
      headers: {
        Authorization:             `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "Content-Type":            "application/json",
      },
      signal: AbortSignal.timeout(6_000),
    });

    if (!res.ok) {
      console.warn("[eBay Consoles] Search failed", res.status, query);
      return null;
    }

    const data = (await res.json()) as {
      itemSummaries?: Array<{
        title?:       string;
        price?:       { value?: string; currency?: string };
        itemWebUrl?:  string;
        condition?:   string;
        image?:       { imageUrl?: string };
      }>;
    };

    const candidates = (data.itemSummaries ?? [])
      .map(item => ({
        title:     item.title ?? "",
        price:     parseFloat(item.price?.value ?? ""),
        url:       item.itemWebUrl ?? "",
        imageUrl:  item.image?.imageUrl ?? null,
        condition: normalizeCondition(item.condition),
      }))
      .filter((c): c is { title: string; price: number; url: string; imageUrl: string | null; condition: ConsoleCondition } =>
        !isNaN(c.price) && c.price > 0 && !!c.url && c.condition !== null && !isBlocklisted(c.title),
      );

    if (candidates.length === 0) return null;

    const cheapest = candidates.reduce((a, b) => (b.price < a.price ? b : a));
    return {
      title:     cheapest.title,
      price:     cheapest.price,
      url:       applyEbayEpnParams(cheapest.url),
      imageUrl:  cheapest.imageUrl,
      condition: cheapest.condition,
    };
  } catch (err) {
    console.warn("[eBay Consoles] Lookup error:", err);
    return null;
  }
}
