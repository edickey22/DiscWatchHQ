/**
 * eBay Browse API client — live console listings for the "Consoles" section.
 *
 * Separate from ebayBrowseClient.ts (per-game pricing) even though it shares
 * the same OAuth token cache — consoles need a different eBay category,
 * multiple curated search queries, and condition/junk-safety filtering that
 * game listings don't require.
 *
 * Requires the same two env vars as ebayBrowseClient.ts:
 *   EBAY_APP_ID          — OAuth Client ID (App ID) from developer.ebay.com
 *   EBAY_CLIENT_SECRET   — OAuth Client Secret from developer.ebay.com
 * When either is absent, ebayConsolesConfigured is false and every lookup
 * returns an empty result (the Consoles pages show a graceful fallback).
 *
 * ── Junk / non-console filtering ────────────────────────────────────────
 *
 * eBay's "Video Game Consoles" category (139971) is not scoped tightly
 * enough on its own — accessories, replacement parts, repair services,
 * manuals, and even sibling hardware models (a "PS5 Pro" search returning
 * a PS4, or a "Switch 2" search returning the original Switch) routinely
 * surface in a plain keyword search. This client applies several layers
 * before a result is ever shown to a visitor:
 *
 *   1. API-level condition filter: excludes conditionIds 7000
 *      ("For parts or not working") outright.
 *   2. Title blocklist: drops any candidate whose title matches a known
 *      non-console pattern — manuals, replacement/repair parts, empty
 *      boxes/shells, accessories-only listings, broken/DOA hardware, etc.
 *      (see NON_CONSOLE_TERMS below).
 *   3. Per-model require/exclude terms: some models are only reliably
 *      distinguished from a close sibling (Series X vs Series S, Switch 2
 *      vs Switch, PS5 Pro vs PS5/PS4) by asserting a term the real model's
 *      title must contain, and/or terms it must never contain — see
 *      requireTerms/excludeTerms on ConsoleModel (consoleModels.ts). Query
 *      `-"term"` exclusions alone aren't reliable enough on their own,
 *      since eBay's relevance search still surfaces semantically related
 *      sibling models; this is a second, server-side gate applied after
 *      the fetch.
 *   4. Minimum price floor per hardware generation: accessories and parts
 *      are almost always listed far below a real console's price, so a
 *      generation-tiered price floor catches junk that slips past the
 *      title blocklist (e.g. an untitled "console" bundle that's actually
 *      just a dock).
 *   5. Badge safety: only listings whose condition normalizes cleanly to
 *      "New", "Used", or "Seller Refurbished" are shown. Anything else
 *      (ambiguous/unrecognized condition strings) is dropped rather than
 *      displayed with a vague or missing badge.
 */

import { applyEbayEpnParams } from "./affiliateConfig";
import { getAccessToken, ebayBrowseConfigured, EbayRateLimitError } from "./ebayBrowseClient";
import { checkAndReserveEbayCall } from "./ebayBudget";
import { logger } from "./logger";
import type { ConsoleModel, ConsoleGeneration } from "./consoleModels";

export const ebayConsolesConfigured = ebayBrowseConfigured;

// eBay category ID for "Video Game Consoles" (distinct from 139973 = Video Games)
const CONSOLES_CATEGORY_ID = "139971";

// conditionIds included: 1000 New, 1500 New other, 2000 Certified Refurbished,
// 2500 Seller Refurbished, 3000 Used. 7000 (For parts or not working) is
// deliberately excluded — this is the primary safety filter.
const CONDITION_IDS_FILTER = "1000|1500|2000|2500|3000";

/**
 * Title blocklist — drops manuals, replacement/repair parts, accessory-only
 * listings, and known-broken hardware regardless of declared condition.
 * Grouped by category purely for readability; matching is a flat
 * case-insensitive substring test against the whole list.
 */
const NON_CONSOLE_TERMS = [
  // Broken / non-functional (backup for the API conditionIds filter)
  "broken", "not working", "no power", "for parts", "spares/repair",
  "spares or repair", "faulty", "doa", "d.o.a", "doesn't work", "does not work",
  "won't turn on", "wont turn on", "cracked screen", "water damage", "as is",
  "untested", "for repair", "repair only", "parts/repair", "repair/parts",
  "parts or repair", "repair or parts",

  // Manuals / print material / media-only
  "manual", "instruction booklet", "instructions only", "strategy guide",
  "poster", "artwork print", "insert only", "box insert",

  // Repair parts / internals / service
  "motherboard", "mainboard", "logic board", "board only", "replacement part",
  "spare part", "spare parts", "repair service", "hdmi board", "laser lens",
  "optical drive replacement", "capacitor", "soldering",

  // Shell / cosmetic-only
  "shell only", "shell replacement", "housing only", "faceplate",
  "case only", "box only", "empty box", "console skin", "vinyl skin",
  "decal set", "sticker set", "screen protector",

  // Accessories-only (no console included)
  "controller only", "joy-con only", "joycon only", "dock only",
  "charger only", "charging cable", "cable only", "power supply only",
  "psu only", "carrying case", "storage bag", "travel case", "stand only",
  "mount only", "cartridge only", "cart only", "disc only", "game only",
  "tablet only", "screen only", "digital only", "no console",
  "console not included", "console excluded", "without console",

  // Non-hardware collectibles that share keywords
  "keychain", "plush", "funko", "replica", "figure", "mini figure",
];

