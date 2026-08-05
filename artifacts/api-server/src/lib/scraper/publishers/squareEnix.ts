/**
 * Square Enix NA Store scraper — na.store.square-enix-games.com
 *
 * Platform: BigCommerce (Stencil theme). Product listing pages are
 * server-rendered — full HTML including title, price, image, and CTA button
 * is present in the initial GET response without any JavaScript execution.
 *
 * Category scraped: /video-games (paginated, 16 products/page)
 * This is SE's own "Video Games" category; merchandise, art books, and
 * figures live in separate categories and are excluded by default.
 *
 * robots.txt (na.store.square-enix-games.com):
 *   Disallows: /account.php, /cart.php, /checkout, /login.php, /search.php,
 *              /wishlist.php, /admin/ — product and category pages are allowed.
 *
 * Status detection (from CTA button text in card HTML):
 *   "Pre-Order Now"   → coming_soon
 *   "+ Add to Cart"   → available
 *   (neither present) → sold_out (SE may omit sold-out items from listings)
 *
 * isGame filter: the /video-games category is already game-specific, but a
 * small number of art books and companion items slip through. Any card whose
 * title contains no recognised platform keyword is treated as non-game and
 * skipped. Platform keywords are matched against the full title.
 *
 * Platform detail-page enrichment: when neither the title nor URL slug
 * contain a recognisable platform keyword the scraper fetches the product
 * detail page and extracts platform from:
 *   1. BigCommerce product spec table  (<th>Platform</th> / <td>…</td>)
 *   2. JSON-LD Product schema          (additionalProperty[name=Platform])
 *   3. <meta name="keywords">          (comma-split; keyword match)
 *   4. Open Graph description          (<meta property="og:description">)
 *   5. Plain-text meta description     (<meta name="description">)
 * Fetches are rate-limited to 1 per 2 s and capped at MAX_DETAIL_FETCHES per
 * run to stay polite. If the detail page also has no platform the item is
 * kept with platforms = ["Unknown"].
 *
 * Cloudflare notes: the store has Cloudflare in front but does NOT apply a
 * JS challenge to the /video-games listing path. Browser-like Accept and
 * Sec-Fetch headers are required; a bare User-Agent without Accept headers
 * triggers a CF bot-check that returns an empty body. The store uses
 * Cloudflare NEL reporting but no Turnstile or JS challenge on GET requests
 * to category pages.
 *
 * Confidence: MEDIUM — BC HTML scraping; structure tied to their Stencil
 * theme. Any theme update could break selectors. Validated 2026-08-05.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db, publishersTable, releasesTable } from "@workspace/db";
import { logger } from "../../logger";
import type { PublisherScraper, ScrapedRelease } from "../types";

const BASE = "https://na.store.square-enix-games.com";

/** Max detail-page fetches per scrape run — keeps total runtime reasonable */
const MAX_DETAIL_FETCHES = 20;

/** Delay (ms) between detail-page requests — polite rate limiting */
const DETAIL_FETCH_DELAY_MS = 2_000;

/**
 * Merchandise category paths to scrape in addition to /video-games.
 * These are SE-Store-exclusive items (figures, plush, apparel, etc.) —
 * no boutique quality filter is applied; all in-stock and pre-order items
 * are included, consistent with how Blizzard Gear Store merch is handled.
 */
const MERCH_CATEGORIES = [
  "/merchandise/figures",
  "/merchandise/plush",
  "/merchandise/jewelry",
  "/merchandise/accessories",
  "/merchandise/home-goods",
  "/merchandise/apparel",
  "/ffxiv-merchandise",
] as const;

/** Max pages per merch category (16 products/page → up to ~240 per category) */
const MAX_MERCH_PAGES = 15;

/** Delay (ms) between pages within a merch category */
const MERCH_PAGE_DELAY_MS = 1_500;

/** Delay (ms) between consecutive merch categories — stay polite to Cloudflare */
const INTER_CATEGORY_DELAY_MS = 3_000;

/** Browser-like headers required to pass Cloudflare's bot heuristics */
const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Accept-Encoding": "gzip, deflate, br",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Cache-Control": "max-age=0",
};

