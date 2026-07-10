---
name: Catalog quality filters
description: Rules and pitfalls for filtering RAWG/TGDB junk entries (fan demakes, test builds, merch) out of catalog_games and releases.
---

## RAWG junk-entry filter (`isPlausibleRawgGame` in catalogService.ts)

RAWG's community DB includes fan-made retro demakes, challenge runs, and test builds. Applied as `.filter(g => isPlausibleRawgGame(g.name))` in `fetchFromRawg` before mapping/upsert.

**Patterns that work:**
- `zoohair` — explicit community junk marker
- `\bdemake\b` — explicit demake label
- `\(\s*test[\s)]` — parenthetical test tokens: `(test)`, `(Test Build)` — NOT bare `\btest\b`
- `/\s+Test\s*$/i` + `!/^(the|a|an)\s/i` — trailing annotation Test; the prefix exclusion protects "The Turing Test" while catching "Elden Ring Test"
- `RAWG_RETRO_DEMAKE_RE`: `/\s+(PS1|PS2|GB|GBA|GBC|N64|NES|SNES|GameCube|Dreamcast|Saturn|Sega\s+Genesis)(\s|$|\s*\()/i` — retro platform suffix in title
- `RAWG_TIME_CHALLENGE_RE`: `/\s+in\s+\d+\s+(minute|hour|day|second)/i` — challenge-run titles

**Why NOT `\btest\b` alone:**
Causes false positives on "Test Drive", "Test Drive Unlimited", "The Turing Test", "Test Mechanic". Use the targeted trailing-Test + prefix guard instead.

## TGDB junk-entry filter (`isPlausibleTgdbEntry` in catalogService.ts)

TGDB is community-edited. Applied per-row in `mapTgdbGames` before upsert.

**Patterns:**
- `zoohair`, `\bplaceholder\b`, `\(\s*test[\s)]` — explicit junk markers (same rule as RAWG: not bare `\btest\b`)
- Platform plausibility: `TGDB_ANCIENT_PLATFORMS` (PS1, GB, GBC, N64, SNES, NES, Genesis, Saturn, Dreamcast, Game Gear, Sega CD, Atari, TG-16, Neo Geo — NOT Wii/Xbox 360/PS2/GBA which had real tail releases) + release_year >= 2016 → reject

**Why NOT Wii/Xbox 360/PS2/GBA in ancient list:**
These platforms had legitimate late releases after 2013. Threshold 2016 is conservative; do NOT lower it.

## TGDB fallback-only search (games.ts search route)

TGDB is sequential-fallback, not parallel. RAWG is awaited first; TGDB called only when `rawgRows.length === 0`. This prevents TGDB's junk from appearing alongside clean RAWG results.

## GameStop affiliate URL

Parameter is `q=` (NOT `searchTerm=` — the old param returns zero results on GameStop's current site). The Rakuten deep-link wrapper encodes the direct URL, so fixing the direct URL is sufficient.

`buildGameStopSearchUrl()` in `affiliateConfig.ts` → `https://www.gamestop.com/search/?q=${encodeURIComponent(title)}`

## Boutique vs Browse Games — merch policy

**Browse Games** = games only (catalog_games table, RAWG/TGDB sources).  
**Boutique** = intentionally broad — games AND collectible merch (pins, figures, CEs, apparel, art books, etc.) from tracked storefronts. All items drive affiliate purchases.

`blizzardGear.ts` skips **gift cards only** — all other products (including pins, Funko Pops, art books) are included in Boutique. Do NOT add a product_type merch filter to Boutique scrapers (Blizzard, Fangamer, iam8bit, etc.).

## Hero tile animation opacity

LandingPage.tsx tile grid: opacity 0.5 (was 0.3 — invisible). Left vignette: `via-background/70 to-background/10` (was `/92 /20` — too aggressive). Any further fading can be tuned here.
