/**
 * NIS America scraper — store.nisamerica.com
 *
 * NIS America runs Shopify. The `games-limited-edition` collection contains
 * all physical limited editions they sell — including both NIS America-published
 * titles and Koei Tecmo titles (Atelier series, Nioh, FAIRY TAIL, etc.).
 *
 * To avoid double-counting: this scraper fetches the `koei-tecmo` collection
 * handle set first, then excludes those handles when iterating the main
 * `games-limited-edition` collection. Koei Tecmo titles are scraped by the
 * dedicated koeiTecmo.ts scraper against the `koei-tecmo` collection.
 *
 * Platform data is in product tags as "Platform - <name>" entries (e.g.
 * "Platform - Nintendo Switch 2", "Platform - PS5"). Availability comes from
 * variant.available. Preorder status is signalled by 'pre-order'/'preorder'
 * tags.
 *
 * Prices are in USD and are included.
 *
 * Confidence: HIGH — Shopify /collections/{handle}/products.json feed.
 */
import { logger } from "../../logger";
import type { PublisherScraper, ScrapedRelease } from "../types";

const BASE = "https://store.nisamerica.com";
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

async function fetchCollectionHandles(collectionHandle: string): Promise<Set<string>> {
  const handles = new Set<string>();
  let page = 1;
  const limit = 250;

  while (true) {
    const url = `${BASE}/collections/${collectionHandle}/products.json?limit=${limit}&page=${page}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      logger.warn({ collectionHandle, page, err: String(err) }, "NIS America collection fetch error");
      break;
    }

    if (!res.ok) {
      logger.warn({ collectionHandle, page, status: res.status }, "NIS America collection fetch failed");
      break;
    }

    const data = (await res.json()) as NISCollectionResponse;
    const products = data.products ?? [];
    if (products.length === 0) break;
    for (const p of products) handles.add(p.handle);
    if (products.length < limit) break;
    page++;
    await new Promise(r => setTimeout(r, 400));
  }

  return handles;
}

async function fetchCollection(collectionHandle: string): Promise<NISProduct[]> {
  const all: NISProduct[] = [];
  let page = 1;
  const limit = 250;

  while (true) {
    const url = `${BASE}/collections/${collectionHandle}/products.json?limit=${limit}&page=${page}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      logger.warn({ collectionHandle, page, err: String(err) }, "NIS America fetch error");
      break;
    }

    if (!res.ok) {
      logger.warn({ collectionHandle, page, status: res.status }, "NIS America fetch failed");
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

    // Normalise to canonical platform names
    if (/nintendo switch 2/i.test(raw)) {
      if (!platforms.includes("Switch 2")) platforms.push("Switch 2");
    } else if (/nintendo switch/i.test(raw)) {
      if (!platforms.includes("Switch")) platforms.push("Switch");
    } else if (/ps5|playstation\s*5/i.test(raw)) {
      if (!platforms.includes("PS5")) platforms.push("PS5");
    } else if (/ps4|playstation\s*4/i.test(raw)) {
      if (!platforms.includes("PS4")) platforms.push("PS4");
    } else if (/xbox one.*series|series.*xbox one/i.test(raw)) {
      // "Xbox One • Xbox Series X|S" — expand to both
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

export const nisAmericaScraper: PublisherScraper = {
  slug: "nis-america",

  async scrape(): Promise<ScrapedRelease[]> {
    logger.info("Starting NIS America scrape");

    // Pre-fetch Koei Tecmo handles so we can exclude them from the NIS list
    // (KT titles are scraped by the dedicated koeiTecmo scraper)
    const ktHandles = await fetchCollectionHandles("koei-tecmo").catch(err => {
      logger.warn({ err: String(err) }, "NIS America: could not fetch KT exclusion list, proceeding without exclusions");
      return new Set<string>();
    });
    logger.info({ ktCount: ktHandles.size }, "NIS America: Koei Tecmo exclusion set loaded");

    const products = await fetchCollection("games-limited-edition");

    const results: ScrapedRelease[] = [];
    const seen = new Set<string>();

    for (const product of products) {
      if (seen.has(product.handle)) continue;
      seen.add(product.handle);

      // Skip Koei Tecmo titles — covered by koeiTecmo scraper
      if (ktHandles.has(product.handle)) continue;

      // Skip non-game product types (anime, apparel, collectibles)
      const typeLower = product.product_type.toLowerCase();
      if (!typeLower.includes("game")) continue;

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

    logger.info({ count: results.length }, "NIS America scrape complete");
    return results;
  },
};