/**
 * Minimum plausible price (USD) for a real, complete console at each
 * hardware generation tier. Anything below this is almost certainly an
 * accessory, part, or mislabeled listing rather than the actual console —
 * catches junk that slips past the title blocklist.
 */
const MIN_PRICE_BY_GENERATION: Record<ConsoleGeneration, number> = {
  current: 120,
  previous: 40,
  retro: 15,
};

function isNonConsole(title: string): boolean {
  const lower = title.toLowerCase();
  return NON_CONSOLE_TERMS.some(term => lower.includes(term));
}

/**
 * Word-boundary-ish substring test — avoids "pro" matching inside unrelated
 * words while still tolerating punctuation (e.g. "PS5-Pro"). Uses lookaround
 * against alphanumerics rather than \b so it works for multi-word terms too.
 */
function containsTerm(title: string, term: string): boolean {
  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(title);
}

function matchesModelTerms(
  title: string,
  model: Pick<ConsoleModel, "requireTerms" | "excludeTerms">,
): boolean {
  if (model.excludeTerms?.some(term => containsTerm(title, term))) return false;
  // requireTerms is a set of acceptable phrasings — at least one must appear
  // (e.g. "5 pro" or "5pro" both count as a real PS5 Pro title), not all of
  // them simultaneously.
  if (model.requireTerms && !model.requireTerms.some(term => containsTerm(title, term))) return false;
  return true;
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
  price:     number;             // USD — current bid for auctions, list price otherwise
  url:       string;             // direct item URL, EPN-tagged
  imageUrl:  string | null;
  condition: ConsoleCondition;
  isAuction: boolean;
  bidCount?: number;              // present only when isAuction
  endsAt?:   number | null;       // ms epoch, present only when isAuction
}

/**
 * Search the eBay Browse API for one console model and return every
 * qualifying listing (safety-filtered, EPN-tagged, cheapest-first), capped
 * at `cacheLimit`. A single API call is made per invocation regardless of
 * how many listings are ultimately returned — the Browse API returns up to
 * `rawLimit` candidates per call, which are then filtered down.
 *
 * IMPORTANT — `cacheLimit` is a storage ceiling, not a display ceiling.
 * Everything this function returns gets written to the in-process cache
 * (consoleListingsCache.ts) verbatim; the frontend then renders an initial
 * page of that array and reveals more via "Show more" entirely client-side.
 * Do NOT shrink `cacheLimit` to control how many listings a visitor sees at
 * once — that's the frontend's LISTINGS_PAGE_SIZE's job. Conflating the two
 * previously caused real, filtered, in-stock matches to be discarded at
 * fetch time (never cached at all) purely because the display cap of the
 * moment was set too low — "Show more" had nothing beyond that cap to page
 * through since it was never saved anywhere.
 *
 * Includes both Buy It Now (FIXED_PRICE) and live AUCTION listings — for
 * auctions, `price` is the current bid (or starting bid if no bids yet),
 * exposed via `isAuction`/`bidCount`/`endsAt` so the UI can show a bid
 * count and time-left instead of implying a fixed purchase price.
 *
 * Returns an empty array when:
 *   - credentials are not configured
 *   - no listing survives the condition + blocklist + require/exclude-term
 *     + price-floor filters
 *   - the API call fails or times out
 *
 * IMPORTANT — quota management: this must only ever be called from the
 * scheduled background refresh (consoleListingsScheduler.ts), never from a
 * visitor-facing request handler. See that file for the call budget.
 */
