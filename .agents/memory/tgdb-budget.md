---
name: TGDB daily call budget
description: Hard cap on TGDB API calls to stay under the 1,000/month free tier limit
---

# TGDB Daily Budget System

## Constants (in tgdbBudget.ts)
- `DAILY_TOTAL = 28` — max calls per UTC day (28 × 31 = 868, safely under 1,000/month)
- `BACKFILL_ALLOC = 10` — reserved for the background backfill job
- `SEARCH_ALLOC = 18` — remaining for live user searches

## Architecture

**system_kv DB table** — persists budget state under key `tgdb_budget`:
```json
{ "date": "YYYY-MM-DD", "totalCalls": N, "backfillCalls": N }
```
Also persists backfill progress: `rawg_backfill_idx` and `tgdb_backfill_idx` (nextIndex into POPULAR_TITLES).

**`checkAndReserveTgdbCall(type)`** — the ONLY public entry point for gating a call:
- One `await getState()` (DB on cold path, instant on warm)
- Then synchronously: check counts, mutate `_mem.totalCalls`, fire-and-forget persist
- Atomic in Node.js microtask model — no intermediate awaits between check and mutation
- Returns `true` if slot reserved, `false` if exhausted

**`canCallTgdb(type)`** — read-only peek (no reservation), for monitoring/logic only.

**`getTgdbBudgetStatus()`** — full snapshot for GET /api/catalog/tgdb-budget.

## Permanent cache check (in games.ts)
Before calling TGDB for a search query `q`:
```sql
SELECT count(*) FROM catalog_games WHERE source = 'tgdb' AND title ILIKE '%q%'
```
If count > 0 → TGDB already indexed results for this query area → skip entirely, no budget spent.
Only a TRUE cache miss (0 TGDB rows match) + budget available → call TGDB.

## Failure modes
- **DB read failure**: returns pessimistic "budget full" for that call only; `_mem` left null so next call retries. NOT sticky all day.
- **DB write failure**: `_mem` already updated synchronously; logs warn; TGDB call proceeds; at most 1 slot may be lost across restart.
- **Budget exhausted**: search falls back to RAWG + local DB silently (no error to user).

## Backfill (catalogBackfill.ts)
- Fires 10s after startup, then every 24h
- RAWG phase: 20 titles/day, 350ms pacing
- TGDB phase: up to 10 titles/day (BACKFILL_ALLOC), with hasTgdbEntries() permanent-cache check before each call
- Progress indices wrap around when all 97 POPULAR_TITLES are processed
- Prevents infinite loop when all titles indexed: `skipped >= total` → break

**Why:** TGDB free tier is 1,000 req/month ≈ 33/day. Without the budget system the live search logic would call TGDB on every cold cache miss, exhausting the monthly cap in a few hours of active use.
