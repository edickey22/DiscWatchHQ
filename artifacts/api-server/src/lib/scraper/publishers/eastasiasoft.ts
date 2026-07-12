/**
 * eastasiasoft scraper — shop.eastasiasoft.com
 *
 * Scrapes the "games" collection using Shopify's public products.json
 * endpoint (same pattern as all other Shopify-backed scrapers in the
 * registry). The storefront already separates physical games from
 * merchandise into distinct collections ("games" vs "merchandise"), so no
 * additional merch keyword filtering is needed — scoping to the "games"
 * collection handle is the discriminator.
 *
 * Confidence: HIGH — Shopify JSON feed, no HTML parsing.
 */
import { logger } from "../../logger";
import type { PublisherScraper, ScrapedRelease } from "../types";

const BASE = "https://shop.eastasiasoft.com";
const UA = "DiscWatchHQ/1.0 (+https://discwatchhq.com)";

interface EASVariant {
  title: string;
  price: string;
  available: boolean;
  sku: string;
}

interface EASProduct {
  id: number;
  handle: string;
  title: string;
  body_html: string;
  tags: string[];
  variants: EASVariant[];
  images: Array<{ src: string }>;
}

interface EASCollectionResponse {
  products: EASProduct[];
}

async function fetchCollection(handle: string): Promise<EASProduct[]> {
  const all: EASProduct[] = [];
  let page = 1;
  const limit = 50;

  while (true) {
    const url = `${BASE}/collections/${handle}/products.json?limit=${limit}&page=${page}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      logger.warn({ handle, page, err: String(err) }, "eastasiasoft fetch error");
      break;
    }

    if (!res.ok) {
      logger.warn({ handle, page, status: res.status }, "eastasiasoft collection fetch failed");
      break;
    }

    const data = (await res.json()) as EASCollectionResponse;
    if (!data.products || data.products.length === 0) break;

    all.push(...data.products);
    if (data.products.length < limit) break;
    page++;
    await new Promise((r) => setTimeout(r, 600));
  }

  return all;
}

/** Titles carry the platform in a trailing parenthetical, e.g. "(PC)", "(PS5 deluxe)". */
function extractPlatforms(title: string): string[] {
  const platforms: string[] = [];
  if (/switch\s*2/i.test(title)) platforms.push("Switch 2");
  else if (/switch/i.test(title)) platforms.push("Switch");
  if (/ps5|playstation\s*5/i.test(title)) platforms.push("PS5");
  if (/ps4|playstation\s*4/i.test(title)) platforms.push("PS4");
  if (/\bpc\b/i.test(title)) platforms.push("PC");
  return platforms.length > 0 ? platforms : ["Unknown"];
}

/** Titles carry the edition in a trailing parenthetical, e.g. "(PS5 deluxe)". */
function extractEditionType(title: string): string | null {
  if (/deluxe/i.test(title)) return "Deluxe Edition";
  if (/collector/i.test(title)) return "Collector's Edition";
  if (/uncut/i.test(title)) return "Uncut Edition";
  return null;
}

function extractPrice(variants: EASVariant[]): string | null {
  const prices = variants.map((v) => parseFloat(v.price)).filter((p) => !isNaN(p) && p > 0);
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `$${min.toFixed(2)}` : `$${min.toFixed(2)}–$${max.toFixed(2)}`;
}

function determineStatus(product: EASProduct): ScrapedRelease["status"] {
  if (product.variants.some((v) => v.available)) return "available";

  const body = product.body_html.toLowerCase();
  if (/coming soon|pre.?order|ships [0-9]|available [0-9]/i.test(body)) return "coming_soon";

  return "sold_out";
}

export const eastasiasoftScraper: PublisherScraper = {
  slug: "eastasiasoft",

  async scrape(): Promise<ScrapedRelease[]> {
    logger.info("Starting eastasiasoft scrape");

    const products = await fetchCollection("games").catch((err) => {
      logger.error({ err: String(err) }, "eastasiasoft fetch failed");
      return [] as EASProduct[];
    });

    const results: ScrapedRelease[] = [];

    for (const product of products) {
      results.push({
        externalId: product.handle,
        title: product.title,
        platforms: extractPlatforms(product.title),
        status: determineStatus(product),
        coverImageUrl: product.images?.[0]?.src ?? null,
        productUrl: `${BASE}/products/${product.handle}`,
        price: extractPrice(product.variants),
        editionType: extractEditionType(product.title),
        preorderCloseDate: null,
        releaseDate: null,
      });
    }

    logger.info({ count: results.length }, "eastasiasoft scrape complete");
    return results;
  },
};
