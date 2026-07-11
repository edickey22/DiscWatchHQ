---
name: Publisher scraper registry
description: Which publishers have scrapers, their correct domains, and why some are disabled
---

## Rule
Add a publisher by: (1) create `artifacts/api-server/src/lib/scraper/publishers/<name>.ts`, (2) add to `registry.ts`, (3) insert DB row with `enabled = true`.

**Why:** Modular registry lets scrapers be added/removed without touching shared code.

## Live scrapers (all Shopify JSON) — 7 as of 2026-07-11
| Slug | Domain | Collections |
|------|--------|-------------|
| `limited-run-games` | limitedrungames.com | pre-orders → available; coming-soon → coming_soon; classics → sold_out |
| `strictly-limited-games` | **strictlylimitedgames.com** (not strictly-limited.com) | pre-order → available; coming-soon → coming_soon |
| `iam8bit` | iam8bit.com | games collection; status from variant.available + body_html shipping dates |
| `super-rare-games` | superraregames.com | featured + all collections; filter to SRG#NNN titles |
| `fangamer` | fangamer.com | physical-games collection; filter by game signal keywords |
| `xbox-game-studios` | shop.xboxgamestudios.com | collector-editions collection |
| `blizzard-gear` | gear.blizzard.com | limited-edition collection |

**Why revised:** original count of 5 went stale after Xbox Game Studios Shop and Blizzard Gear Store were added; always confirm against `registry.ts` before quoting a count.

## Disabled / defunct (seeded in DB, no scraper)
- `special-reserve-games` — **defunct since 2024**, domain redirects to Devolver Digital.
- Nintendo Official Store — custom platform, no public product feed.
- PlayStation Direct — custom platform, no public product feed.

## Amazon URL extraction
Only `limitedRun.ts` currently extracts Amazon URLs from body_html. Pattern: `amazon.com/dp/ASIN` or `amzn.to/SHORT`. Other scrapers don't have Amazon links in their product data.
