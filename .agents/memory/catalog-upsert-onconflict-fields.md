---
name: catalog_games upsert must update every mutable field
description: ON CONFLICT DO UPDATE in upsertCatalogGames must list every field that can legitimately change on a re-fetch, especially releaseDate/releaseYear — omitting one silently freezes that column forever for any row already in the table.
---

## The bug
`upsertCatalogGames()` (catalogService.ts) writes to `catalog_games` keyed by
`sourceId` via `ON CONFLICT DO UPDATE`. The `set` clause is a hand-picked list
of columns — it originally omitted `releaseDate`/`releaseYear`. Any title
first indexed without a confirmed date (search results, backfill, or a RAWG
response missing `released`) got a blank/null date on insert, and every
future upsert for that same `sourceId` — even when a later RAWG call
returned a real, confirmed future date — could never overwrite it, because
the column simply wasn't in the update set.

**Symptom:** the "Upcoming" games section (filters on `release_date > today`)
stayed permanently empty even though RAWG's live API had plenty of real
future-dated titles, and even though the app's own cold-cache logic was
calling RAWG and getting 200s. The rows existed in `catalog_games` with
blank `release_date` and never got corrected.

**Why:** `ON CONFLICT DO UPDATE ... SET` only touches columns explicitly
listed. This is easy to get subtly wrong when a table has many "upstream can
change this" fields and the set list is maintained by hand.

**How to apply:** whenever adding a new mutable field to a table with an
upsert-by-external-key pattern (`sourceId`, `externalId`, etc.), audit the
`onConflictDoUpdate` set clause and confirm the new field is included. When
debugging "why does this record never reflect fresh upstream data," check
the upsert's `set` list before assuming the fetch or the filter query is
wrong.
