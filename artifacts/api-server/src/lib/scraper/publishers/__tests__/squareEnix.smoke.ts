/**
 * Smoke tests for the Square Enix scraper — platform resolution pipeline
 *
 * Covers:
 *   1. extractPlatformFromDetailHtml — each extraction strategy with fixture HTML
 *   2. scrape() end-to-end — "Unknown" item on listing page resolved via detail page
 *   3. upsertReleases SET-list audit — confirms `platforms` column is updated on conflict
 *
 * Run with:  pnpm --filter @workspace/api-server test:se
 */

import { extractPlatformFromDetailHtml, extractPlatformsFromText, parseCards, squareEnixScraper } from "../squareEnix";
import type { ScrapedRelease } from "../../types";

// ── Minimal assertion helper ──────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓  ${message}`);
    passed++;
  } else {
    console.error(`  ✗  FAIL: ${message}`);
    failed++;
  }
}

function deepEqual<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function suite(name: string, fn: () => void | Promise<void>): () => Promise<void> {
  return async () => {
    console.log(`\n── ${name} ──`);
    await fn();
  };
}

// ── Fixture HTML snippets ─────────────────────────────────────────────────────

/** BC Stencil spec-table row: <th>Platform</th><td>PlayStation 5</td> */
const SPEC_TABLE_HTML = `
<html><body>
<table class="productView-details">
  <tr>
    <th class="productView-details-name">Platform</th>
    <td class="productView-details-value">PlayStation 5</td>
  </tr>
</table>
</body></html>
`;

/** BC Stencil definition-list: <dt>Platform</dt><dd>Nintendo Switch</dd> */
const DL_HTML = `
<html><body>
<dl>
  <dt class="productView-details-name">Platform</dt>
  <dd class="productView-details-value">Nintendo Switch</dd>
</dl>
</body></html>
`;

/** JSON-LD additionalProperty with platform */
const JSONLD_PROP_HTML = `
<html><head>
<script type="application/ld+json">
{
  "@type": "Product",
  "name": "Final Fantasy XVI",
  "additionalProperty": [
    { "@type": "PropertyValue", "name": "Platform", "value": "PlayStation 5" }
  ]
}
</script>
</head><body></body></html>
`;

/** JSON-LD description free-text fallback */
const JSONLD_DESC_HTML = `
<html><head>
<script type="application/ld+json">
{
  "@type": "Product",
  "name": "Some Game",
  "description": "Experience this adventure on Xbox Series X."
}
</script>
</head><body></body></html>
`;

/** meta keywords */
const META_KEYWORDS_HTML = `
<html><head>
<meta name="keywords" content="RPG, adventure, PS4, single player, JRPG" />
</head><body></body></html>
`;

/** og:description */
const OG_DESC_HTML = `
<html><head>
<meta property="og:description" content="Available now for PlayStation 5 and Nintendo Switch." />
</head><body></body></html>
`;

/** plain meta description */
const META_DESC_HTML = `
<html><head>
<meta name="description" content="The definitive PC edition includes all DLC." />
</head><body></body></html>
`;

/** Page with no platform information */
const NO_PLATFORM_HTML = `
<html><head>
<meta name="description" content="A collector's art book with beautiful illustrations." />
</head><body></body></html>
`;

// ── Listing-page card fixture ─────────────────────────────────────────────────

// The scraper rejects responses < 5,000 bytes as a Cloudflare challenge page.
// All fixture pages must be padded past that threshold.
const PAGE_PADDING = "<!-- page content padding -->".repeat(200); // ~6 KB

/**
 * Build a minimal BC Stencil category page HTML containing one product card.
 * The card deliberately omits any platform keyword — it will get platforms=["Unknown"].
 */
function makeListingHtml(opts: {
  title: string;
  slug: string;
  ctaText?: string;
}): string {
  const href = `https://na.store.square-enix-games.com${opts.slug}`;
  const cta = opts.ctaText ?? "+ Add to Cart";
  return `<!DOCTYPE html>
<html><body>
${PAGE_PADDING}
<ul class="productGrid">
  <li class="product">
    <article class="card" data-product-id="9999">
      <figure class="card-figure">
        <img class="card-image lazyload" data-src="https://cdn11.bigcommerce.com/some-image.jpg" />
      </figure>
      <div class="card-body">
        <h3 class="prod-name">
          <a href="${href}">${opts.title}</a>
        </h3>
        <div class="card-figcaption-button">
          <button>${cta}</button>
        </div>
        <span data-product-price-without-tax class="price price--withoutTax">$59.99</span>
      </div>
    </article>
  </li>
</ul>
</body></html>`;
}

