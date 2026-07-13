---
name: in-memory scheduler caches wiped on restart burn shared API budgets
description: A scheduler backed only by an in-memory cache re-fetches everything from scratch on every process restart, which in a dev environment with frequent restarts can exhaust a shared daily call budget in a fraction of the intended cadence — symptom is "some items mysteriously have no data" with no actual code bug in the fetch/filter logic.
---

## The pattern
`consoleListingsCache.ts` held live eBay console-listing data in a plain
in-memory `Map`, with no persistence. `consoleListingsScheduler.ts` always
re-fetched **all** models ~30s after every process start, spending one
shared-budget call per model regardless of how recently that data had
actually been refreshed.

**Symptom:** in a dev session with several restarts in one day, the shared
daily budget (`ebayBudget.ts`, allocated per call-type) got exhausted after
2-3 restarts' worth of redundant refreshes — not from real traffic. Whichever
items are last in the iteration order end up with zero data for the rest of
the day once the type's allocation hits zero, looking exactly like a filter
or API bug even though the fetch/filter code is correct.

**Why:** treating "process just started" as equivalent to "data is stale"
is wrong whenever the cache itself doesn't survive the restart — the two are
conflated by default with an in-memory-only cache.

**Fix pattern applied:** persist the cache (whole map, JSON blob) to
`system_kv` alongside its `updatedAt` per entry; load the persisted snapshot
at startup *before* the scheduler's first run; skip re-fetching any entry
whose persisted `updatedAt` is still within the normal refresh interval.
Same `system_kv` persistence idiom as the existing daily-budget modules
(`ebayBudget.ts`, `tgdbBudget.ts`) — reuse that pattern for any other
in-memory scheduler cache that shares a metered budget.

**How to apply:** when a scheduler consumes from a shared rate/call budget
and is backed by an in-memory cache, always ask "does a restart force a full
re-fetch regardless of freshness?" If yes, that's a latent budget-burn bug
that will surface as sporadic missing data correlated with deploy/restart
frequency, not with real usage.
