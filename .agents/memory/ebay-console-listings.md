---
name: eBay console listings (multi-listing detail pages)
description: Why sort=price on eBay Browse API searches surfaces junk, and how console listing quota/caching is structured
---

- Never use `sort=price` (ascending) on eBay Browse API `item_summary/search` calls for consoles/hardware. Cheap accessories, parts, and unrelated items dominate the low end of the price range and bury every genuine console listing. Omit `sort` (defaults to best-match relevance) to get real matches, then sort the filtered survivors by price client/server-side yourself.
- eBay category 139971 ("Video Game Consoles") is not scoped tightly — plain keyword search within it still returns manuals, replacement parts, repair services, and cross-model items (e.g. a "PlayStation 5" query returning PS Vita or Xbox Series S). Mitigate with: (1) a title blocklist for non-console terms, (2) a per-hardware-generation minimum price floor, (3) explicit negative keywords in the query for known sibling-model confusions (e.g. `-"Series S"` on the Series X query).
- One Browse API call already returns up to ~60+ raw candidates per request — fetching multiple listings per console costs the same 1 API call as fetching a single "cheapest" one. Don't design a scheduler that calls the API once per listing.
- Live console listings must be populated by a scheduled background job only (consoleListingsScheduler.ts style, mirroring ebayPriceScheduler.ts) — visitor requests must only ever read an in-process cache, never trigger a live API call, to keep shared 5,000-call/month quota safe.
