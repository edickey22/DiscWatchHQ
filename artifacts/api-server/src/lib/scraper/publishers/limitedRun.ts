import { logger } from "../../logger";
import type { PublisherScraper, ScrapedRelease } from "../types";

const LRG_BASE = "https://limitedrungames.com";

/**
 * Scrapes the Limited Run Games collection pages.
 * Uses their public JSON/HTML endpoints to avoid fragile HTML parsing.
 *
 * LRG exposes product data at:
 *   /collections/<handle>.json?page=N&limit=50
 * Collections: pre-orders, coming-soon, classics (sold out)
 */

interface LRGProduct {
  id: number;
  handle: string;
  title: string;
  body_html: string;
  product_type: string;
  tags: string[];
  variants: LRGVariant[];
  images: Array<{ src: string }>;
  published_at: string;
}

interface LRGVariant {
  id: number;
  title: string;
  price: string;
  available: boolean;
  sku: string;
}

interface LRGCollectionResponse {
  products: LRGProduct[];
}

async function fetchCollection(handle: string): Promise<LRGProduct[]> {
  const allProducts: LRGProduct[] = [];
  let page = 1;
  const limit = 50;

  while (true) {
    const url = `${LRG_BASE}/collections/${handle}/products.json?limit=${limit}&page=${page}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "PressRunTracker/1.0 (+https://pressrun.app)",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      logger.warn({ handle, page, status: res.status }, "LRG collection fetch failed");
      break;
    }

    const data = (await res.json()) as LRGCollectionResponse;
    if (!data.products || data.products.length === 0) break;

    allProducts.push(...data.products);

    if (data.products.length < limit) break;
    page++;

    // Small delay to be respectful
    await new Promise((r) => setTimeout(r, 500));
  }

  return allProducts;
}

function extractPlatforms(product: LRGProduct): string[] {
  const platforms: string[] = [];
  const knownPlatforms = [
    "PS5", "PS4", "PlayStation 5", "PlayStation 4",
    "Nintendo Switch", "Switch",
    "Xbox Series", "Xbox One", "Xbox",
    "PC", "Sega Genesis", "Neo Geo",
    "Game Boy", "GBA", "DS", "3DS",
    "Atari", "NES", "SNES", "N64", "GameCube", "Wii",
  ];

  const searchText = `${product.title} ${product.tags.join(" ")} ${product.product_type}`;

  for (const platform of knownPlatforms) {
    if (searchText.toLowerCase().includes(platform.toLowerCase())) {
      // Normalize
      let normalized = platform;
      if (platform === "PlayStation 5") normalized = "PS5";
      if (platform === "PlayStation 4") normalized = "PS4";
      if (platform === "Nintendo Switch") normalized = "Switch";
      if (!platforms.includes(normalized)) {
        platforms.push(normalized);
      }
    }
  }

  // Also check tags directly
  for (const tag of product.tags) {
    const tagUpper = tag.toUpperCase();
    if (["PS5", "PS4", "SWITCH", "PC", "XBOX"].includes(tagUpper)) {
      const mapped = tagUpper === "SWITCH" ? "Switch" : tagUpper;
      if (!platforms.includes(mapped)) platforms.push(mapped);
    }
  }

  return platforms.length > 0 ? platforms : ["Unknown"];
}

function extractPrice(product: LRGProduct): string | null {
  if (!product.variants || product.variants.length === 0) return null;
  const prices = product.variants.map((v) => parseFloat(v.price)).filter((p) => !isNaN(p));
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return `$${min.toFixed(2)}`;
  return `$${min.toFixed(2)}–$${max.toFixed(2)}`;
}

function isAllSoldOut(product: LRGProduct): boolean {
  return product.variants.every((v) => !v.available);
}

/**
 * Extract an Amazon product URL from LRG's body_html.
 * LRG occasionally embeds Amazon buy links in their product descriptions.
 */
function extractAmazonUrl(bodyHtml: string): string | null {
  // Match full amazon.com product URLs (dp/ASIN or gp/product/ASIN patterns)
  const match = bodyHtml.match(/https?:\/\/(?:www\.)?amazon\.com\/(?:[^"'\s<>]*\/)?(?:dp|gp\/product)\/([A-Z0-9]{10})[^"'\s<>]*/i);
  if (match) {
    // Return a clean canonical URL — affiliate tag applied later by the API layer
    return `https://www.amazon.com/dp/${match[1]}`;
  }
  // Also catch amzn.to short links
  const shortMatch = bodyHtml.match(/https?:\/\/amzn\.to\/[A-Za-z0-9]+/);
  return shortMatch ? shortMatch[0] : null;
}

function productToRelease(product: LRGProduct, status: ScrapedRelease["status"]): ScrapedRelease {
  return {
    externalId: product.handle,
    title: product.title,
    platforms: extractPlatforms(product),
    status,
    coverImageUrl: product.images?.[0]?.src ?? null,
    productUrl: `${LRG_BASE}/products/${product.handle}`,
    price: extractPrice(product),
    editionType: null,
    preorderCloseDate: null,
    releaseDate: null,
    amazonUrl: extractAmazonUrl(product.body_html),
  };
}

export const limitedRunScraper: PublisherScraper = {
  slug: "limited-run-games",

  async scrape(): Promise<ScrapedRelease[]> {
    logger.info("Starting Limited Run Games scrape");

    const [preorders, comingSoon, classics] = await Promise.allSettled([
      fetchCollection("pre-orders"),
      fetchCollection("coming-soon"),
      fetchCollection("classics"),
    ]);

    const results: ScrapedRelease[] = [];
    const seenIds = new Set<string>();

    function addProducts(settled: PromiseSettledResult<LRGProduct[]>, status: ScrapedRelease["status"]) {
      if (settled.status === "rejected") {
        logger.warn({ status, reason: String(settled.reason) }, "LRG collection fetch rejected");
        return;
      }
      for (const product of settled.value) {
        if (seenIds.has(product.handle)) continue;
        seenIds.add(product.handle);

        // Override status: if all variants sold out and in preorders collection → sold out
        let finalStatus = status;
        if (status === "available" && isAllSoldOut(product)) {
          finalStatus = "sold_out";
        }
        results.push(productToRelease(product, finalStatus));
      }
    }

    addProducts(preorders, "available");
    addProducts(comingSoon, "coming_soon");
    addProducts(classics, "sold_out");

    logger.info({ count: results.length }, "Limited Run Games scrape complete");
    return results;
  },
};
