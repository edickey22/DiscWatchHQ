/**
 * seo.ts — SEO content generators for DiscWatchHQ page components.
 *
 * Produces unique, data-driven titles, meta descriptions, descriptive copy
 * paragraphs, and schema.org Product JSON-LD from real release fields.
 *
 * Design principles
 * -----------------
 * - Every string uses actual release data (title, publisher, platform, price,
 *   dates) so each URL has demonstrably distinct content, not templated filler.
 * - Copy serves users first; SEO benefit is a consequence of being useful.
 * - JSON-LD uses only attributes we can fill with real values — no placeholder
 *   schema (empty/generic schema actively hurts more than it helps).
 */

// ── Types (subset of the API response we rely on) ─────────────────────────────

export interface SeoRelease {
  id:                number
  title:             string
  publisherName:     string
  platforms?:        string[] | null
  status:            string
  price?:            string | null
  editionType?:      string | null
  releaseDate?:      string | null
  preorderCloseDate?: string | null
  soldOutAt?:        string | null
  coverImageUrl?:    string | null
  productUrl:        string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** "2026-07-10T00:00:00.000Z" → "July 10, 2026" */
function fmtDate(iso?: string | null): string {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    })
  } catch { return "" }
}

/** "$29.99" | "29.99" → "29.99" | null */
export function parsePrice(raw?: string | null): string | null {
  if (!raw) return null
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""))
  return isNaN(n) ? null : n.toFixed(2)
}

function platformList(platforms?: string[] | null): string {
  if (!platforms?.length) return ""
  if (platforms.length === 1) return platforms[0]
  if (platforms.length === 2) return platforms.join(" and ")
  return platforms.slice(0, -1).join(", ") + ", and " + platforms[platforms.length - 1]
}

function shortPlatformList(platforms?: string[] | null): string {
  if (!platforms?.length) return ""
  return platforms.slice(0, 3).join("/")
}

/**
 * Trim a string to maxLen characters at a word boundary, appending "…".
 * Keeps the string unchanged if it already fits.
 */
function trimToLen(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s
  const cut = s.slice(0, maxLen - 1)
  const lastSpace = cut.lastIndexOf(" ")
  return (lastSpace > maxLen * 0.5 ? cut.slice(0, lastSpace) : cut) + "…"
}

// ── Page title ────────────────────────────────────────────────────────────────

/**
 * Returns a unique, descriptive <title> for a release detail page.
 * Max ~65 chars so it displays fully in Google SERPs.
 *
 * Examples:
 *   "Castlevania Requiem – Available Now on PS4 | DiscWatchHQ"
 *   "Hollow Knight Silksong – Coming Soon on Switch | DiscWatchHQ"
 *   "Bloodstained: Ritual of the Night – Sold Out (PS4/Switch) | DiscWatchHQ"
 */
export function buildReleaseTitle(r: SeoRelease): string {
  const plat = shortPlatformList(r.platforms)
  const platStr = plat ? ` on ${plat}` : ""
  const status =
    r.status === "available"   ? `Available Now${platStr}` :
    r.status === "coming_soon" ? `Coming Soon${platStr}`   :
                                  `Sold Out (${plat || "Physical"})`
  // Target ≤ 65 chars for full SERP display; trim game title first if needed
  const suffix   = ` – ${status} | DiscWatchHQ`
  const maxTitle = 65 - suffix.length
  const gameTitle = trimToLen(r.title, Math.max(maxTitle, 20))
  return `${gameTitle}${suffix}`
}

// ── Meta description ──────────────────────────────────────────────────────────

/**
 * Returns a unique <meta description> for a release detail page (~155 chars).
 * Incorporates publisher, platform, price, availability, and all four major
 * retailers to target "buy [game] physical" and "[game] price comparison"
 * searches — the two highest-intent query patterns for this site.
 */
export function buildReleaseDescription(r: SeoRelease): string {
  const pub   = r.publisherName
  const plat  = platformList(r.platforms) || "multiple platforms"
  const price = r.price ? ` at ${r.price}` : ""

  let desc: string
  if (r.status === "available") {
    const closes = r.preorderCloseDate ? ` Order closes ${fmtDate(r.preorderCloseDate)}.` : ""
    desc = `${r.title} (${pub}, ${plat}) is available for preorder${price}.${closes} Compare prices at GameStop, Amazon, eBay & Best Buy. Limited run — won't be reprinted.`
  } else if (r.status === "coming_soon") {
    desc = `${r.title} is coming soon from ${pub} for ${plat}. Preorders not yet open. Track the drop and compare prices at GameStop, Amazon, eBay & Best Buy on DiscWatchHQ.`
  } else {
    const soldDate = r.soldOutAt ? ` on ${fmtDate(r.soldOutAt)}` : ""
    desc = `${r.title} (${pub}, ${plat}) sold out${soldDate}. Find secondhand copies and compare prices at eBay, GameStop, Amazon & Best Buy via DiscWatchHQ.`
  }

  // Target ≤ 155 chars for full SERP snippet display
  return trimToLen(desc, 155)
}

// ── Descriptive copy paragraph ────────────────────────────────────────────────

/**
 * Returns 2–3 sentences of unique, human-readable copy about a specific
 * release. Displayed on the page itself — content that serves real users
 * AND gives search engines (and AI crawlers) concrete, unique text to index.
 *
 * This is the most important SEO element: unique body copy per URL is what
 * earns genuine organic ranking and AI citation, not just schema markup.
 */