// ── HTML parsers ──────────────────────────────────────────────────────────────

interface ParsedCard {
  title: string;
  productUrl: string;
  price: string | null;
  coverImageUrl: string | null;
  status: ScrapedRelease["status"];
  platforms: string[];
  editionType: string | null;
}

/**
 * Extract all product cards from a BigCommerce Stencil category page.
 * Cards are <article class="card" data-product-id="..."> elements.
 */
function parseCards(html: string): ParsedCard[] {
  // Match individual card articles. BC Stencil wraps each in <article ...> </article>.
  const cardPattern =
    /<article[^>]+class="[^"]*\bcard\b[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
  const cards: ParsedCard[] = [];

  let match: RegExpExecArray | null;
  while ((match = cardPattern.exec(html)) !== null) {
    const cardHtml = match[1];
    const parsed = parseCard(cardHtml);
    if (parsed) cards.push(parsed);
  }

  return cards;
}

/** Decode common HTML entities found in BC Stencil product titles */
function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
}

function parseCard(html: string): ParsedCard | null {
  // ── Title + URL ──────────────────────────────────────────────────────────
  // <h3 class="prod-name"><a href="https://na.store.../.../slug">TITLE</a></h3>
  const titleMatch = html.match(
    /<h3[^>]+class="[^"]*prod-name[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/
  );
  if (!titleMatch) return null;

  const productUrl = titleMatch[1].trim();
  const title = decodeEntities(titleMatch[2]);
  if (!title || !productUrl) return null;

  // ── isGame filter ────────────────────────────────────────────────────────
  // /video-games is SE's game-specific category. Non-game items (art books,
  // figures, digital codes) occasionally appear. Block on a targeted keyword
  // blocklist rather than requiring a platform keyword — SE often omits
  // platform from the title on older or multi-platform listings.
  const titleLower = title.toLowerCase();

  const nonGameKws = [
    // Digital-only / subscriptions
    "game time card", "day game time", "free trial", "- digital",
    // Art books, companion media
    "art book", "artbook", "art of ", "the art of", "relics of heritage",
    "making of",
    // Figures and merch
    "crystal monsters gallery", "figure", "statue", "plush",
    // Audio / other media
    "soundtrack",
    // Apparel / accessories
    "t-shirt", "hoodie", "poster", "pin set", "lanyard",
  ];
  if (nonGameKws.some((kw) => titleLower.includes(kw))) return null;

  const slug = productUrl.replace(/^https?:\/\/[^/]+/, "");
  const platforms = extractPlatforms(title, slug);

  // ── Price ────────────────────────────────────────────────────────────────
  // <span data-product-price-without-tax class="price price--withoutTax">$59.99</span>
  const priceMatch = html.match(
    /<span[^>]+data-product-price-without-tax[^>]*class="[^"]*price[^"]*"[^>]*>\s*(\$[\d,]+\.?\d*)\s*<\/span>/
  );
  const price = priceMatch ? priceMatch[1].trim() : null;

  // ── Cover image ──────────────────────────────────────────────────────────
  // <img class="card-image lazyload" data-src="https://cdn11.bigcommerce.com/...">
  const imgMatch = html.match(
    /<img[^>]+class="[^"]*card-image[^"]*"[^>]+data-src="([^"]+)"/
  );
  const coverImageUrl = imgMatch ? imgMatch[1].trim() : null;

  // ── Status ───────────────────────────────────────────────────────────────
  // "Pre-Order Now" button → coming_soon; any "Add to Cart" CTA → available.
  // If neither is present SE may not list the item (sold_out is rare on listing pages).
  let status: ScrapedRelease["status"] = "sold_out";
  if (/Pre-Order Now/i.test(html)) {
    status = "coming_soon";
  } else if (/Add to Cart|\+\s*Add to Cart/i.test(html)) {
    status = "available";
  }

  // ── Edition type ─────────────────────────────────────────────────────────
  const editionType = extractEditionType(title);

  // ── Boutique filter ───────────────────────────────────────────────────────
  // SE's /video-games page mixes genuine boutique items with standard retail
  // back-catalog (clearance titles available at any major retailer). Keep only:
  //   (a) Pre-orders (coming_soon) — SE Store-exclusive window while it lasts
  //   (b) Named special editions   — Limited / Collector / Deluxe / Special
  // Everything else is standard retail and should not appear in the boutique
  // tracker. Future titles that lack a pre-order button today will re-appear
  // once SE opens pre-orders and the card shows "Pre-Order Now".
  if (status !== "coming_soon" && editionType === null) return null;

  return { title, productUrl, price, coverImageUrl, status, platforms, editionType };
}

