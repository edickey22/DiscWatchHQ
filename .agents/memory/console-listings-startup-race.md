---
name: Console listings startup race
description: Why every restart/deploy briefly showed 0 eBay listings for all consoles, and the fix.
---

The console listings scheduler loaded its persisted `system_kv` snapshot into the in-memory cache
only inside the same 30s-delayed startup callback that kicked off the first live eBay refresh.
The HTTP server started accepting requests immediately, so for up to 30 seconds after every
restart/deploy, `getConsoleListingsEntry()` read from an empty in-memory cache and every console
page showed "no listings" — even though real, valid data was already sitting in `system_kv`.

**Why:** decoupling "when the server can serve traffic" from "when its caches are warm" is a
classic race; bundling a cheap synchronous-ish cache load with a slow rate-limited network refresh
made the fast path wait on the slow one for no reason.

**How to apply:** any in-memory cache backed by a persisted store must be loaded as early as
possible in the startup sequence, before/independent of the server accepting requests — never
folded into the same delayed callback as a slow network refresh. Split "load persisted snapshot"
(fast, do immediately) from "go fetch fresh data" (slow/rate-limited, can be delayed/staggered).
