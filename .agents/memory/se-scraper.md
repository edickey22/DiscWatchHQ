---
name: Square Enix NA store scraper
description: BigCommerce Stencil HTML scraper for na.store.square-enix-games.com — video games + 7 merch categories
---

## Key facts

- Real store URL: `na.store.square-enix-games.com` (NOT `store.na.square-enix-games.com` — old domain 301s with empty body)
- Platform: BigCommerce Stencil; server-rendered HTML, no JS execution needed
- CDN: Cloudflare — browser-like headers required (User-Agent, Accept, Accept-Language, Sec-Fetch-*)
- No trailing slash or `/collections/` prefix — those get Cloudflare-blocked (empty responses < 5KB)
- DB id: 15, slug: `square-enix`, enabled: true

## Video games: /video-games

- Paginated with `?page=N`, 16 items/page, ~2-5 pages; max 15 pages
- **Boutique filter:** keeps ONLY `coming_soon` OR items with a named edition (Collector's/Limited/Deluxe/Special); everything else dropped
- **Why:** /video-games mixes genuine SE-exclusive pre-orders with standard retail back-catalog (available everywhere)

## Merch categories (7) — no boutique filter

- `/merchandise/figures`, `/merchandise/plush`, `/merchandise/jewelry`, `/merchandise/accessories`, `/merchandise/home-goods`, `/merchandise/apparel`, `/ffxiv-merchandise`
- All in-stock AND pre-order items included; `platforms: []`; `editionType: null`
- 3 s inter-category delay; 1.5 s inter-page delay; max 15 pages/category
- **Why:** SE merch is SE-store-exclusive by nature — no boutique quality filter needed (same rationale as Blizzard Gear Store)
- `parseMerchCard()` is separate from `parseCard()` so video-games filter is never touched
- Scale: ~894 merch items + 7 game items ≈ 901 total per full scrape run

## HTML structure (BC Stencil card — same for all categories)

- Card: `<article class="card" data-product-id="...">`
- Title: `<h3 class="prod-name"><a href="...">Title</a></h3>`
- Price: `<span data-product-price-without-tax class="price price--withoutTax">$59.99</span>`
- Image: `<img class="card-image lazyload" data-src="https://cdn11.bigcommerce.com/...jpg">` — CDN serves `/stencil/{WxH}/` size variants; scraper upgrades `270x360` → `1280x1280` at capture time. Other publishers use Shopify JSON which already returns full-res.
- Status from button: "Pre-Order Now" → coming_soon; "Add to Cart" → available; neither → sold_out
- Titles contain HTML entities (`&amp;`, `&#x27;`) — must be decoded before storing

## Platform detection (video games only)

- Check combined title + URL slug — platform often in one but not the other
- Fallback: `["Unknown"]` — never skip; item stays eligible for detail-page enrichment
- Detail-page enrichment: spec table → JSON-LD additionalProperty → meta keywords → og:description → meta description
- DB-cached platforms skip re-fetch on subsequent runs
