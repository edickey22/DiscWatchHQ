---
name: eBay console search query phrasing
description: Why multi-word console model queries must quote the core phrase for both the Browse API and public eBay search links.
---

An unquoted multi-word query (e.g. `PlayStation 5 Pro console -"PS4"`) is treated by eBay's
search (both the Browse API and the public `_nkw` search-box URL) as an OR of loose keywords,
not a requirement that they appear together. Since "5", "PlayStation", and "console" all
appear in PS4/PS5 listings too, this flooded results with siblings despite `-"term"` exclusions.

**Why:** exclusion terms alone don't scope the positive match — eBay's relevance search still
ranks in near-match sibling listings highly when the main phrase isn't quoted.

**How to apply:** for any `ConsoleModel.query` in `consoleModels.ts` whose model name overlaps
with a sibling (Pro/Slim/generation variants), wrap the exact distinguishing phrase in quotes,
e.g. `"PlayStation 5 Pro" console -"PS4" -"PS3" -Slim`. This affects both the internal
eBay Browse API fetch and the outbound "Search all on eBay" link since both are built from the
same `query` field — fixing one fixes both.
