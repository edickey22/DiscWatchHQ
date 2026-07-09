import { logger } from "../../logger";
import type { PublisherScraper, ScrapedRelease } from "../types";

const FG_BASE = "https://fangamer.com";

interface FGProduct {
  id: number;
  handle: string;
  title: string;
  body_html: string;
  product_type: string;
  tags: string[];
  variants: FGVariant[];
  images: Array<{ src: string }>;
  published_at: string;
}

interface FGVariant {
  title: string;
  price: string;
  available: boolean;
  sku: string;
}

interface FGCollectionResponse {
  products: FGProduct[];
}

// Keywords that identify non-game merchandise to exclude
const MERCH_PATTERNS = [
  /\bposter\b/i, /\bprint\b/i, /\bapparel\b/i, /\bt-shirt\b/i,
  /\bshirt\b/i, /\bpin\b/i, /\bplush(ie)?\b/i, /\bfigurine\b/i,
  /\bstatue\b/i, /\bnovelty\b/i, /\bjacket\b/i, /\bhoodie\b/i,
  /\bkeychain\b/i, /\bpillowcase\b/i, /\bmug\b/i,
];

function isPhysicalGame(product: FGProduct): boolean {
  // Must have a platform signal
  const hasGameSignal = /\b(switch|ps4|ps5|xbox|playstation|nintendo|edition|physical|game)\b/i.test(
    `${product.title} ${product.product_type} ${product.tags.join(" ")}`
  );
  const hasMerchSignal = MERCH_PATTERNS.some((re) =>
    re.test(`${product.title} ${product.product_type}`)
  );
  return hasGameSignal && !hasMerchSignal;
}

async function fetchCollection(handle: string): Promise<FGProduct[]> {
  const all: FGProduct[] = [];
  let page = 1;
  const limit = 50;

  while (true) {
    const url = `${FG_BASE}/collections/${handle}/products.json?limit=${limit}&page=${page}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": "PressRunTracker/1.0 (+https://pressrun.app)",
          Accept: "application/json",
        },
      });
    } catch (err) {
      logger.warn({ handle, page, err: String(err) }, "Fangamer fetch error");
      break;
    }

    if (!res.ok) {
      logger.warn({ handle, page, status: res.status }, "Fangamer collection fetch failed");
      break;
    }

    const data = (await res.json()) as FGCollectionResponse;
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
    [/nintendo switch(?!\s*2)|(?<!\w)switch(?!\s*2)/i, "Switch"],
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

function extractPrice(variants: FGVariant[]): string | null {
  const prices = variants.map((v) => parseFloat(v.price)).filter((p) => !isNaN(p) && p > 0);
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `$${min.toFixed(2)}` : `$${min.toFixed(2)}–$${max.toFixed(2)}`;
}

function determineStatus(product: FGProduct): ScrapedRelease["status"] {
  if (product.variants.some((v) => v.available)) return "available";

  const body = product.body_html.toLowerCase();
  if (/coming soon|pre.?order|available [0-9]|ships [0-9]/i.test(body)) return "coming_soon";

  return "sold_out";
}

export const fangamerScraper: PublisherScraper = {
  slug: "fangamer",

  async scrape(): Promise<ScrapedRelease[]> {
    logger.info("Starting Fangamer scrape");

    const products = await fetchCollection("physical-games").catch((err) => {
      logger.error({ err: String(err) }, "Fangamer fetch failed");
      return [] as FGProduct[];
    });

    const results: ScrapedRelease[] = [];

    for (const product of products) {
      if (!isPhysicalGame(product)) continue;

      results.push({
        externalId: product.handle,
        title: product.title,
        platforms: extractPlatforms(product.title, product.tags),
        status: determineStatus(product),
        coverImageUrl: product.images?.[0]?.src ?? null,
        productUrl: `${FG_BASE}/products/${product.handle}`,
        price: extractPrice(product.variants),
        editionType: null,
        preorderCloseDate: null,
        releaseDate: null,
      });
    }

    logger.info({ count: results.length }, "Fangamer scrape complete");
    return results;
  },
};