export async function getEbayConsoleListings(
  model: ConsoleModel,
  cacheLimit = 200,
): Promise<ConsoleListing[]> {
  if (!ebayConsolesConfigured) return [];

  if (!(await checkAndReserveEbayCall("console"))) {
    logger.debug({ consoleId: model.id }, "[eBay Consoles] Daily call budget exhausted — skipping refresh");
    return [];
  }

  try {
    const token = await getAccessToken();
    if (!token) return [];

    // IMPORTANT: no `sort=price`. Sorting cheapest-first surfaces accessories,
    // parts, and unrelated low-price junk almost exclusively — real consoles
    // cost far more than the incidental items sharing the same category/
    // keywords, so a price-ascending sort buries every genuine listing past
    // the raw fetch window. Best-match relevance (the API's default when no
    // `sort` param is given) reliably surfaces the actual console model
    // being searched for; we sort by price ourselves *after* filtering.
    //
    // rawLimit=200 is the Browse API's maximum page size — pulling the full
    // page costs exactly the same 1 API call as pulling 60 did, so raising
    // it is free. It just gives the filtering step below a much bigger pool
    // of real candidates to keep, instead of throwing away extra genuine
    // matches purely because we stopped asking eBay for them.
    const rawLimit = 200;
    const q = encodeURIComponent(model.query);
    const apiUrl =
      `https://api.ebay.com/buy/browse/v1/item_summary/search` +
      `?q=${q}&category_ids=${CONSOLES_CATEGORY_ID}&limit=${rawLimit}` +
      `&filter=${encodeURIComponent(`buyingOptions:{FIXED_PRICE|AUCTION},conditionIds:{${CONDITION_IDS_FILTER}}`)}`;

    // Retry transient network/timeout failures once before giving up. This
    // matters because a single logical "refresh this model" attempt only
    // happens once every REFRESH_INTERVAL_MS (24h) — if the one shot times
    // out (observed happening under the back-to-back 2s-apart call burst
    // across all 26 models at startup), the model was previously stuck
    // showing "no listings" for a full day with no recovery until the next
    // scheduled cycle. A real 429 still aborts immediately (handled below,
    // not retried here) since that's a signal to back off, not a fluke.
    const MAX_ATTEMPTS = 2;
    let res: Response | null = null;
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        res = await fetch(apiUrl, {
          headers: {
            Authorization:             `Bearer ${token}`,
            "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
            "Content-Type":            "application/json",
          },
          signal: AbortSignal.timeout(12_000),
        });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_ATTEMPTS) {
          logger.warn({ consoleId: model.id, attempt, err }, "[eBay Consoles] Fetch failed — retrying once");
          await new Promise(r => setTimeout(r, 1_500));
        }
      }
    }
    if (!res) {
      logger.warn({ consoleId: model.id, err: lastErr }, "[eBay Consoles] Fetch failed after retry — returning empty for this cycle");
      return [];
    }

    if (res.status === 429) {
      logger.error({ consoleId: model.id }, "[eBay Consoles] Rate limited (429) — signaling caller to back off");
      throw new EbayRateLimitError(`console listings for "${model.id}"`);
    }

    if (!res.ok) {
      console.warn("[eBay Consoles] Search failed", res.status, model.query);
      return [];
    }

    const data = (await res.json()) as {
      itemSummaries?: Array<{
        title?:           string;
        price?:           { value?: string; currency?: string };
        currentBidPrice?: { value?: string; currency?: string };
        bidCount?:        number;
        itemEndDate?:     string;
        buyingOptions?:   string[];
        itemWebUrl?:      string;
        condition?:       string;
        image?:           { imageUrl?: string };
      }>;
    };

    const minPrice = MIN_PRICE_BY_GENERATION[model.generation];

    const mapped = (data.itemSummaries ?? []).map(item => {
      const isAuction = !!item.buyingOptions?.includes("AUCTION") && !item.buyingOptions?.includes("FIXED_PRICE");
      const price = isAuction
        ? parseFloat(item.currentBidPrice?.value ?? "")
        : parseFloat(item.price?.value ?? "");
      return {
        title:     item.title ?? "",
        price,
        url:       item.itemWebUrl ?? "",
        imageUrl:  item.image?.imageUrl ?? null,
        condition: normalizeCondition(item.condition),
        isAuction,
        bidCount:  isAuction ? (item.bidCount ?? 0) : undefined,
        endsAt:    isAuction && item.itemEndDate ? Date.parse(item.itemEndDate) : undefined,
      };
    });

    const filtered = mapped
      .filter(c =>
        !isNaN(c.price) &&
        c.price >= minPrice &&
        !!c.url &&
        c.condition !== null &&
        !isNonConsole(c.title) &&
        matchesModelTerms(c.title, model),
      )
      .sort((a, b) => a.price - b.price);

    // Diagnostic-level visibility into the raw→filtered→cached funnel per
    // model, so "why do I only see N listings" is answerable from logs
    // instead of guesswork: is N the real total after filtering, or is the
    // storage cap itself trimming a bigger surviving set?
    logger.debug(
      { consoleId: model.id, rawCount: mapped.length, filteredCount: filtered.length, cacheLimit },
      "[eBay Consoles] Raw→filtered→cached funnel"
    );

    const candidates = filtered.slice(0, cacheLimit);

    return candidates.map(c => ({
      title:     c.title,
      price:     c.price,
      url:       applyEbayEpnParams(c.url),
      imageUrl:  c.imageUrl,
      condition: c.condition as ConsoleCondition,
      isAuction: c.isAuction,
      ...(c.isAuction ? { bidCount: c.bidCount, endsAt: c.endsAt ?? null } : {}),
    }));
  } catch (err) {
    if (err instanceof EbayRateLimitError) throw err; // let the scheduler's loop see it and back off
    console.warn("[eBay Consoles] Lookup error:", err);
    return [];
  }
}
