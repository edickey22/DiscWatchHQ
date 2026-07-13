---
name: eBay console listings — empty result retry
description: Why some consoles showed zero eBay listings while others worked, and the fix (retry + don't treat empty as fresh).
---

Some console models (PS5, Switch 2, Xbox Series S, Steam Deck, N64, Dreamcast, etc.) intermittently
cached 0 listings even though eBay has thousands of active listings for those exact queries —
confirmed by replaying the identical query directly against the Browse API and getting 150-190
valid matches after the same filters.

Root cause: the scheduler fires 26 sequential eBay calls ~2s apart at startup with a short
per-request timeout. A transient timeout/network hiccup on any single model's call caused that
model to cache an empty array — and the "skip if refreshed within 24h" freshness check treated
that empty result exactly like a real successful fetch, so the model stayed stuck at 0 listings
for a full day with no retry path.

**Why:** an empty cache entry is far more often a fluke (timeout, momentary throttle) than genuine
zero inventory for any real console model — no console realistically ever has zero eBay listings.

**How to apply:** in any scheduler with a "skip if fresh" cache-freshness check, exempt
empty/failed results from the freshness gate so they retry on the very next cycle instead of a
full interval, and add one retry-with-backoff for transient fetch failures before accepting an
empty result for a whole cycle. Applied in `ebayConsolesClient.ts` (retry + 12s timeout) and
`consoleListingsScheduler.ts` (skip logic now requires `listings.length > 0` to treat an entry as
fresh).
