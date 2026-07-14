/**
 * Amazon Product Advertising API (PA-API) v5 client — finds the best
 * matching game listing for a given title and returns its live price +
 * direct affiliate product URL.
 *
 * Requires:
 *   AMAZON_PA_API_KEY      — PA-API v5 access key (AWS-style, not your
 *                             AWS root account key — issued separately by
 *                             the Associates Program once your account has
 *                             qualifying sales history)
 *   AMAZON_PA_API_SECRET   — PA-API v5 secret key, paired with the above
 *   AMAZON_ASSOCIATES_TAG  — Associates tracking tag (PartnerTag)
 *
 * When any of the three are absent this module returns null for every
 * lookup (silent no-op — the Amazon button stays a plain "Search on
 * Amazon" link with no price, same as GameStop today).
 *
 * ── Why PA-API instead of a plain keyword search ────────────────────────
 *
 * PA-API's SearchItems supports SearchIndex="VideoGames", which scopes
 * results to Amazon's actual Video Games browse node — this alone rules
 * out most unrelated departments. It is NOT sufficient on its own: the
 * Video Games node still contains controllers, headsets, gift cards,
 * strategy guides, and third-party accessories that happen to be filed
 * under it. Two extra layers are applied before a result is trusted:
 *
 *   1. `ItemInfo.Classifications.Binding.DisplayValue` — Amazon's own
 *      catalog binding/format field. Only "Video Game" is accepted;
 *      "Video Game Accessory", "Accessory", "Toy", "Electronics", etc.
 *      are rejected outright, mirroring the eBay console-listing
 *      junk-filter pattern (see ebayConsolesClient.ts).
 *   2. Title blocklist — catches mis-classified accessory/merch listings
 *      that Amazon's Binding field doesn't reliably tag (controllers,
 *      cases, skins, chargers, strategy guides, soundtracks, plushies).
 *
 * ── Signing ───────────────────────────────────────────────────────────────
 *
 * PA-API v5 requires AWS Signature Version 4 over a JSON POST body. There
 * is no official lightweight SDK for this narrow use case, so the
 * signature is computed directly with Node's built-in `crypto` — no AWS
 * SDK dependency needed.
 */

import { createHash, createHmac } from "crypto";
import { logger } from "./logger";
import { affiliateConfig, buildAmazonProductUrl } from "./affiliateConfig";

const ACCESS_KEY   = affiliateConfig.amazon.paApiKey;
const SECRET_KEY   = affiliateConfig.amazon.paApiSecret;
const PARTNER_TAG  = affiliateConfig.amazon.associatesTag;

export const amazonPaApiConfigured = !!(ACCESS_KEY && SECRET_KEY && PARTNER_TAG);

// US marketplace endpoint — DiscWatchHQ only targets amazon.com listings.
const REGION   = "us-east-1";
const SERVICE  = "ProductAdvertisingAPI";
const HOST     = "webservices.amazon.com";
const PATH     = "/paapi5/searchitems";
const TARGET   = "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems";

export interface AmazonListing {
  price: number;   // current listing price
  url:   string;    // direct product URL, Associates-tagged via buildAmazonProductUrl
  name:  string;    // item title as returned by Amazon
}

// ── Junk / non-game filtering ───────────────────────────────────────────────
//
// Only this exact Binding string is accepted. Amazon's other video-game-node
// bindings ("Video Game Accessory", "Accessory", "Toy", "Electronics", "Book")
// are all real Amazon values seen on accessory/guide/merch listings filed
// under the same VideoGames search index.
const ACCEPTED_BINDING = "Video Game";

// Catches listings Amazon still classifies (incorrectly, or via a bundle) as
// "Video Game" but are clearly not the base game itself.
const NON_GAME_TITLE_RE =
  /\b(controller|joystick|gamepad|headset|charger|charging|dock|case|skin|sticker|cover|stand|mount|cable|adapter|screen protector|plush|figure|statue|soundtrack|vinyl|strategy guide|art book|artbook|poster|keychain|pin|patch|mug|t-shirt|hoodie|gift card)\b/i;

