import { logger } from "../../logger";
import type { PublisherScraper, ScrapedRelease } from "../types";

const SRG_BASE = "https://superraregames.com";

interface SRGProduct {
  id: number;
  handle: string;
  title: string;
  body_html: string;
  product_type: string;
  tags: string[];
  variants: SRGVariant[];
  images: Array<{ src: string }>;
  published_at: string;
}

interface SRGVariant {
  title: string;
  price: string;
  available: boolean;
  sku: string;
}

interface SRGCollectionResponse {
  products: SRGProduct[];
}

// SRG uses serial numbers in titles and tags: "SRG#159:", "SRGS2#01:"
const SRG_GAME_RE = /^(SRG#|SRGS2#|SRGPS#)/i;

/**
 * A product is a game release if:
 * - Title starts with a SRG serial ("SRG#159:", "SRGS2#01:")
 * - OR any tag contains a SRG serial reference
 */
function isGameRelease(product: SRGProduct): boolean {
  if (SRG_GAME_RE.test(product.title.trim())) return true;
  return product.tags.some((t) => SRG_GAME_RE.test(t));
}

async function fetchCollection(handle: string): Promise<SRGProduct[]> {
  const all: SRGProduct[] = [];
  let page = 1;
  const limit = 50;

  while (true) {
    const url = `${SRG_BASE}/collections/${handle}/products.json?limit=${limit}&page=${page}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": "PressRunTracker/1.0 (+https://pressrun.app)",
          Accept: "application/json",
        },
      });
    } catch (err) {
      logger.warn({ handle, page, err: String(err) }, "Super Rare Games fetch error");
      break;
    }

    if (!res.ok) {
      logger.warn({ handle, page, status: res.status }, "Super Rare Games collection failed");
      break;
    }

    const data = (await res.json()) as SRGCollectionResponse;
    if (!data.products || data.products.length === 0) break;

    all.push(...data.products);
    if (data.products.length < limit) break;
    page++;
    await new Promise((r) => setTimeout(r, 600));
  }

  return all;
}

/**
 * Parse platform from SRG title patterns:
 * "SRG#159: Sticky Business (Switch)"
 * "SRGS2#01: Minishoot' Adventures - Nintendo Switch 2 Edition"
 * "SRG#140: Death's Door (PS4 & PS5)"
 */
function extractPlatforms(title: string, tags: string[]): string[] {
  const text = `${title} ${tags.join(" ")}`;
  const platforms: string[] = [];

  const matchers: [RegExp, string][] = [
    [/playstation\s*5|ps5/i, "PS5"],
    [/playstation\s*4|ps4/i, "PS4"],
    [/switch\s*2|nintendo switch\s*2/i, "Switch 2"],
    [/\(switch\)|nintendo switch(?!\s*2)|(?<=\()switch(?!\s*2)(?=\))/i, "Switch"],
    [/xbox series/i, "Xbox Series"],
    [/xbox one/i, "Xbox One"],
    [/\bpc\b/i, "PC"],
  ];

  for (const [re, name] of matchers) {
    if (re.test(text) && !platforms.includes(name)) {
      platforms.push(name);
    }
  }

  // Fallback: if title ends with "(Switch)" pattern
  const titleMatch = title.match(/\(([^)]+)\)$/);
  if (titleMatch && platforms.length === 0) {
    const raw = titleMatch[1].trim();
    if (/switch/i.test(raw)) platforms.push("Switch");
    else if (/ps5/i.test(raw)) platforms.push("PS5");
    else if (/ps4/i.test(raw)) platforms.push("PS4");
  }

  return platforms.length > 0 ? platforms : ["Switch"]; // SRG is Switch-first historically
}

function extractPrice(variants: SRGVariant[]): string | null {
  const prices = variants.map((v) => parseFloat(v.price)).filter((p) => !isNaN(p) && p > 0);
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `£${min.toFixed(2)}` : `£${min.toFixed(2)}–£${max.toFixed(2)}`;
}

function determineStatus(product: SRGProduct): ScrapedRelease["status"] {
  if (product.variants.some((v) => v.available)) return "available";

  // Check body for coming-soon signals
  const body = product.body_html.toLowerCase();
  if (/coming soon|pre.?order|shipping [0-9]|confirmed at/i.test(body)) return "coming_soon";

  return "sold_out";
}

export const superRareScraper: PublisherScraper = {
  slug: "super-rare-games",

  async scrape(): Promise<ScrapedRelease[]> {
    logger.info("Starting Super Rare Games scrape");

    // Fetch both featured (active) and all (for sold-out backlog), deduplicate
    const [featuredResult, allResult] = await Promise.allSettled([
      fetchCollection("featured"),
      fetchCollection("all"),
    ]);

    const seen = new Set<string>();
    const results: ScrapedRelease[] = [];

    function add(settled: PromiseSettledResult<SRGProduct[]>) {
      if (settled.status === "rejected") {
        logger.warn({ reason: String(settled.reason) }, "SRG collection rejected");
        return;
      }
      for (const product of settled.value) {
        if (seen.has(product.handle)) continue;
        seen.add(product.handle);
        if (!isGameRelease(product)) continue;

        results.push({
          externalId: product.handle,
          title: product.title,
          platforms: extractPlatforms(product.title, product.tags),
          status: determineStatus(product),
          coverImageUrl: product.images?.[0]?.src ?? null,
          productUrl: `${SRG_BASE}/products/${product.handle}`,
          price: extractPrice(product.variants),
          editionType: null,
          preorderCloseDate: null,
          releaseDate: null,
        });
      }
    }

    // Featured first (higher quality data for active items), then all for historical
    add(featuredResult);
    add(allResult);

    logger.info({ count: results.length }, "Super Rare Games scrape complete");
    return results;
  },
};