/**
 * Extract canonical platform names from a SE product title + URL slug combined.
 *
 * SE puts the platform in the title for new releases ("OCTOPATH TRAVELER - Switch 2")
 * and sometimes in the URL slug ("final-fantasy-vii-rebirth---switch-2"). Older
 * listings have neither — in that case we return ["Unknown"] so the item is still
 * included rather than silently dropped (and eligible for detail-page enrichment).
 */
function extractPlatforms(title: string, slug: string): string[] {
  // Combine title and URL slug — platforms appear in at least one of the two
  const combined = `${title} ${slug}`;
  const found = extractPlatformsFromText(combined);
  // Fall back to ["Unknown"] so the item is kept in results and can be enriched
  // via its detail page. Returning [] would cause the unknownItems filter to miss
  // these items, silently skipping detail-page enrichment for them.
  return found.length > 0 ? found : ["Unknown"];
}

/**
 * Core platform keyword matcher — works on any text (title, slug, description,
 * meta keywords, spec table values, JSON-LD properties, etc.).
 *
 * Returns [] when no platform is found (callers decide the fallback).
 */
function extractPlatformsFromText(text: string): string[] {
  const platforms: string[] = [];

  // Switch 2 must be tested before plain Switch
  if (/switch[\s-]?2/i.test(text)) platforms.push("Switch 2");
  if (
    !platforms.includes("Switch 2") &&
    (/nintendo[\s-]switch/i.test(text) || /\bswitch\b/i.test(text))
  ) {
    platforms.push("Switch");
  }
  if (/\bps5\b|playstation[\s-]?5/i.test(text)) platforms.push("PS5");
  if (/\bps4\b|playstation[\s-]?4/i.test(text)) platforms.push("PS4");
  if (/xbox[\s-]series/i.test(text)) platforms.push("Xbox Series");
  if (/xbox[\s-]one(?![\s-]x\b)/i.test(text)) platforms.push("Xbox One");
  if (/\bpc\b|windows/i.test(text)) platforms.push("PC");

  return platforms;
}