interface PaApiSearchResponse {
  SearchResult?: {
    Items?: Array<{
      ASIN: string;
      ItemInfo?: {
        Title?: { DisplayValue?: string };
        Classifications?: { Binding?: { DisplayValue?: string } };
      };
      Offers?: {
        Listings?: Array<{
          Price?: { Amount?: number };
        }>;
      };
      DetailPageURL?: string;
    }>;
  };
  Errors?: Array<{ Code?: string; Message?: string }>;
}

function hmac(key: Buffer | string, msg: string): Buffer {
  return createHmac("sha256", key).update(msg, "utf8").digest();
}

function sha256Hex(msg: string): string {
  return createHash("sha256").update(msg, "utf8").digest("hex");
}

/** Builds the AWS4 Authorization header + companion headers for a signed POST. */
function signRequest(payload: string, amzDate: string): Record<string, string> {
  const dateStamp = amzDate.slice(0, 8); // YYYYMMDD

  const canonicalHeaders =
    `content-encoding:amz-1.0\n` +
    `content-type:application/json; charset=utf-8\n` +
    `host:${HOST}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${TARGET}\n`;
  const signedHeaders = "content-encoding;content-type;host;x-amz-date;x-amz-target";

  const canonicalRequest =
    `POST\n${PATH}\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256Hex(payload)}`;

  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign =
    `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;

  const kDate    = hmac(`AWS4${SECRET_KEY}`, dateStamp);
  const kRegion  = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign).toString("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    "content-encoding": "amz-1.0",
    "content-type": "application/json; charset=utf-8",
    "host": HOST,
    "x-amz-date": amzDate,
    "x-amz-target": TARGET,
    "authorization": authorization,
  };
}

/**
 * Find the best matching Amazon listing for a given game title, or null when:
 *   - PA-API credentials are not configured
 *   - no result passes the Binding + title filters below
 *   - the API call fails, times out, or rate-limits
 *
 * Results are intentionally uncached here — call-frequency management is
 * the caller's responsibility (catalogLivePricing 4-hour cache).
 */
export async function getAmazonProduct(title: string): Promise<AmazonListing | null> {
  if (!amazonPaApiConfigured) return null;

  try {
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ

    const payload = JSON.stringify({
      Keywords:      title,
      SearchIndex:   "VideoGames",
      ItemCount:     5,
      PartnerTag:    PARTNER_TAG,
      PartnerType:   "Associates",
      Marketplace:   "www.amazon.com",
      Resources: [
        "ItemInfo.Title",
        "ItemInfo.Classifications",
        "Offers.Listings.Price",
      ],
    });

    const headers = signRequest(payload, amzDate);

    const res = await fetch(`https://${HOST}${PATH}`, {
      method: "POST",
      headers,
      body:   payload,
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      logger.warn({ status: res.status, title }, "[Amazon] PA-API search failed");
      return null;
    }

    const data = (await res.json()) as PaApiSearchResponse;
    if (data.Errors?.length) {
      logger.warn({ errors: data.Errors, title }, "[Amazon] PA-API returned errors");
      return null;
    }

    const items = data.SearchResult?.Items ?? [];

    for (const item of items) {
      const binding = item.ItemInfo?.Classifications?.Binding?.DisplayValue;
      if (binding !== ACCEPTED_BINDING) continue;

      const name = item.ItemInfo?.Title?.DisplayValue ?? "";
      if (!name || NON_GAME_TITLE_RE.test(name)) continue;

      const price = item.Offers?.Listings?.[0]?.Price?.Amount;
      const url   = item.DetailPageURL;
      if (!price || price <= 0 || !url) continue;

      return {
        price,
        url:  buildAmazonProductUrl(url),
        name,
      };
    }

    return null;
  } catch (err) {
    logger.warn({ err, title }, "[Amazon] Product lookup error");
    return null;
  }
}
