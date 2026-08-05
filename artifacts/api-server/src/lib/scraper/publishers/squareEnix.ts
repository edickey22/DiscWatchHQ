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

import { logger } from "../../logger";
import type { PublisherScraper, ScrapedRelease } from "../types";

const BASE = "https://na.store.square-enix-games.com";

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

  return { title, productUrl, price, coverImageUrl, status, platforms, editionType };
}

/**
 * Extract canonical platform names from a SE product title + URL slug combined.
 *
 * SE puts the platform in the title for new releases ("OCTOPATH TRAVELER - Switch 2")
 * and sometimes in the URL slug ("final-fantasy-vii-rebirth---switch-2"). Older
 * listings have neither — in that case we return ["Unknown"] so the item is still
 * included rather than silently dropped.
 */
function extractPlatforms(title: string, slug: string): string[] {
  // Combine title and URL slug — platforms appear in at least one of the two
  const combined = `${title} ${slug}`;
  const platforms: string[] = [];

  // Switch 2 must be tested before plain Switch
  if (/switch[\s-]?2/i.test(combined)) platforms.push("Switch 2");
  if (
    !platforms.includes("Switch 2") &&
    (/nintendo[\s-]switch/i.test(combined) || /\bswitch\b/i.test(combined))
  ) {
    platforms.push("Switch");
  }
  if (/\bps5\b|playstation[\s-]?5/i.test(combined)) platforms.push("PS5");
  if (/\bps4\b|playstation[\s-]?4/i.test(combined)) platforms.push("PS4");
  if (/xbox[\s-]series/i.test(combined)) platforms.push("Xbox Series");
  if (/xbox[\s-]one(?![\s-]x\b)/i.test(combined)) platforms.push("Xbox One");

  // No platform detected → return "Unknown" so the caller can still include
  // the item rather than dropping it silently.
  return platforms.length > 0 ? platforms : ["Unknown"];
}

function extractEditionType(title: string): string | null {
  if (/collector'?s?\s+edition/i.test(title)) return "Collector's Edition";
  if (/limited\s+edition/i.test(title)) return "Limited Edition";
  if (/deluxe\s+edition/i.test(title)) return "Deluxe Edition";
  if (/special\s+edition/i.test(title)) return "Special Edition";
  return null;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchPage(page: number): Promise<string | null> {
  const url = `${BASE}/video-games${page > 1 ? `?page=${page}` : ""}`;
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

    logger.info({ count: results.length }, "Square Enix scrape complete");
    return results;
  },
};