function extractEditionType(title: string): string | null {
  if (/collector'?s?\s+edition/i.test(title)) return "Collector's Edition";
  if (/limited\s+edition/i.test(title)) return "Limited Edition";
  if (/deluxe\s+edition/i.test(title)) return "Deluxe Edition";
  if (/special\s+edition/i.test(title)) return "Special Edition";
  return null;
}

// ── Detail-page platform extraction ──────────────────────────────────────────

/**
 * Parse platform from a BigCommerce Stencil product detail page.
 *
 * Tries, in order:
 *   1. BC product spec table  — <th>Platform</th> adjacent <td>
 *   2. JSON-LD Product schema — additionalProperty array
 *   3. <meta name="keywords"> — comma-split tokens, keyword-matched
 *   4. og:description         — free-text keyword match
 *   5. meta description       — free-text keyword match
 *
 * Returns [] if nothing is found.
 */
function extractPlatformFromDetailHtml(html: string): string[] {
  // 1. BigCommerce product spec/details table
  //    Pattern: <th ...>Platform</th> (any whitespace) <td ...>value</td>
  //    BC Stencil also renders as <dt>Platform</dt><dd>value</dd>
  const specPatterns = [
    // Standard table row
    /<th[^>]*>\s*Platform\s*<\/th>\s*<td[^>]*>([^<]+)<\/td>/i,
    // Definition list
    /<dt[^>]*>\s*Platform\s*<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>/i,
    // Label-value span pair
    /Platform\s*:\s*<\/[^>]+>\s*<[^>]+>([^<]+)</i,
  ];
  for (const pattern of specPatterns) {
    const m = html.match(pattern);
    if (m) {
      const value = decodeEntities(m[1].trim());
      const found = extractPlatformsFromText(value);
      if (found.length > 0) {
        logger.debug({ value, found }, "SE detail: platform from spec table");
        return found;
      }
    }
  }

  // 2. JSON-LD Product schema
  //    BC Stencil injects <script type="application/ld+json"> with Product data.
  //    The schema may carry additionalProperty items or a "description" field.
  const jsonLdPattern = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let jMatch: RegExpExecArray | null;
  while ((jMatch = jsonLdPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(jMatch[1]);
      const items: unknown[] = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (typeof item !== "object" || item === null) continue;
        const obj = item as Record<string, unknown>;

        // additionalProperty: [{ "@type": "PropertyValue", "name": "Platform", "value": "PlayStation 5" }]
        if (Array.isArray(obj.additionalProperty)) {
          for (const prop of obj.additionalProperty as Record<string, unknown>[]) {
            if (
              typeof prop === "object" &&
              prop !== null &&
              /platform/i.test(String(prop.name ?? ""))
            ) {
              const val = String(prop.value ?? "");
              const found = extractPlatformsFromText(val);
              if (found.length > 0) {
                logger.debug({ val, found }, "SE detail: platform from JSON-LD additionalProperty");
                return found;
              }
            }
          }
        }

        // description field — free-text fallback
        if (typeof obj.description === "string") {
          const found = extractPlatformsFromText(obj.description);
          if (found.length > 0) {
            logger.debug({ found }, "SE detail: platform from JSON-LD description");
            return found;
          }
        }
      }
    } catch {
      // malformed JSON-LD — skip
    }
  }

  // 3. <meta name="keywords"> — comma-separated tokens
  const kwMatch = html.match(/<meta\s+name="keywords"\s+content="([^"]+)"/i)
    ?? html.match(/<meta\s+content="([^"]+)"\s+name="keywords"/i);
  if (kwMatch) {
    const found = extractPlatformsFromText(kwMatch[1]);
    if (found.length > 0) {
      logger.debug({ found }, "SE detail: platform from meta keywords");
      return found;
    }
  }

  // 4. og:description
  const ogDescMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)
    ?? html.match(/<meta\s+content="([^"]+)"\s+property="og:description"/i);
  if (ogDescMatch) {
    const found = extractPlatformsFromText(decodeEntities(ogDescMatch[1]));
    if (found.length > 0) {
      logger.debug({ found }, "SE detail: platform from og:description");
      return found;
    }
  }

  // 5. Plain meta description
  const metaDescMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)
    ?? html.match(/<meta\s+content="([^"]+)"\s+name="description"/i);
  if (metaDescMatch) {
    const found = extractPlatformsFromText(decodeEntities(metaDescMatch[1]));
    if (found.length > 0) {
      logger.debug({ found }, "SE detail: platform from meta description");
      return found;
    }
  }

  return [];
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

/**
 * Fetch one page of a SE Store category listing.
 * Works for both /video-games and the merch category paths.
 */
