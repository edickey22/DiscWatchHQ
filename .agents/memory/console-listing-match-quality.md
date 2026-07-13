---
name: Console listing match quality (eBay Browse API)
description: Why query-string exclusions aren't enough to keep sibling console models (PS5 Pro vs PS4, Switch 2 vs Switch) from leaking into each other's results, and the fix.
---

eBay Browse API's relevance search does not reliably honor `-"term"` query exclusions — sibling
hardware models (PS5 Pro vs PS4/PS5, Xbox Series X vs Series S, Switch 2 vs Switch) still leak into
each other's results even with negative keywords in the query string.

**Why:** confirmed by direct API testing — a `ps5-pro` query with zero post-filtering returned a
PS4 Pro and PS5 Slim listings mixed in with real PS5 Pro consoles.

**How to apply:** add a second, server-side gate applied *after* the fetch: per-model
`requireTerms` (at least one acceptable phrasing of the model name must appear in the title,
word-boundary-safe) and `excludeTerms` (disqualifying substrings). A bare single-word requireTerm
like "pro" is still unsafe — it can match inside unrelated accessory branding (e.g. a "PS Nova Pro"
headset bundled with a regular PS5) — require the distinguishing word adjacent to context (e.g.
"5 pro"/"5pro" rather than just "pro").

Also: eBay Browse API item summaries expose `AUCTION` buying-option listings via
`currentBidPrice`/`bidCount`/`itemEndDate` fields (distinct from `price` on FIXED_PRICE items) —
request `buyingOptions:{FIXED_PRICE|AUCTION}` to include live auctions, not just Buy It Now.
