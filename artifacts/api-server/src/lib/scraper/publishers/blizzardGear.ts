/**
 * Blizzard Gear Store scraper — gear.blizzard.com
 *
 * Scrapes the Limited Edition & Collector's Edition collection using Shopify's
 * public products.json endpoint (same pattern as all other scrapers).
 *
 * Confidence: HIGH — Shopify JSON feed, no HTML parsing.
 *
 * ⚠ Note on item types:
 *   The Blizzard Gear Store "Limited Edition" collection contains a mix of:
 *     • Physical game Collector's Edition bundles (WoW, Diablo, Overwatch CEs)
 *     • Collector's accessories — enamel pins, figures, statues, art books —
 *       which are NOT physical game discs
 *
 *   All items in the `limited-edition` collection are included because:
 *     a) Blizzard CE game boxes are sold here when available
 *     b) The collector's items are still limited-run physical products of
 *        interest to the same audience
 *   The `editionType` field is set per-item type to help the UI distinguish.
 *
 * Collection scraped: `limited-edition` (Blizzard Limited Edition & Collector's Edition)
 *
 * Status detection: variant availability.
 *   All variants unavailable → sold_out.
 *   At least one available  → available.
 *   (Blizzard does not use pre-order tags on this collection.)
 *
 * Platforms: Blizzard titles are primarily PC. Platform signals are inferred
 * from the title; items with no platform signal use ["PC"] as default since
 * all Blizzard games ship on PC.
 */

import { logger } from "../../logger";
import type { PublisherScraper, ScrapedRelease } from "../types";

const BASE = "https://gear.blizzard.com";
const UA   = "DiscWatchHQ/1.0 (+https://discwatchhq.com)";

interface BlizzardProduct {
  id: number;
  handle: string;
  title: string;
  product_type: string;
  tags: string[];
  variants: Array<{ price: string; available: boolean }>;
  images: Array<{ src: string }>;
}

interface BlizzardCollectionResponse {
  products: BlizzardProduct[];
}

async function fetchCollection(handle: string): Promise<BlizzardProduct[]> {
  const all: BlizzardProduct[] = [];
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
      logger.warn({ handle, page, err: String(err) }, "Blizzard Gear fetch error");
      break;
    }
    if (!res.ok) {
      logger.warn({ handle, page, status: res.status }, "Blizzard Gear collection fetch failed");
      break;
    }
    const data = (await res.json()) as BlizzardCollectionResponse;
    if (!data.products?.length) break;
    all.push(...data.products);
    if (data.products.length < 50) break;
    page++;
    await new Promise(r => setTimeout(r, 600));
  }

  return all;
}

function extractPrice(variants: BlizzardProduct["variants"]): string | null {
  const prices = variants.map(v => parseFloat(v.price)).filter(n => !isNaN(n) && n > 0);
  if (!prices.length) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `$${min.toFixed(2)}` : `$${min.toFixed(2)}–$${max.toFixed(2)}`;
}

function extractStatus(product: BlizzardProduct): ScrapedRelease["status"] {
  if (product.variants.some(v => v.available)) return "available";
  return "sold_out";
}

/**
 * Infer game platform from product title and tags.
 * Blizzard titles are PC-first; some titles also ship on console.
 */
function extractPlatforms(title: string, tags: string[]): string[] {
  const text = `${title} ${tags.join(" ")}`;
  const platforms: string[] = [];
  if (/\bps5\b|playstation\s*5/i.test(text)) platforms.push("PS5");
  if (/\bps4\b|playstation\s*4/i.test(text)) platforms.push("PS4");
  if (/xbox series/i.test(text)) platforms.push("Xbox Series");
  if (/xbox one/i.test(text)) platforms.push("Xbox One");
  if (/nintendo switch/i.test(text)) platforms.push("Switch");
  if (/\bpc\b/i.test(text) || platforms.length === 0) {
    if (!platforms.includes("PC")) platforms.push("PC");
  }
  return platforms;
}

/**
 * Infer editionType from product_type and tags.
 * Blizzard uses a mix of "Collector's Edition", statues, figures, pins, etc.
 */
function extractEditionType(product: BlizzardProduct): string | null {
  const type = product.product_type?.toLowerCase() ?? "";
  const tagStr = product.tags.join(" ").toLowerCase();

  if (/collector.?s edition/i.test(tagStr)) return "Collector's Edition";
  if (/statue|replica/i.test(type)) return "Statue/Replica";
  if (/figurine|figure|funko/i.test(type)) return "Figure";
  if (/\bpin\b/i.test(type)) return "Collector's Pin";
  if (/book|artbook/i.test(type)) return "Art Book";
  return "Limited Edition";
}

export const blizzardGearScraper: PublisherScraper = {
  slug: "blizzard-gear",

  async scrape(): Promise<ScrapedRelease[]> {
    logger.info("Starting Blizzard Gear Store scrape");

    const products = await fetchCollection("limited-edition").catch(err => {
      logger.error({ err: String(err) }, "Blizzard Gear fetch failed");
      return [] as BlizzardProduct[];
    });

    const results: ScrapedRelease[] = [];

    for (const product of products) {
      // Skip gift cards — these are not physical items
      if (/gift.?card/i.test(product.title) || product.product_type === "Gift Card") continue;

      results.push({
        externalId: product.handle,
        title: product.title,
        platforms: extractPlatforms(product.title, product.tags),
        status: extractStatus(product),
        coverImageUrl: product.images?.[0]?.src ?? null,
        productUrl: `${BASE}/products/${product.handle}`,
        price: extractPrice(product.variants),
        editionType: extractEditionType(product),
        preorderCloseDate: null,
        releaseDate: null,
      });
    }

    logger.info({ count: results.length }, "Blizzard Gear Store scrape complete");
    return results;
  },
};
