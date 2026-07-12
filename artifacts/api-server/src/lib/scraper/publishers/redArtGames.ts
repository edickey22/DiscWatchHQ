/**
 * Red Art Games scraper — redartgames.com
 *
 * Red Art Games runs on PrestaShop, not Shopify, so there is no public
 * `/products.json` feed like the other scrapers in the registry use. Their
 * webservice API (`/api/...`) requires an authentication key we don't have,
 * so instead this scraper parses the rendered HTML of the "Games" category
 * listing pages directly (PrestaShop's default `product-miniature` markup).
 *
 * Confidence: MEDIUM — HTML structure scraping. More fragile than the
 * Shopify JSON scrapers: a front-end theme change on redartgames.com could
 * break the selectors below without any warning from the fetch itself.
 *
 * Pagination: the "Games" category (id 33) lists all physical releases
 * (current + historical/sold-out) across ~30 pages at 16 items/page.
 *
 * Status detection (from the listing markup, no per-product page fetches):
 *   <li class="product-flag out_of_stock">   → sold_out
 *   "Add to cart" button present             → available
 *   otherwise (e.g. "Sold out" placeholder,
 *   pre-order copy in the title)             → coming_soon / sold_out fallback
 *
 * Prices are in EUR; consistent with how other non-USD scrapers in this
 * registry behave (e.g. Super Rare Games/GBP), we don't display non-USD
 * prices site-wide, so price is always null here.
 */
import * as cheerio from "cheerio";
import { logger } from "../../logger";
import type { PublisherScraper, ScrapedRelease } from "../types";

const BASE = "https://www.redartgames.com";
const GAMES_CATEGORY_PATH = "/33-games";
const UA = "DiscWatchHQ/1.0 (+https://discwatchhq.com)";
const MAX_PAGES = 40; // safety cap — actual catalog is ~30 pages at time of writing

interface RAGListing {
  externalId: string;
  title: string;
  productUrl: string;
  coverImageUrl: string | null;
  isSoldOutFlag: boolean;
  hasAddToCart: boolean;
}

async function fetchCategoryPage(page: number): Promise<RAGListing[]> {
  const url = page === 1 ? `${BASE}${GAMES_CATEGORY_PATH}` : `${BASE}${GAMES_CATEGORY_PATH}?page=${page}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    logger.warn({ page, err: String(err) }, "Red Art Games fetch error");
    return [];
  }

  if (!res.ok) {
    logger.warn({ page, status: res.status }, "Red Art Games category fetch failed");
    return [];
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const listings: RAGListing[] = [];

  $("article.product-miniature").each((_, el) => {
    const $el = $(el);
    const externalId = $el.attr("data-id-product");
    if (!externalId) return;

    const linkEl = $el.find("h2.product-title a").first();
    const title = linkEl.attr("title")?.trim() || linkEl.text().trim();
    const productUrl = linkEl.attr("href") ?? null;
    if (!title || !productUrl) return;

    const coverImageUrl = $el.find("img").first().attr("src") ?? null;
    const isSoldOutFlag = $el.find(".product-flag.out_of_stock").length > 0;
    const hasAddToCart = $el.find('[data-button-action="add-to-cart"]').length > 0;

    listings.push({ externalId, title, productUrl, coverImageUrl, isSoldOutFlag, hasAddToCart });
  });

  return listings;
}

function extractPlatforms(title: string): string[] {
  const platforms: string[] = [];
  if (/switch\s*2/i.test(title)) platforms.push("Switch 2");
  else if (/switch/i.test(title)) platforms.push("Switch");
  if (/ps5|playstation\s*5/i.test(title)) platforms.push("PS5");
  if (/ps4|playstation\s*4/i.test(title)) platforms.push("PS4");
  if (/vita/i.test(title)) platforms.push("PS Vita");
  if (/xbox series/i.test(title)) platforms.push("Xbox Series");
  if (/xbox one/i.test(title)) platforms.push("Xbox One");
  if (/\bpc\b/i.test(title)) platforms.push("PC");
  return platforms.length > 0 ? platforms : ["Unknown"];
}

function extractEditionType(title: string): string | null {
  if (/deluxe edition/i.test(title)) return "Deluxe Edition";
  if (/collector'?s? edition/i.test(title)) return "Collector's Edition";
  return null;
}

function determineStatus(listing: RAGListing): ScrapedRelease["status"] {
  if (listing.isSoldOutFlag) return "sold_out";
  if (listing.hasAddToCart) return "available";
  if (/pre-?order/i.test(listing.title)) return "coming_soon";
  return "sold_out";
}

export const redArtGamesScraper: PublisherScraper = {
  slug: "red-art-games",

  async scrape(): Promise<ScrapedRelease[]> {
    logger.info("Starting Red Art Games scrape");

    const seen = new Set<string>();
    const results: ScrapedRelease[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const listings = await fetchCategoryPage(page);
      if (listings.length === 0) break;

      for (const listing of listings) {
        if (seen.has(listing.externalId)) continue;
        seen.add(listing.externalId);

        results.push({
          externalId: listing.externalId,
          title: listing.title,
          platforms: extractPlatforms(listing.title),
          status: determineStatus(listing),
          coverImageUrl: listing.coverImageUrl,
          productUrl: listing.productUrl,
          price: null, // EUR — not displayed site-wide (USD only)
          editionType: extractEditionType(listing.title),
          preorderCloseDate: null,
          releaseDate: null,
        });
      }

      await new Promise((r) => setTimeout(r, 700));
    }

    logger.info({ count: results.length }, "Red Art Games scrape complete");
    return results;
  },
};
