import { logger } from "../../logger";
import type { PublisherScraper, ScrapedRelease } from "../types";

const SLG_BASE = "https://www.strictlylimitedgames.com";

interface SLGProduct {
  id: number;
  handle: string;
  title: string;
  body_html: string;
  product_type: string;
  tags: string[];
  variants: SLGVariant[];
  images: Array<{ src: string }>;
  published_at: string;
}

interface SLGVariant {
  title: string;
  price: string;
  available: boolean;
}

interface SLGCollectionResponse {
  products: SLGProduct[];
}

async function fetchCollection(handle: string): Promise<SLGProduct[]> {
  const all: SLGProduct[] = [];
  let page = 1;
  const limit = 50;

  while (true) {
    const url = `${SLG_BASE}/collections/${handle}/products.json?limit=${limit}&page=${page}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": "PressRunTracker/1.0 (+https://pressrun.app)",
          Accept: "application/json",
        },
      });
    } catch (err) {
      logger.warn({ handle, page, err: String(err) }, "SLG fetch error");
      break;
    }

    if (!res.ok) {
      logger.warn({ handle, page, status: res.status }, "SLG collection fetch failed");
      break;
    }

    const text = await res.text();
    // SLG sometimes returns an HTML error page instead of JSON
    if (!text.trim().startsWith("{")) {
      logger.warn({ handle, page }, "SLG returned non-JSON, stopping pagination");
      break;
    }

    const data = JSON.parse(text) as SLGCollectionResponse;
    if (!data.products || data.products.length === 0) break;

    all.push(...data.products);
    if (data.products.length < limit) break;
    page++;
    await new Promise((r) => setTimeout(r, 600));
  }

  return all;
}

/**
 * Extract platform from SLG title patterns:
 * "Shadow Gambit: ... - Limited Edition (PlayStation 5) [PEGI]"
 * "Title - Standard Edition (Nintendo Switch)"
 */
function extractPlatforms(title: string, tags: string[]): string[] {
  const text = `${title} ${tags.join(" ")}`;
  const platforms: string[] = [];

  const matchers: [RegExp, string][] = [
    [/playstation\s*5|ps5/i, "PS5"],
    [/playstation\s*4|ps4/i, "PS4"],
    [/nintendo switch\s*2|switch\s*2/i, "Switch 2"],
    [/nintendo switch(?!\s*2)|switch(?!\s*2)/i, "Switch"],
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

function extractPrice(variants: SLGVariant[]): string | null {
  const prices = variants.map((v) => parseFloat(v.price)).filter((p) => !isNaN(p) && p > 0);
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  // SLG prices are in EUR; we don't display non-USD prices site-wide.
  return null;
}

function toRelease(product: SLGProduct, status: ScrapedRelease["status"]): ScrapedRelease {
  return {
    externalId: product.handle,
    title: product.title,
    platforms: extractPlatforms(product.title, product.tags),
    status,
    coverImageUrl: product.images?.[0]?.src ?? null,
    productUrl: `${SLG_BASE}/products/${product.handle}`,
    price: extractPrice(product.variants),
    editionType: null,
    preorderCloseDate: null,
    releaseDate: null,
  };
}

export const strictlyLimitedScraper: PublisherScraper = {
  slug: "strictly-limited-games",

  async scrape(): Promise<ScrapedRelease[]> {
    logger.info("Starting Strictly Limited Games scrape");

    const [preorderResult, comingSoonResult] = await Promise.allSettled([
      fetchCollection("pre-order"),
      fetchCollection("coming-soon"),
    ]);

    const results: ScrapedRelease[] = [];
    const seen = new Set<string>();

    function add(settled: PromiseSettledResult<SLGProduct[]>, status: ScrapedRelease["status"]) {
      if (settled.status === "rejected") {
        logger.warn({ status, reason: String(settled.reason) }, "SLG collection rejected");
        return;
      }
      for (const p of settled.value) {
        if (seen.has(p.handle)) continue;
        seen.add(p.handle);
        // If all variants sold out and in pre-order → mark sold_out
        const allSoldOut = p.variants.every((v) => !v.available);
        results.push(toRelease(p, status === "available" && allSoldOut ? "sold_out" : status));
      }
    }

    add(preorderResult, "available");
    add(comingSoonResult, "coming_soon");

    logger.info({ count: results.length }, "Strictly Limited Games scrape complete");
    return results;
  },
};
