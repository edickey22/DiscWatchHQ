---
name: Affiliate monetization config
description: How PressRun handles affiliate links — config location, activation pattern, URL building rules
---

## Rule
Affiliate IDs are env-var-only, never hardcoded. The site falls back to plain links silently when IDs are absent.

**Why:** User explicitly required graceful no-ID fallback so the site works before sign-up is complete.

## Config location
`artifacts/api-server/src/lib/affiliateConfig.ts`

- `EBAY_CAMPAIGN_ID` → `affiliateConfig.ebay.campaignId` (trimmed)
- `AMAZON_ASSOCIATES_TAG` → `affiliateConfig.amazon.associatesTag` (trimmed)
- `GAMESTOP_RAKUTEN_ID` → `affiliateConfig.gamestop.affiliateId` (Rakuten/LinkShare publisher ID)
- `BESTBUY_IMPACT_ID` → `affiliateConfig.bestbuy.affiliateId` (Impact SID)

## URL building (4 retailers)
- `buildEbaySearchUrl(title)` — eBay category 139973; appends EPN params when campaign ID is set
- `buildAmazonSearchUrl(title)` — `amazon.com/s?k=title`; appends `&tag=` when Associates tag is set
- `buildGameStopSearchUrl(title)` — plain `gamestop.com/search`; wrapped in `click.linksynergy.com/deeplink?id=&mid=35864&murl=` when Rakuten ID is set
- `buildBestBuySearchUrl(title)` — plain `bestbuy.com/searchpage.jsp?st=`; wrapped in `bestbuy.7eer.net/c/{id}/{programId}?url=` when Impact ID is set
- `buildAmazonProductUrl(url)` — adds `?tag=` to a known ASIN URL; only `https://amazon.*/amzn.to` hostnames pass allowlist

## Injection point
`artifacts/api-server/src/routes/releases.ts` → `formatRelease()`:
- `retailerSearchUrls: { ebay, amazon, gamestop, bestbuy }` — REQUIRED in schema, always present on every release regardless of status; computed server-side
- `amazonUrl`: DB stores raw Amazon URL (scraped ASIN link); API layer applies affiliate tag before returning (separate from the search URL above)

## DB
`releases.amazon_url` column stores the raw canonical Amazon URL scraped from product descriptions. Currently only the LRG scraper extracts these (from body_html via regex matching `amazon.com/dp/ASIN` and `amzn.to` patterns).

## Frontend
- `RetailerLinks.tsx`: shared component — compact "SEARCH ON · GameStop · eBay · Amazon · Best Buy" row; two variants (`card` = tiny, `detail` = slightly larger); all 4 links have `rel="noopener noreferrer sponsored"` and `e.stopPropagation()`
- `GameCard.tsx`: `RetailerLinks variant="card"` at bottom of every card for every status (no conditional)
- `ReleaseDetail.tsx`: publisher storefront link is always primary CTA (plain/unsponsored); `RetailerLinks variant="detail"` is secondary inside action panel
- Publisher storefront links are always plain `rel="noopener noreferrer"` — no boutique affiliate programs exist

**How to activate:** Set `EBAY_CAMPAIGN_ID` and/or `AMAZON_ASSOCIATES_TAG` in Replit Secrets. No code changes needed.