/** Minimal BC Stencil detail page with a spec table platform value */
function makeDetailHtml(platform: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>Product Detail</title></head>
<body>
${PAGE_PADDING}
<!-- BC Stencil product spec table -->
<section class="productView-details">
  <table>
    <tr>
      <th class="productView-details-name">Platform</th>
      <td class="productView-details-value">${platform}</td>
    </tr>
  </table>
</section>
</body>
</html>`;
}

/**
 * Empty listing page — signals end of pagination.
 * Must still be > 5,000 bytes or the scraper treats it as a CF challenge.
 */
function makeEmptyListingHtml(): string {
  return `<!DOCTYPE html>
<html><body>
${PAGE_PADDING}
<!-- no product cards on this page -->
</body></html>`;
}

// ── Test suites ───────────────────────────────────────────────────────────────

const testExtractFromSpecTable = suite("extractPlatformFromDetailHtml — BC spec table", () => {
  const ps5 = extractPlatformFromDetailHtml(SPEC_TABLE_HTML);
  assert(deepEqual(ps5, ["PS5"]), `spec table <th>/<td>: expected ["PS5"], got ${JSON.stringify(ps5)}`);

  const sw = extractPlatformFromDetailHtml(DL_HTML);
  assert(deepEqual(sw, ["Switch"]), `spec table <dt>/<dd>: expected ["Switch"], got ${JSON.stringify(sw)}`);
});

const testExtractFromJsonLd = suite("extractPlatformFromDetailHtml — JSON-LD", () => {
  const ps5 = extractPlatformFromDetailHtml(JSONLD_PROP_HTML);
  assert(deepEqual(ps5, ["PS5"]), `JSON-LD additionalProperty PS5: got ${JSON.stringify(ps5)}`);

  const xbox = extractPlatformFromDetailHtml(JSONLD_DESC_HTML);
  assert(deepEqual(xbox, ["Xbox Series"]), `JSON-LD description Xbox Series: got ${JSON.stringify(xbox)}`);
});

const testExtractFromMeta = suite("extractPlatformFromDetailHtml — meta tags", () => {
  const ps4 = extractPlatformFromDetailHtml(META_KEYWORDS_HTML);
  assert(deepEqual(ps4, ["PS4"]), `meta keywords PS4: got ${JSON.stringify(ps4)}`);

  const multi = extractPlatformFromDetailHtml(OG_DESC_HTML);
  assert(multi.includes("PS5"), `og:description includes PS5: got ${JSON.stringify(multi)}`);
  assert(multi.includes("Switch"), `og:description includes Switch: got ${JSON.stringify(multi)}`);

  const pc = extractPlatformFromDetailHtml(META_DESC_HTML);
  assert(deepEqual(pc, ["PC"]), `meta description PC: got ${JSON.stringify(pc)}`);
});

const testExtractNoResult = suite("extractPlatformFromDetailHtml — no platform", () => {
  const empty = extractPlatformFromDetailHtml(NO_PLATFORM_HTML);
  assert(deepEqual(empty, []), `no-platform page returns []: got ${JSON.stringify(empty)}`);
});

const testExtractPlatformsFromText = suite("extractPlatformsFromText — keyword matching", () => {
  assert(deepEqual(extractPlatformsFromText("Nintendo Switch 2"), ["Switch 2"]),
    "Switch 2 takes priority over Switch");
  assert(deepEqual(extractPlatformsFromText("Nintendo Switch"), ["Switch"]),
    "plain Switch matched");
  assert(deepEqual(extractPlatformsFromText("Available on PS5 and PS4"), ["PS5", "PS4"]),
    "both PS5 and PS4 detected");
  assert(deepEqual(extractPlatformsFromText("Xbox Series X exclusive"), ["Xbox Series"]),
    "Xbox Series detected");
  assert(deepEqual(extractPlatformsFromText("Windows PC version"), ["PC"]),
    "PC / Windows detected");
  assert(deepEqual(extractPlatformsFromText("art book collectible"), []),
    "non-platform text returns empty");
});

const testParseCards = suite("parseCards — listing page HTML", () => {
  const html = makeListingHtml({ title: "Final Fantasy XVI - PS5", slug: "/final-fantasy-xvi-ps5" });
  const cards = parseCards(html);
  assert(cards.length === 1, `expected 1 card, got ${cards.length}`);
  if (cards.length === 1) {
    assert(cards[0].title === "Final Fantasy XVI - PS5", `title: ${cards[0].title}`);
    assert(deepEqual(cards[0].platforms, ["PS5"]), `platforms from title: ${JSON.stringify(cards[0].platforms)}`);
    assert(cards[0].status === "available", `status: ${cards[0].status}`);
    assert(cards[0].price === "$59.99", `price: ${cards[0].price}`);
  }

  // Item with no platform keyword → should get ["Unknown"]
  const htmlUnknown = makeListingHtml({ title: "Mystery Collector Bundle", slug: "/mystery-collector-bundle" });
  const cardsUnknown = parseCards(htmlUnknown);
  assert(cardsUnknown.length === 1, `expected 1 unknown card, got ${cardsUnknown.length}`);
  if (cardsUnknown.length === 1) {
    assert(deepEqual(cardsUnknown[0].platforms, ["Unknown"]),
      `no-platform title gets ["Unknown"]: got ${JSON.stringify(cardsUnknown[0].platforms)}`);
  }
});

/**
 * Full scrape() pipeline test:
 *   1. Page 1 returns a listing with one "Unknown" platform item
 *   2. Page 2 returns empty → pagination stops
 *   3. Detail page returns HTML with "PlayStation 5" in spec table
 *   4. Verify that the resulting ScrapedRelease has platforms = ["PS5"]
 *
 * This validates the Unknown→resolved path without making real network requests.
 */
const testFullScrapePipeline = suite("scrape() — Unknown platform resolved via detail page", async () => {
  const PRODUCT_SLUG = "/products/mystery-rpg-collector-edition";
  const PRODUCT_URL = `https://na.store.square-enix-games.com${PRODUCT_SLUG}`;

  const listing1 = makeListingHtml({
    title: "Mystery RPG Collector Edition",
    slug: PRODUCT_SLUG,
  });
  const listing2 = makeEmptyListingHtml();
  // Detail page clearly identifies PS5 in the spec table
  const detailPage = makeDetailHtml("PlayStation 5");

  // Patch the global fetch so no real network calls are made
  const originalFetch = globalThis.fetch;
  let detailPageFetched = false;

  (globalThis as Record<string, unknown>).fetch = async (url: string | URL | Request): Promise<Response> => {
    const urlStr = String(typeof url === "object" && "url" in url ? (url as Request).url : url);

    if (urlStr.includes("/video-games") && !urlStr.includes("page=")) {
      // Category page 1
      return new Response(listing1, { status: 200 });
    }
    if (urlStr.includes("page=2")) {
      // Category page 2 — empty signals end of pagination
      return new Response(listing2, { status: 200 });
    }
    if (urlStr === PRODUCT_URL) {
      // Product detail page
      detailPageFetched = true;
      return new Response(detailPage, { status: 200 });
    }
    // Any unexpected URL → fail the request
    throw new Error(`Unexpected fetch: ${urlStr}`);
  };

  let releases: ScrapedRelease[] = [];
  try {
    releases = await squareEnixScraper.scrape();
  } finally {
    // Always restore the real fetch, even on failure
    (globalThis as Record<string, unknown>).fetch = originalFetch;
  }

  assert(releases.length === 1,
    `expected 1 release from scrape(), got ${releases.length}`);

  if (releases.length === 1) {
    const rel = releases[0];
    assert(rel.externalId === PRODUCT_SLUG,
      `externalId: expected "${PRODUCT_SLUG}", got "${rel.externalId}"`);
    assert(!deepEqual(rel.platforms, ["Unknown"]),
      `platforms should NOT be ["Unknown"] after detail enrichment`);
    assert(deepEqual(rel.platforms, ["PS5"]),
      `platforms should be ["PS5"], got ${JSON.stringify(rel.platforms)}`);
  }

  assert(detailPageFetched,
    "detail page was fetched (confirms Unknown-platform enrichment ran)");
});