async function fetchCategoryPage(categoryPath: string, page: number): Promise<string | null> {
  const url = `${BASE}${categoryPath}${page > 1 ? `?page=${page}` : ""}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    logger.warn({ page, url, err: String(err) }, "Square Enix: fetch error");
    return null;
  }

  if (!res.ok) {
    logger.warn({ page, url, status: res.status }, "Square Enix: non-OK response");
    return null;
  }

  const html = await res.text();

  // A Cloudflare challenge page is tiny (< 5 KB) — treat as a failed fetch.
  if (html.length < 5_000) {
    logger.warn({ page, url, bytes: html.length }, "Square Enix: response too small, likely CF challenge");
    return null;
  }

  return html;
}

/** Convenience wrapper kept for backward-compat with the /video-games loop below. */
const fetchPage = (page: number) => fetchCategoryPage("/video-games", page);

/**
 * Fetch a single product detail page and return its HTML, or null on failure.
 * Uses the same Cloudflare-friendly headers as the category page fetcher.
 */
async function fetchDetailPage(productUrl: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(productUrl, {
      headers: HEADERS,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    logger.warn({ productUrl, err: String(err) }, "Square Enix: detail fetch error");
    return null;
  }

  if (!res.ok) {
    logger.warn({ productUrl, status: res.status }, "Square Enix: detail non-OK response");
    return null;
  }

  const html = await res.text();

  if (html.length < 5_000) {
    logger.warn({ productUrl, bytes: html.length }, "Square Enix: detail response too small, likely CF challenge");
    return null;
  }

  return html;
}

// ── Merch card parsing ────────────────────────────────────────────────────────
// Separate from parseCard() — merch items need no platform extraction, no
// boutique-quality filter, and no non-game keyword blocklist.

/**
 * Parse a single product card from a SE merch category page.
 *
 * Unlike parseCard() for /video-games this function:
 *   - Applies NO platform extraction (platforms = [])
 *   - Applies NO boutique-quality filter (all in-stock/pre-order items kept)
 *   - Applies NO non-game keyword blocklist (figures, plush, etc. are fine)
 *   - Only skips digital-only/gift-card items that have no physical fulfilment
 */
function parseMerchCard(html: string): ParsedCard | null {
  // Title + URL (same selector as game cards — BC Stencil is consistent)
  const titleMatch = html.match(
    /<h3[^>]+class="[^"]*prod-name[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/
  );
  if (!titleMatch) return null;

  const productUrl = titleMatch[1].trim();
  const title = decodeEntities(titleMatch[2]);
  if (!title || !productUrl) return null;

  // Skip digital-only / subscription / gift card items (no physical item shipped)
  const titleLower = title.toLowerCase();
  if (/gift\s*card|free\s*trial|\bdigital\b|\bsubscription\b/.test(titleLower)) return null;

  // Price
  const priceMatch = html.match(
    /<span[^>]+data-product-price-without-tax[^>]*class="[^"]*price[^"]*"[^>]*>\s*(\$[\d,]+\.?\d*)\s*<\/span>/
  );
  const price = priceMatch ? priceMatch[1].trim() : null;

  // Cover image
  const imgMatch = html.match(
    /<img[^>]+class="[^"]*card-image[^"]*"[^>]+data-src="([^"]+)"/
  );
  const coverImageUrl = imgMatch ? imgMatch[1].trim() : null;

  // Status (same CTA-button heuristic as game cards)
  let status: ScrapedRelease["status"] = "sold_out";
  if (/Pre-Order Now/i.test(html)) {
    status = "coming_soon";
  } else if (/Add to Cart|\+\s*Add to Cart/i.test(html)) {
    status = "available";
  }

  // Merch has no game platform and no game-edition type
  return { title, productUrl, price, coverImageUrl, status, platforms: [], editionType: null };
}

/**
 * Extract all product cards from a SE merch category page using parseMerchCard().
 * Uses the same <article class="card"> selector as parseCards() —
 * BC Stencil uses identical markup for all category pages.
 */
function parseMerchCards(html: string): ParsedCard[] {
  const cardPattern =
    /<article[^>]+class="[^"]*\bcard\b[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
  const cards: ParsedCard[] = [];
  let match: RegExpExecArray | null;
  while ((match = cardPattern.exec(html)) !== null) {
    const parsed = parseMerchCard(match[1]);
    if (parsed) cards.push(parsed);
  }
  return cards;
}

// ── Exports for testing ───────────────────────────────────────────────────────
// These pure parsing functions are exported so the smoke-test suite can unit-test
// each extraction strategy against fixture HTML without making network calls.

/** @internal */
export { extractPlatformFromDetailHtml, extractPlatformsFromText, parseCards, parseMerchCards };

// ── Scraper export ────────────────────────────────────────────────────────────

export const squareEnixScraper: PublisherScraper = {
  slug: "square-enix",

  async scrape(): Promise<ScrapedRelease[]> {
    logger.info("Starting Square Enix scrape");

    const results: ScrapedRelease[] = [];
    const seen = new Set<string>(); // dedupe by productUrl slug
    const MAX_PAGES = 15;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const html = await fetchPage(page);

      if (!html) {
        logger.warn({ page }, "Square Enix: aborting pagination — fetch failed");
        break;
      }

      const cards = parseCards(html);

      if (cards.length === 0) {
        logger.info({ page }, "Square Enix: no products on page, pagination done");
        break;
      }

      logger.debug({ page, count: cards.length }, "Square Enix: parsed cards");

      for (const card of cards) {
        const slug = card.productUrl.replace(/^https?:\/\/[^\/]+/, "");
        if (seen.has(slug)) continue;
        seen.add(slug);

        results.push({
          externalId: slug,
          title: card.title,
          platforms: card.platforms,
          status: card.status,
          coverImageUrl: card.coverImageUrl,
          productUrl: card.productUrl,
          price: card.price,
          editionType: card.editionType,
          preorderCloseDate: null,
          releaseDate: null,
        });
      }

      // Polite delay between pages — Cloudflare rate-limits aggressive bursts
      if (page < MAX_PAGES) await new Promise((r) => setTimeout(r, 1_500));
    }

    // ── Merchandise categories ────────────────────────────────────────────────
    // All SE merch is SE-Store-exclusive by nature — no boutique filter needed.
    // Consistent with Blizzard Gear Store's approach: include everything except
    // digital/gift-card items. platforms=[] since merch has no game platform.
    logger.info({ categories: MERCH_CATEGORIES.length }, "Square Enix: starting merch category scrape");
    let totalMerchFound = 0;

    for (let ci = 0; ci < MERCH_CATEGORIES.length; ci++) {
      const categoryPath = MERCH_CATEGORIES[ci];

      // Polite pause between categories
      if (ci > 0) await new Promise((r) => setTimeout(r, INTER_CATEGORY_DELAY_MS));

      logger.debug({ categoryPath }, "Square Enix: scraping merch category");
      let categoryCount = 0;

      for (let page = 1; page <= MAX_MERCH_PAGES; page++) {
        const html = await fetchCategoryPage(categoryPath, page);

        if (!html) {
          logger.warn({ categoryPath, page }, "Square Enix: merch fetch failed, skipping rest of category");
          break;
        }

        const cards = parseMerchCards(html);

        if (cards.length === 0) {
          logger.info({ categoryPath, page }, "Square Enix: merch pagination done");
          break;
        }

        logger.debug({ categoryPath, page, count: cards.length }, "Square Enix: parsed merch cards");

        for (const card of cards) {
          const slug = card.productUrl.replace(/^https?:\/\/[^/]+/, "");
          if (seen.has(slug)) continue;
          seen.add(slug);
          categoryCount++;

          results.push({
            externalId:       slug,
            title:            card.title,
            platforms:        card.platforms,       // [] for merch
            status:           card.status,
            coverImageUrl:    card.coverImageUrl,
            productUrl:       card.productUrl,
            price:            card.price,
            editionType:      card.editionType,     // null for merch
            preorderCloseDate: null,
            releaseDate:      null,
          });
        }

        if (page < MAX_MERCH_PAGES) await new Promise((r) => setTimeout(r, MERCH_PAGE_DELAY_MS));
      }

      logger.info({ categoryPath, found: categoryCount }, "Square Enix: merch category done");
      totalMerchFound += categoryCount;
    }

    logger.info(
      { videoGamesCount: results.length - totalMerchFound, totalMerchFound, total: results.length },
      "Square Enix: all categories scraped"
    );

    // ── Detail-page enrichment for "Unknown" platform items ──────────────────
    // Fetch individual product pages only for releases where neither the listing
    // title nor URL slug contained a recognisable platform keyword.
    //
    // Cache check: before making any network requests we query the DB for any
    // externalId that already has a resolved (non-Unknown) platform from a
    // prior run. Those items get the cached value applied immediately; only
    // items still Unknown after the DB check consume a detail-page fetch.
    // This cuts detail-page traffic to near zero after the first full pass.
    const unknownItems = results.filter(
      (r) => r.platforms.length === 1 && r.platforms[0] === "Unknown"
    );

    if (unknownItems.length > 0) {
      // ── Step 1: apply DB-cached platforms (zero network cost) ─────────────
      const unknownExternalIds = unknownItems.map((r) => r.externalId);

      let cachedCount = 0;
      try {
        const dbRows = await db
          .select({
            externalId: releasesTable.externalId,
            platforms:  releasesTable.platforms,
          })
          .from(releasesTable)
          .innerJoin(publishersTable, eq(releasesTable.publisherId, publishersTable.id))
          .where(
            and(
              eq(publishersTable.slug, "square-enix"),
              inArray(releasesTable.externalId, unknownExternalIds)
            )
          );

        // Build a map of externalId → already-resolved platforms
        const resolvedInDb = new Map<string, string[]>();
        for (const row of dbRows) {
          const plats = row.platforms as string[];
          // Only use the DB value if it was previously resolved to something real
          if (plats.length > 0 && !(plats.length === 1 && plats[0] === "Unknown")) {
            resolvedInDb.set(row.externalId as string, plats);
          }
        }

        // Apply cached platforms — no detail fetch needed for these items
        for (const item of unknownItems) {
          const cached = resolvedInDb.get(item.externalId);
          if (cached) {
            item.platforms = cached;
            cachedCount++;
          }
        }

        if (cachedCount > 0) {
          logger.info(
            { cachedCount, total: unknownItems.length },
            "Square Enix: applied DB-cached platforms, skipping detail fetches for resolved items"
          );
        }
      } catch (err) {
        // Non-fatal: if the DB query fails, fall through to detail-page fetches
        logger.warn({ err: String(err) }, "Square Enix: DB cache check failed, will fetch all detail pages");
      }

      // ── Step 2: fetch detail pages only for items still Unknown ───────────
      const stillUnknown = unknownItems.filter(
        (r) => r.platforms.length === 1 && r.platforms[0] === "Unknown"
      );
      const toEnrich = stillUnknown.slice(0, MAX_DETAIL_FETCHES);

      if (toEnrich.length > 0) {
        logger.info(
          {
            total: unknownItems.length,
            cachedCount,
            fetching: toEnrich.length,
            capped: stillUnknown.length > MAX_DETAIL_FETCHES,
          },
          "Square Enix: enriching remaining Unknown-platform releases via detail pages"
        );

        for (let i = 0; i < toEnrich.length; i++) {
          const release = toEnrich[i];

          // Polite delay between detail fetches (skip before the first one)
          if (i > 0) await new Promise((r) => setTimeout(r, DETAIL_FETCH_DELAY_MS));

          const detailHtml = await fetchDetailPage(release.productUrl);
          if (!detailHtml) {
            logger.warn(
              { productUrl: release.productUrl },
              "Square Enix: detail page unavailable, keeping Unknown"
            );
            continue;
          }

          const found = extractPlatformFromDetailHtml(detailHtml);
          if (found.length > 0) {
            logger.info(
              { productUrl: release.productUrl, title: release.title, platforms: found },
              "Square Enix: resolved Unknown platform from detail page"
            );
            release.platforms = found;
          } else {
            logger.debug(
              { productUrl: release.productUrl, title: release.title },
              "Square Enix: detail page also has no platform, keeping Unknown"
            );
          }
        }
      }

      const fetchResolved = toEnrich.filter((r) => r.platforms[0] !== "Unknown").length;
      logger.info(
        {
          count: results.length,
          unknownTotal: unknownItems.length,
          fromCache: cachedCount,
          fromDetailPage: fetchResolved,
          stillUnknown: unknownItems.filter((r) => r.platforms[0] === "Unknown").length,
        },
        "Square Enix scrape complete"
      );
    } else {
      logger.info({ count: results.length }, "Square Enix scrape complete (no Unknown-platform items)");
    }

    return results;
  },
};
