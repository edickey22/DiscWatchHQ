---
name: Square Enix NA store scraper
description: BigCommerce Stencil HTML scraper for na.store.square-enix-games.com/video-games
---

## Key facts

- Real store URL: `na.store.square-enix-games.com` (NOT `store.na.square-enix-games.com` — old domain 301s with empty body)
- Platform: BigCommerce Stencil; server-rendered HTML, no JS execution needed
- CDN: Cloudflare — browser-like headers required (User-Agent, Accept, Accept-Language, Sec-Fetch-*)
- No trailing slash or `/collections/` prefix — those get Cloudflare-blocked (empty responses < 5KB)
- Category: `/video-games` (no trailing slash), paginated with `?page=N`, 16 items/page, ~5 pages as of 2026-08-05

## HTML structure (BC Stencil card)

- Card: `<article class="card" data-product-id="...">` (16 per page)
- Title: `<h3 class="prod-name"><a href="https://na.store.square-enix-games.com/slug">Title</a></h3>`
- Price: `<span data-product-price-without-tax class="price price--withoutTax">$59.99</span>`
- Image: `<img class="card-image lazyload" data-src="https://cdn11.bigcommerce.com/...jpg">`
- Status from button text: "Pre-Order Now" → coming_soon; "Add to Cart" → available; neither → sold_out
- Titles may contain HTML entities (`&amp;`, `&#x27;`) — must be decoded before storing

## Platform detection

- SE puts platform in title for some products ("OCTOPATH TRAVELER - Switch 2") but not others ("FINAL FANTASY VII REBIRTH")
- Also check URL slug — sometimes platform appears there but not title ("final-fantasy-vii-rebirth---switch-2")
- Combined title+slug search is the most reliable approach
- When neither has a platform keyword: use `["Unknown"]` rather than skipping the item

**Why:** SE's `/video-games` category contains a mix of platform-specific and platform-agnostic listings. Requiring a platform in the title dropped ~75% of valid products.

## isGame filter

Block on keyword blocklist, NOT on requiring a platform:
- Digital: "game time card", "day game time", "free trial", "- digital"
- Art/companion: "art book", "artbook", "art of ", "making of"
- Merch: "crystal monsters gallery", "figure", "statue", "plush", "soundtrack", "t-shirt", "hoodie", "poster", "pin set", "lanyard"

**Why:** The `/video-games` category is games-focused but digital subscription codes and a few companion items slip through. The platform filter was rejecting ~75% of valid physical games.

## Publisher DB

- DB id: 15, slug: `square-enix`, enabled: true
- No affiliate program (SE is itself an Amazon affiliate, no external program)
