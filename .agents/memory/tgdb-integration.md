---
name: TGDB integration
description: TheGamesDB API endpoint facts, response shapes, and allowance constraints confirmed from live calls + spec.yaml
---

# TGDB API — confirmed facts

**Base URL:** `https://api.thegamesdb.net`

**Auth:** `apikey=<TGDB_API_KEY>` query param on every request.

## Endpoints

### Search — `/v1.1/Games/ByGameName`
- v1 (`/v1/Games/ByGameName`) has broken `mode` handling — always use v1.1
- `/v1/Games/ByGameTitle` does NOT exist (404)
- Params: `name`, `fields`, `include`, `page` (1-based integer), `filter[platform]`
- `fields` can include: `overview`, `rating`, `platform`, `publishers`, `genres`, `developers`, `players`, etc.
- `include` accepts ONLY `boxart` and `platform` — genres/publishers/developers are ID arrays in `fields`, NOT includable objects

### Detail — `/v1/Games/ByGameID`
- Param: `id` — comma-separated list of integer game IDs (e.g. `id=53,432`)
- Same `fields` and `include` support as search
- Efficient batching: pass up to ~50 IDs per request

### Publishers list — `/v1/Publishers`
- No required params beyond `apikey`
- Returns `{ data: { count: 4567, publishers: { "1": { id, name }, ... } } }`
- One request covers all ~4 500 publishers — cache as `Map<id, name>`

## Response shape (v1.1 ByGameName / v1 ByGameID — identical)
```json
{
  "code": 200,
  "data": {
    "count": 20,
    "games": [{
      "id": 108139,
      "game_title": "...",
      "release_date": "2018-02-01",   // "YYYY-MM-DD" or null
      "platform": 6,                  // SINGLE integer ID (not array)
      "rating": "E - Everyone",       // or "T - Teen", "M - Mature", "Not Rated", null
      "publishers": [3],              // array of integer IDs — resolve via publisher cache
      "genres": [1, 2],              // array of integer IDs
      "developers": [142]            // array of integer IDs
    }]
  },
  "include": {
    "boxart": {
      "base_url": {
        "original": "https://cdn.thegamesdb.net/images/original/",
        "medium": "https://cdn.thegamesdb.net/images/medium/",
        "thumb": "https://cdn.thegamesdb.net/images/thumb/"
      },
      "data": {
        "108139": [
          { "id": 424871, "type": "boxart", "side": "front", "filename": "boxart/front/108139-1.jpg" }
        ]
      }
    },
    "platform": {
      "data": {
        "6": { "id": 6, "name": "Super Nintendo (SNES)", "alias": "super-nintendo-snes" }
      }
    }
  },
  "pages": { "previous": null, "current": "...", "next": null },
  "remaining_monthly_allowance": 995
}
```

**Cover URL construction:** `base_url.medium + filename` (medium CDN for quality/size tradeoff)

## Allowance
- Free tier: 1 000 requests/month
- `remaining_monthly_allowance` in every response
- Publisher cache fetch = 1 request; cache for process lifetime (retry on failure — do NOT commit empty map)
- DB-backed search means each unique query term only costs 1 TGDB request total

## Publisher cache design
- Singleton module-level `Map<number, string>` — populated lazily on first TGDB search
- In-flight promise guard (`_publisherCacheFetch`) prevents concurrent duplicate fetches
- On transient failure: return empty map WITHOUT committing `_publisherCache = emptyMap` — next call retries
- On success: commit to `_publisherCache` — subsequent calls skip the fetch

## Platform normalisation
`normPlatform(name)` maps full TGDB platform names to short display names. Always apply before storing to DB.
Key mappings: "Super Nintendo (SNES)" → "SNES", "Nintendo Entertainment System (NES)" → "NES", "Sega Dreamcast" → "Dreamcast", etc.

## ESRB rating strings
Full strings like `"E - Everyone"`, `"T - Teen"`, `"M - Mature 17+"`, `"Not Rated"`.
EsrbBadge abbreviates: split on `" - "`, take left side → "E", "T", "M"; "Not Rated" → "NR".
