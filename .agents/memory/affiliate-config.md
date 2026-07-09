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

## URL building
- `buildEbaySearchUrl(title)` — constructs eBay search URL for category 139973 (Video Games). Appends `mkcid/mkrid/siteid/campid/toolid/mkevt` params when campaign ID is set.
- `buildAmazonUrl(url)` — adds `?tag=` only on `https://amazon.*/amzn.to` hostnames (allowlist check). Strips `linkCode`/`linkId` to avoid conflicts.

## Injection point
`artifacts/api-server/src/routes/releases.ts` → `formatRelease()`:
- `ebaySearchUrl`: only populated for `sold_out` releases
- `amazonUrl`: DB stores raw Amazon URL; API layer applies affiliate tag before returning

## DB
`releases.amazon_url` column stores the raw canonical Amazon URL scraped from product descriptions. Currently only the LRG scraper extracts these (from body_html via regex matching `amazon.com/dp/ASIN` and `amzn.to` patterns).

## Frontend
- `GameCard.tsx`: sold-out cards show small "eBay →" link (red, `rel="sponsored"`, stopPropagation)
- `ReleaseDetail.tsx`: sold-out detail page shows "Find on eBay" as primary CTA (red button), "Check Amazon" as secondary if amazonUrl is present
- Available items: publisher link is primary (no affiliate); "Also on Amazon" secondary if amazonUrl is present
- Publisher storefront links are always plain (no boutique affiliate programs exist)

**How to activate:** Set `EBAY_CAMPAIGN_ID` and/or `AMAZON_ASSOCIATES_TAG` in Replit Secrets. No code changes needed.
