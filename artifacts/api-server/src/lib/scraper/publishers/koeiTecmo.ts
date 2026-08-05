/**
 * Koei Tecmo scraper — store.nisamerica.com/collections/koei-tecmo
 *
 * Koei Tecmo America does not operate a standalone physical game storefront.
 * Their limited editions (Atelier series, Nioh, FAIRY TAIL, etc.) are sold
 * exclusively through NIS America's Shopify store under the `koei-tecmo`
 * collection at store.nisamerica.com.
 *
 * This scraper targets that collection directly.
 *
 * Platform data and pricing follow the same tag-parsing strategy as the
 * nisAmerica.ts scraper (tags of the form "Platform - Nintendo Switch 2").
 *
 * Confidence: HIGH — Shopify /collections/koei-tecmo/products.json feed.
 */
import { logger } from "../../logger";
import type { PublisherScraper, ScrapedRelease } from "../types";

const BASE = "https://store.nisamerica.com";
const KT_COLLECTION = "koei-tecmo";
const UA = "DiscWatchHQ/1.0 (+https://discwatchhq.com)";

interface NISProduct {
  id: number;
  handle: string;
  title: string;
  product_type: string;
  tags: string[];
  variants: Array<{ price: string; available: boolean }>;
  images: Array<{ src: string }>;
}

interface NISCollectionResponse {
  products: NISProduct[];
}

async function fetchKTCollection(): Promise<NISProduct[]> {
  const all: NISProduct[] = [];
  let page = 1;
  const limit = 250;

  while (true) {
    const url = `${BASE}/collections/${KT_COLLECTION}/products.json?limit=${limit}&page=${page}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      logger.warn({ page, err: String(err) }, "Koei Tecmo fetch error");
      break;
    }

    if (!res.ok) {
      logger.warn({ page, status: res.status }, "Koei Tecmo fetch failed");
      break;
    }

    const data = (await res.json()) as NISCollectionResponse;
    const products = data.products ?? [];
    if (products.length === 0) break;
    all.push(...products);
    if (products.length < limit) break;
    page++;
    await new Promise(r => setTimeout(r, 400));
  }

  return all;
}

function extractPlatforms(tags: string[]): string[] {
  const platforms: string[] = [];
  for (const tag of tags) {
    if (!tag.startsWith("Platform - ")) continue;
    const raw = tag.replace("Platform - ", "").trim();

    if (/nintendo switch 2/i.test(raw)) {
      if (!platforms.includes("Switch 2")) platforms.push("Switch 2");
    } else if (/nintendo switch/i.test(raw)) {
      if (!platforms.includes("Switch")) platforms.push("Switch");
    } else if (/ps5|playstation\s*5/i.test(raw)) {
      if (!platforms.includes("PS5")) platforms.push("PS5");
    } else if (/ps4|playstation\s*4/i.test(raw)) {
      if (!platforms.includes("PS4")) platforms.push("PS4");
    } else if (/xbox one.*series|series.*xbox one/i.test(raw)) {
      if (!platforms.includes("Xbox One")) platforms.push("Xbox One");
      if (!platforms.includes("Xbox Series")) platforms.push("Xbox Series");
    } else if (/xbox series/i.test(raw)) {
      if (!platforms.includes("Xbox Series")) platforms.push("Xbox Series");
    } else if (/xbox one/i.test(raw)) {
      if (!platforms.includes("Xbox One")) platforms.push("Xbox One");
    } else if (/\bpc\b/i.test(raw)) {
      if (!platforms.includes("PC")) platforms.push("PC");
    }
  }
  return platforms.length > 0 ? platforms : ["Unknown"];
}

function extractEditionType(productType: string): string | null {
  if (/limited edition/i.test(productType)) return "Limited Edition";
  if (/deluxe edition/i.test(productType)) return "Deluxe Edition";
  if (/collector'?s? edition/i.test(productType)) return "Collector's Edition";
  return null;
}

function extractPrice(variants: NISProduct["variants"]): string | null {
  const prices = variants
    .map(v => parseFloat(v.price))
    .filter(p => !isNaN(p) && p > 0);
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `$${min.toFixed(2)}` : `$${min.toFixed(2)}–$${max.toFixed(2)}`;
}

function determineStatus(product: NISProduct): ScrapedRelease["status"] {
  if (product.variants.some(v => v.available)) return "available";
  const tagSet = new Set(product.tags.map(t => t.toLowerCase()));
  if (tagSet.has("pre-order") || tagSet.has("preorder")) return "coming_soon";
  return "sold_out";
}

export const koeiTecmoScraper: PublisherScraper = {
  slug: "koei-tecmo",

  async scrape(): Promise<ScrapedRelease[]> {
    logger.info("Starting Koei Tecmo scrape");

    const products = await fetchKTCollection();

    const results: ScrapedRelease[] = [];
    const seen = new Set<string>();

    for (const product of products) {
      if (seen.has(product.handle)) continue;
      seen.add(product.handle);

      results.push({
        externalId: product.handle,
        title: product.title,
        platforms: extractPlatforms(product.tags),
        status: determineStatus(product),
        coverImageUrl: product.images?.[0]?.src ?? null,
        productUrl: `${BASE}/products/${product.handle}`,
        price: extractPrice(product.variants),
        editionType: extractEditionType(product.product_type),
        preorderCloseDate: null,
        releaseDate: null,
      });
    }

    logger.info({ count: results.length }, "Koei Tecmo scrape complete");
    return results;
  },
};
