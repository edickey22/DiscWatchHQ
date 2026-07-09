/**
 * Xbox Game Studios Shop scraper — shop.xboxgamestudios.com
 *
 * Scrapes the Collector's Editions collection using Shopify's public
 * products.json endpoint (same pattern as all other scrapers in the registry).
 *
 * Confidence: HIGH — Shopify JSON feed, no HTML parsing.
 *
 * Collections scraped:
 *   xbox-games-showcase-collectors-editions  — primary: all Collector's Editions
 *   collectibles                             — secondary: catches any that slip
 *                                             through under different handles
 *
 * Filter: product_type === "Collector's Edition"
 *   This is the canonical discriminator used by the store itself — it
 *   excludes all apparel, accessories, home goods, and other merchandise.
 *
 * Status detection (via tags):
 *   "status : pre-order"  → coming_soon
 *   "status : sold-out"   → sold_out
 *   any variant available → available
 *   else                  → sold_out
 *
 * Release date: "estimated : YYYY-MM" tag → first day of that month.
 */

import { logger } from "../../logger";
import type { PublisherScraper, ScrapedRelease } from "../types";

const BASE = "https://shop.xboxgamestudios.com";
const UA   = "DiscWatchHQ/1.0 (+https://discwatchhq.com)";

interface XboxProduct {
  id: number;
  handle: string;
  title: string;
  product_type: string;
  tags: string[];
  variants: Array<{ price: string; available: boolean }>;
  images: Array<{ src: string }>;
}

interface XboxCollectionResponse {
  products: XboxProduct[];
}

async function fetchCollection(handle: string): Promise<XboxProduct[]> {
  const all: XboxProduct[] = [];
  let page = 1;

  while (true) {
    const url = `${BASE}/collections/${handle}/products.json?limit=50&page=${page}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      logger.warn({ handle, page, err: String(err) }, "Xbox Shop fetch error");
      break;
    }
    if (!res.ok) {
      logger.warn({ handle, page, status: res.status }, "Xbox Shop collection fetch failed");
      break;
    }
    const data = (await res.json()) as XboxCollectionResponse;
    if (!data.products?.length) break;
    all.push(...data.products);
    if (data.products.length < 50) break;
    page++;
    await new Promise(r => setTimeout(r, 500));
  }

  return all;
}

function extractPrice(variants: XboxProduct["variants"]): string | null {
  const prices = variants.map(v => parseFloat(v.price)).filter(n => !isNaN(n) && n > 0);
  if (!prices.length) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `$${min.toFixed(2)}` : `$${min.toFixed(2)}–$${max.toFixed(2)}`;
}

/**
 * Detect platforms from the title. Xbox Game Studios releases are usually
 * Xbox Series X|S and/or PC — extract from the title text.
 */
function extractPlatforms(title: string): string[] {
  const platforms: string[] = [];
  if (/xbox series/i.test(title)) platforms.push("Xbox Series");
  if (/xbox one/i.test(title)) platforms.push("Xbox One");
  if (/\bpc\b/i.test(title)) platforms.push("PC");
  // Collector's Editions at Xbox Game Studios Shop are always Xbox-first
  if (platforms.length === 0) platforms.push("Xbox Series");
  return platforms;
}

function extractStatus(product: XboxProduct): ScrapedRelease["status"] {
  const tagSet = new Set(product.tags.map(t => t.toLowerCase().trim()));
  if (tagSet.has("status : pre-order")) return "coming_soon";
  if (tagSet.has("status : sold-out"))  return "sold_out";
  if (product.variants.some(v => v.available)) return "available";
  return "sold_out";
}

/**
 * Parse release date from an "estimated : YYYY-MM" tag.
 * Returns the first day of that month as an ISO date string.
 */
function extractReleaseDate(tags: string[]): string | null {
  for (const tag of tags) {
    const m = tag.match(/^estimated\s*:\s*(\d{4})-(\d{2})$/i);
    if (m) return `${m[1]}-${m[2]}-01`;
  }
  return null;
}

export const xboxGameStudiosScraper: PublisherScraper = {
  slug: "xbox-game-studios",

  async scrape(): Promise<ScrapedRelease[]> {
    logger.info("Starting Xbox Game Studios Shop scrape");

    const [primary, secondary] = await Promise.allSettled([
      fetchCollection("xbox-games-showcase-collectors-editions"),
      fetchCollection("collectibles"),
    ]);

    const seen = new Set<string>();
    const results: ScrapedRelease[] = [];

    function addProducts(settled: PromiseSettledResult<XboxProduct[]>) {
      if (settled.status === "rejected") {
        logger.warn({ reason: String(settled.reason) }, "Xbox Shop collection fetch rejected");
        return;
      }
      for (const product of settled.value) {
        // Only include Collector's Editions — this is the canonical type used
        // by the store to mark physical game CE releases
        if (product.product_type !== "Collector's Edition") continue;
        if (seen.has(product.handle)) continue;
        seen.add(product.handle);

        results.push({
          externalId: product.handle,
          title: product.title,
          platforms: extractPlatforms(product.title),
          status: extractStatus(product),
          coverImageUrl: product.images?.[0]?.src ?? null,
          productUrl: `${BASE}/products/${product.handle}`,
          price: extractPrice(product.variants),
          editionType: "Collector's Edition",
          preorderCloseDate: null,
          releaseDate: extractReleaseDate(product.tags),
        });
      }
    }

    addProducts(primary);
    addProducts(secondary);

    logger.info({ count: results.length }, "Xbox Game Studios Shop scrape complete");
    return results;
  },
};