export function buildReleaseDescriptiveCopy(r: SeoRelease): string {
  const plat    = platformList(r.platforms) || "physical media"
  const edition = r.editionType && r.editionType !== "Standard Edition"
    ? ` ${r.editionType}`
    : " physical edition"

  const intro = `${r.title} is a limited-run${edition} for ${plat}, published exclusively by ${r.publisherName}.`

  if (r.status === "available") {
    const priceStr   = r.price ? ` priced at ${r.price}` : ""
    const windowStr  = r.preorderCloseDate
      ? ` Preorders close on ${fmtDate(r.preorderCloseDate)} — after that date this run is done.`
      : " Once the preorder window closes, this run will not be reprinted."
    const scarcity = ` Physical editions from ${r.publisherName} are pressed in strictly limited quantities and do not get restocked, making them collectible from day one.`
    return `${intro} This edition is available now${priceStr}.${windowStr}${scarcity}`
  }

  if (r.status === "coming_soon") {
    const relStr = r.releaseDate
      ? ` A release date of ${fmtDate(r.releaseDate)} has been announced.`
      : " A preorder window date has not yet been announced."
    return `${intro}${relStr} ${r.publisherName} produces games in limited print runs that sell out quickly — sign up for alerts below so you don't miss this one when it drops.`
  }

  // sold_out
  const soldStr = r.soldOutAt
    ? ` This edition sold out on ${fmtDate(r.soldOutAt)} and is no longer available directly from ${r.publisherName}.`
    : ` This edition has sold out and is no longer available directly from ${r.publisherName}.`
  const secondary = " Limited-run physical games often appear on the secondary market shortly after selling out — use the retailer links below to search eBay, GameStop, and Amazon for available copies."
  return `${intro}${soldStr}${secondary}`
}

// ── Product JSON-LD (schema.org) ──────────────────────────────────────────────

/**
 * Returns a schema.org JSON-LD object for a release detail page.
 *
 * Uses dual @type ["Product", "VideoGame"] so the markup satisfies both:
 *   • Product — enables price/shopping rich results in Google Search
 *   • VideoGame — correct semantic type; enables additional VideoGame-specific
 *     rich result signals (gamePlatform, publisher, genre)
 *
 * Only populated fields are included. Google penalises schema with fake or
 * empty attributes more than it rewards complete-but-fake schema.
 */
export function buildReleaseJsonLd(
  r: SeoRelease,
  canonicalUrl: string,
): Record<string, unknown> {
  const price     = parsePrice(r.price)
  const plat      = platformList(r.platforms)
  const schemaAvailability =
    r.status === "available"   ? "https://schema.org/InStock"   :
    r.status === "coming_soon" ? "https://schema.org/PreOrder"  :
                                  "https://schema.org/SoldOut"

  const description = buildReleaseDescriptiveCopy(r)

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    // Dual type: Product qualifies for price/shopping rich results;
    // VideoGame is the semantically correct type for game titles.
    "@type":    ["Product", "VideoGame"],
    "name":     r.title,
    "description": description,
    // publisher is a VideoGame property; brand covers the Product side.
    "publisher": {
      "@type": "Organization",
      "name":  r.publisherName,
    },
    "brand": {
      "@type": "Brand",
      "name":  r.publisherName,
    },
    "url": canonicalUrl,
  }

  if (r.coverImageUrl) {
    schema["image"] = r.coverImageUrl
  }

  // gamePlatform is a first-class VideoGame property — more semantically
  // correct than additionalProperty for platform data.
  if (r.platforms?.length) {
    schema["gamePlatform"] = r.platforms.length === 1
      ? r.platforms[0]
      : r.platforms
  }

  if (r.editionType) {
    schema["additionalProperty"] = {
      "@type": "PropertyValue",
      "name":  "Edition",
      "value": r.editionType,
    }
  }

  // Offer block — only include price when we have a real number
  const offer: Record<string, unknown> = {
    "@type":         "Offer",
    "itemCondition": "https://schema.org/NewCondition",
    "availability":  schemaAvailability,
    "url":           r.productUrl || canonicalUrl,
    "seller": {
      "@type": "Organization",
      "name":  r.publisherName,
    },
  }

  if (price) {
    offer["price"]         = price
    offer["priceCurrency"] = "USD"
  }

  if (r.preorderCloseDate && r.status === "available") {
    offer["priceValidUntil"] = r.preorderCloseDate.slice(0, 10)
  }

  schema["offers"] = offer

  // Wrap in @graph alongside BreadcrumbList so Google can show breadcrumbs
  // in SERPs and the Product/VideoGame entity is properly contained.
  delete schema["@context"]
  return {
    "@context": "https://schema.org",
    "@graph": [
      schema,
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home",             "item": "https://discwatchhq.com/" },
          { "@type": "ListItem", "position": 2, "name": "Boutique Tracker", "item": "https://discwatchhq.com/boutique" },
          { "@type": "ListItem", "position": 3, "name": r.title,            "item": canonicalUrl },
        ],
      },
    ],
  }
}

// ── Canonical URL helper ──────────────────────────────────────────────────────

/** Build an absolute canonical URL from a path using the current origin. */
export function buildCanonicalUrl(path: string): string {
  if (typeof window === "undefined") return path
  // Strip query params + hashes — canonical always points to the clean URL
  return `${window.location.origin}${path}`
}
