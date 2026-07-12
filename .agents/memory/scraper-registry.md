---
name: Publisher scraper registry
description: Which boutique publisher storefronts are scrapable and how, plus platform quirks per publisher.
---

- 9 publishers now scraped (was 7): added eastasiasoft and Red Art Games.
- SRG defunct (Devolver 2024); correct SLG domain is strictlylimitedgames.com not strictly-limited.com.
- **eastasiasoft** (shop.eastasiasoft.com) is Shopify — standard `/collections/games/products.json` feed, same pattern as the other Shopify scrapers. The storefront already separates games from merch into distinct collections, so no merch-keyword filtering is needed, just scope to the "games" collection handle. No `product_type`/`tags` populated on this store, so platform/edition must be parsed from the title text.
- **Red Art Games** (redartgames.com) runs PrestaShop, not Shopify — no public JSON products feed, and their webservice API (`/api/...`) needs an auth key we don't have. Scraper instead parses the HTML of the `/33-games` category listing (paginated ~30 pages), using cheerio. Sold-out signal in listing HTML: `<li class="product-flag out_of_stock">`; available signal: presence of an `data-button-action="add-to-cart"` element. Prices are EUR — returned as null (site only displays USD), consistent with how SRG's GBP prices are handled.
- Investigated but rejected: **Skybound Games** — its real storefront (store.skybound.com) is a custom SvelteKit app on Heroku with no discoverable public JSON API; `skybound.myshopify.com` exists but is an unrelated business (name collision), not their real store. Not cleanly scrapable without deeper reverse-engineering.
- Publisher DB rows have no seed script in the codebase — publishers were inserted directly via SQL/psql against `publishers` table (unique constraint on `slug`). Adding a new scraper file + registry entry is not enough; a matching `publishers` row (enabled=true) must also exist or the scraper is silently skipped by the runner.
