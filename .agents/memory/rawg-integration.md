---
name: RAWG integration
description: How the RAWG game database integration is structured — route, cache, key, attribution requirements
---

## Structure
- API route: `artifacts/api-server/src/routes/games.ts`
  - `GET /api/games/search` — proxies RAWG `/games` endpoint with q, page, page_size, platform_id, genre_id
  - `GET /api/games/config` — returns `{ configured: boolean }` without leaking the key
- Frontend page: `artifacts/tracker/src/pages/GamesSearch.tsx` at route `/games`
- Card component: `artifacts/tracker/src/components/RawgGameCard.tsx`

## Key config
- `RAWG_API_KEY` Replit Secret — free tier at rawg.io/apidocs
- 100K requests/month free; 10-min server-side LRU cache (500 entries) keeps usage low
- When key is absent: API returns 503 `{ configured: false }` — frontend shows setup prompt gracefully

## Cache implementation
True LRU with `accessedAt` field updated on every read. Evicts the entry with the smallest `accessedAt` on overflow (not `cachedAt`).

## Attribution requirement
RAWG free-tier terms require an active hyperlink to rawg.io wherever data is displayed.
- GamesSearch page: attribution shown in page header + footer (`showRawgAttribution` prop on Footer)
- Footer.tsx has optional `showRawgAttribution` boolean prop — pass it from any page using RAWG data

## Why not generated hooks
Direct React Query `useQuery` + fetch is used in GamesSearch instead of the orval-generated client. RAWG data shape is completely separate from boutique release schema; adding it to the OpenAPI spec would increase codegen surface without benefit.

## Wordmark contrast fix (same session)
Header.tsx "Disc" span changed from `text-foreground` (always near-white) to `text-gray-900 dark:text-foreground`. `:root` CSS vars are identical to `.dark` vars (both are dark-mode values), so the explicit class ensures the wordmark is legible on light backgrounds too. Do NOT use `text-foreground` alone for the wordmark.