/**
 * Audit: verify that the upsertReleases SET list in runner.ts includes `platforms`.
 *
 * This is a static code-inspection check — it reads the runner source file and
 * asserts the update block contains `platforms:`. A missing entry here would
 * silently leave DB rows with ["Unknown"] even after the scraper resolves them.
 */
const testUpsertSetListAudit = suite("upsertReleases SET list — platforms column present", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const url = await import("node:url");

  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const runnerPath = path.resolve(__dirname, "../../runner.ts");
  const source = await fs.readFile(runnerPath, "utf8");

  // The update block in upsertReleases uses .set({ ... }). We confirm that
  // `platforms:` is present inside it.
  const updateBlockMatch = source.match(/\.update\(releasesTable\)\s*\.set\(\{([\s\S]*?)\}\)/);
  assert(updateBlockMatch !== null, "found .update(releasesTable).set({...}) block in runner.ts");

  if (updateBlockMatch) {
    const setBlock = updateBlockMatch[1];
    assert(/\bplatforms\s*:/.test(setBlock),
      "platforms column is in the .set({}) block — upserts will overwrite stale ['Unknown'] values");
  }

  // Also confirm `platforms:` is present in the .insert().values({}) block
  const insertBlockMatch = source.match(/\.insert\(releasesTable\)\s*\.values\(\{([\s\S]*?)\}\)/);
  assert(insertBlockMatch !== null, "found .insert(releasesTable).values({...}) block in runner.ts");
  if (insertBlockMatch) {
    const valBlock = insertBlockMatch[1];
    assert(/\bplatforms\s*:/.test(valBlock),
      "platforms column is in the .values({}) insert block");
  }
});

// ── Runner ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("Square Enix scraper — platform resolution smoke tests\n");

  const suites = [
    testExtractFromSpecTable,
    testExtractFromJsonLd,
    testExtractFromMeta,
    testExtractNoResult,
    testExtractPlatformsFromText,
    testParseCards,
    testFullScrapePipeline,
    testUpsertSetListAudit,
  ];

  for (const s of suites) {
    try {
      await s();
    } catch (err) {
      failed++;
      console.error(`  ✗  Suite threw unexpected error: ${err}`);
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Smoke test runner crashed:", err);
  process.exit(1);
});
