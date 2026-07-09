import { logger } from "../../logger";
import type { PublisherScraper, ScrapedRelease } from "../types";

const I8B_BASE = "https://www.iam8bit.com";

// Collections to scrape (games-focused; skip art prints, apparel, etc.)
const GAME_COLLECTIONS = ["games"];

interface I8BProduct {
  id: number;
  handle: string;
  title: string;
  body_html: string;
  product_type: string;
  tags: string[];
  variants: I8BVariant[];
  images: Array<{ src: string }>;
  published_at: string;
}

interface I8BVariant {
  title: string;
  price: string;
  available: boolean;
  sku: string;
}

interface I8BCollectionResponse {
  products: I8BProduct[];
}

// Keywords in product types / titles that indicate non-game physical items to skip
const NON_GAME_PATTERNS = [
  /\bprint\b/i, /\bposter\b/i, /\bartwork\b/i, /\bapparel\b/i,
  /\bt-shirt\b/i, /\bpin badge\b/i, /\bpin\b/i, /\benamel\b/i,
  /\bfigure\b/i, /\bstatue\b/i, /\bplushie\b/i, /\bplush\b/i,
  /\bsoundtrack\b.*(?:vinyl|cd|cassette)/i, /\bvinyl\b/i,
];

function isGameProduct(product: I8BProduct): boolean {
  const combined = `${product.title} ${product.product_type} ${product.tags.join(" ")}`;
  // Must look like a physical game release: contains platform hint or "edition"
  const hasGameSignal = /\b(switch|ps4|ps5|xbox|playstation|nintendo|pc\b|edition)\b/i.test(combined);
  const hasExcludedType = NON_GAME_PATTERNS.some((re) => re.test(combined));
  return hasGameSignal && !hasExcludedType;
}

async function fetchCollection(handle: string): Promise<I8BProduct[]> {
  const all: I8BProduct[] = [];
  let page = 1;
  const limit = 50;

  while (true) {
    const url = `${I8B_BASE}/collections/${handle}/products.json?limit=${limit}&page=${page}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": "PressRunTracker/1.0 (+https://pressrun.app)",
          Accept: "application/json",
        },
      });
    } catch (err) {
      logger.warn({ handle, page, err: String(err) }, "iam8bit fetch error");
      break;
    }

    if (!res.ok) {
      logger.warn({ handle, page, status: res.status }, "iam8bit collection fetch failed");
      break;
    }

    const data = (await res.json()) as I8BCollectionResponse;
    if (!data.products || data.products.length === 0) break;

    all.push(...data.products);
    if (data.products.length < limit) break;
    page++;
    await new Promise((r) => setTimeout(r, 600));
  }

  return all;
}

function extractPlatforms(title: string, tags: string[]): string[] {
  const text = `${title} ${tags.join(" ")}`;
  const platforms: string[] = [];

  const matchers: [RegExp, string][] = [
    [/playstation\s*5|ps5/i, "PS5"],
    [/playstation\s*4|ps4/i, "PS4"],
    [/nintendo switch\s*2|switch\s*2/i, "Switch 2"],
    [/nintendo switch(?!\s*2)|(?<!\s)switch(?!\s*2)/i, "Switch"],
    [/xbox series/i, "Xbox Series"],
    [/xbox one/i, "Xbox One"],
    [/\bpc\b/i, "PC"],
  ];

  for (const [re, name] of matchers) {
    if (re.test(text) && !platforms.includes(name)) {
      platforms.push(name);
    }
  }

  return platforms.length > 0 ? platforms : ["Unknown"];
}

function extractPrice(variants: I8BVariant[]): string | null {
  const prices = variants.map((v) => parseFloat(v.price)).filter((p) => !isNaN(p) && p > 0);
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `$${min.toFixed(2)}` : `$${min.toFixed(2)}–$${max.toFixed(2)}`;
}

/**
 * Determine status from iam8bit product data.
 * - Any variant available → "available"
 * - Body HTML mentions future shipping ("Shipping Q", "Shipping 20") → "coming_soon"
 * - Otherwise → "sold_out"
 */
function determineStatus(product: I8BProduct): ScrapedRelease["status"] {
  if (product.variants.some((v) => v.available)) return "available";

  const bodyLower = product.body_html.toLowerCase();
  // Future shipping signals
  if (/shipping\s*(q[1-4]|20[2-9]\d)/i.test(bodyLower)) return "coming_soon";
  if (/coming soon/i.test(bodyLower)) return "coming_soon";
  if (/pre.?order/i.test(bodyLower)) return "available"; // treat open preorders as available

  return "sold_out";
}

export const iam8bitScraper: PublisherScraper = {
  slug: "iam8bit",

  async scrape(): Promise<ScrapedRelease[]> {
    logger.info("Starting iam8bit scrape");

    const results: ScrapedRelease[] = [];
    const seen = new Set<string>();

    for (const collection of GAME_COLLECTIONS) {
      const products = await fetchCollection(collection).catch((err) => {
        logger.warn({ collection, err: String(err) }, "iam8bit collection fetch failed");
        return [] as I8BProduct[];
      });

      for (const product of products) {
        if (seen.has(product.handle)) continue;
        seen.add(product.handle);

        if (!isGameProduct(product)) continue;

        results.push({
          externalId: product.handle,
          title: product.title,
          platforms: extractPlatforms(product.title, product.tags),
          status: determineStatus(product),
          coverImageUrl: product.images?.[0]?.src ?? null,
          productUrl: `${I8B_BASE}/products/${product.handle}`,
          price: extractPrice(product.variants),
          editionType: null,
          preorderCloseDate: null,
          releaseDate: null,
        });
      }
    }

    logger.info({ count: results.length }, "iam8bit scrape complete");
    return results;
  },
};
