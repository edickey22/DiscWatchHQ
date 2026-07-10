/**
 * /api/games — RAWG Video Games Database proxy
 *
 * Requires RAWG_API_KEY in Replit Secrets (free at rawg.io/apidocs).
 * Free tier: 100,000 requests/month. Results cached 10 min per query
 * to stay well within quota.
 *
 * ⚠ RAWG attribution requirement (free-tier terms):
 *   Every page displaying RAWG data must show an active hyperlink to
 *   rawg.io. This is enforced in the GamesSearch frontend component.
 */

import { Router } from "express";
import { logger } from "../lib/logger";
import {
  buildEbaySearchUrl,
  buildAmazonSearchUrl,
  buildGameStopSearchUrl,
  buildBestBuySearchUrl,
} from "../lib/affiliateConfig";

const router = Router();

const RAWG_KEY = (process.env.RAWG_API_KEY ?? "").trim();
export const rawgConfigured = !!RAWG_KEY;

// ── In-memory response cache ──────────────────────────────────────────────────

const CACHE_TTL_MS = 10 * 60 * 1_000; // 10 minutes

interface CacheEntry { data: unknown; cachedAt: number; accessedAt: number }
const cache = new Map<string, CacheEntry>();

function getCached(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) { cache.delete(key); return null; }
  // Update recency so true LRU eviction works correctly
  entry.accessedAt = Date.now();
  return entry.data;
}

function setCached(key: string, data: unknown): void {
  // True LRU eviction: evict the least-recently-accessed entry at capacity
  if (cache.size >= 500) {
    let lruKey: string | undefined;
    let lruTime = Infinity;
    for (const [k, v] of cache) {
      if (v.accessedAt < lruTime) { lruTime = v.accessedAt; lruKey = k; }
    }
    if (lruKey !== undefined) cache.delete(lruKey);
  }
  const now = Date.now();
  cache.set(key, { data, cachedAt: now, accessedAt: now });
}

// ── RAWG API types ────────────────────────────────────────────────────────────

interface RawgPlatform { platform: { id: number; name: string; slug: string } }
interface RawgGenre    { id: number; name: string }
interface RawgGame {
  id: number;
  slug: string;
  name: string;
  released: string | null;
  background_image: string | null;
  metacritic: number | null;
  rating: number;
  ratings_count: number;
  platforms: RawgPlatform[] | null;
  genres: RawgGenre[] | null;
}
interface RawgListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: RawgGame[];
}

/** Normalise verbose RAWG platform names to the short forms used on the site. */
const PLATFORM_MAP: Record<string, string> = {
  "PC": "PC", "macOS": "macOS", "Linux": "Linux",
  "PlayStation 5": "PS5", "PlayStation 4": "PS4", "PlayStation 3": "PS3",
  "PlayStation 2": "PS2", "PlayStation": "PS1",
  "Xbox Series S/X": "Xbox Series", "Xbox One": "Xbox One",
  "Xbox 360": "Xbox 360", "Xbox": "Xbox",
  "Nintendo Switch": "Switch", "Nintendo 3DS": "3DS",
  "Nintendo DS": "DS", "Nintendo 64": "N64",
  "SNES": "SNES", "NES": "NES",
  "Game Boy Advance": "GBA", "Game Boy": "Game Boy",
  "GameCube": "GameCube", "Wii": "Wii", "Wii U": "Wii U",
  "iOS": "iOS", "Android": "Android",
};
const normPlatform = (n: string) => PLATFORM_MAP[n] ?? n;

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/games/config
 * Returns whether the RAWG API key is configured.
 */
router.get("/games/config", (_req, res): void => {
  res.json({ configured: rawgConfigured });
});

/**
 * GET /api/games/search
 *
 * Query params:
 *   q           — search term (omit to browse by popularity)
 *   page        — 1-based page (default 1)
 *   page_size   — results per page (default 20, max 40)
 *   platform_id — RAWG platform ID filter (optional)
 *   genre_id    — RAWG genre ID filter (optional)
 *
 * 503 when RAWG_API_KEY is not configured.
 */
router.get("/games/search", async (req, res): Promise<void> => {
  if (!rawgConfigured) {
    res.status(503).json({
      error: "RAWG_API_KEY not configured. Add it to Replit Secrets to enable game search.",
      configured: false,
    });
    return;
  }

  const q          = typeof req.query.q          === "string" ? req.query.q.trim()          : "";
  const page       = Math.max(1, parseInt(String(req.query.page      ?? "1"))  || 1);
  const pageSize   = Math.min(40, Math.max(1, parseInt(String(req.query.page_size ?? "20")) || 20));
  const platformId = typeof req.query.platform_id === "string" ? req.query.platform_id : null;
  const genreId    = typeof req.query.genre_id    === "string" ? req.query.genre_id    : null;

  const cacheKey = `${q}|${page}|${pageSize}|${platformId ?? ""}|${genreId ?? ""}`;
  const cached = getCached(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const params = new URLSearchParams({
      key: RAWG_KEY,
      page: String(page),
      page_size: String(pageSize),
    });
    if (q)          params.set("search", q);
    if (platformId) params.set("platforms", platformId);
    if (genreId)    params.set("genres", genreId);
    // Default browse (no query): show by number of RAWG users who own/want the game
    if (!q)         params.set("ordering", "-added");

    const rawgRes = await fetch(`https://api.rawg.io/api/games?${params}`, {
      headers: { "User-Agent": "DiscWatchHQ/1.0 (+https://discwatchhq.com)" },
      signal: AbortSignal.timeout(8_000),
    });

    if (!rawgRes.ok) {
      logger.warn({ status: rawgRes.status }, "RAWG API error");
      res.status(502).json({ error: `RAWG returned HTTP ${rawgRes.status}` });
      return;
    }

    const rawg = (await rawgRes.json()) as RawgListResponse;

    const results = rawg.results.map(game => ({
      id:              game.id,
      slug:            game.slug,
      name:            game.name,
      released:        game.released ?? null,
      backgroundImage: game.background_image ?? null,
      metacritic:      game.metacritic ?? null,
      rating:          game.rating,
      ratingsCount:    game.ratings_count,
      platforms:       (game.platforms ?? []).map(p => normPlatform(p.platform.name)),
      genres:          (game.genres    ?? []).map(g => g.name),
      retailerSearchUrls: {
        ebay:     buildEbaySearchUrl(game.name),
        amazon:   buildAmazonSearchUrl(game.name),
        gamestop: buildGameStopSearchUrl(game.name),
        bestbuy:  buildBestBuySearchUrl(game.name),
      },
    }));

    const response = {
      count:      rawg.count,
      next:       rawg.next     ? page + 1 : null,
      previous:   rawg.previous ? page - 1 : null,
      results,
      configured: true,
    };

    setCached(cacheKey, response);
    res.json(response);
  } catch (err) {
    logger.error({ err }, "RAWG fetch error");
    res.status(502).json({ error: "Failed to reach RAWG API" });
  }
});

export default router;
