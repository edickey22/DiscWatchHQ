/**
 * /api/games — TheGamesDB proxy
 *
 * Requires TGDB_API_KEY in Replit Secrets (free at thegamesdb.net/forums/viewtopic.php?t=19274).
 * Uses the Games/ByGameTitle endpoint for title search and the v1 include=boxart,platform
 * option to resolve cover art and platform names in a single request.
 *
 * In-memory true-LRU cache: 500-entry cap, 10-minute TTL per entry.
 *
 * Attribution: TheGamesDB is a community-run open database. A courtesy
 * credit link is shown on every page displaying TGDB data.
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

const TGDB_KEY = (process.env.TGDB_API_KEY ?? "").trim();
export const tgdbConfigured = !!TGDB_KEY;

const TGDB_BASE = "https://api.thegamesdb.net/v1";
const PAGE_SIZE = 20;
const CACHE_TTL_MS = 10 * 60 * 1_000; // 10 minutes

// ── In-memory true-LRU cache ──────────────────────────────────────────────────

interface CacheEntry { data: unknown; cachedAt: number; accessedAt: number }
const cache = new Map<string, CacheEntry>();

function getCached(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) { cache.delete(key); return null; }
  entry.accessedAt = Date.now();
  return entry.data;
}

function setCached(key: string, data: unknown): void {
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

// ── TheGamesDB API types ──────────────────────────────────────────────────────

interface TgdbBoxartEntry {
  id: number;
  type: string;   // "boxart", "screenshot", "fanart", etc.
  side?: string;  // "front" | "back"
  filename: string;
  resolution: string | null;
}

interface TgdbBaseUrls {
  original: string;
  small: string;
  thumb: string;
  cropped_center_thumb: string;
  medium: string;
  large: string;
}

interface TgdbPlatformEntry {
  id: number;
  name: string;
  alias: string;
}

interface TgdbGameEntry {
  id: number;
  game_title: string;
  release_date: string | null;
  platform: number | null;
  overview: string | null;
  rating: string | null; // ESRB: "E", "E10+", "T", "M", "AO", "RP"
}

interface TgdbSearchResponse {
  code: number;
  status: string;
  data: {
    count: number;
    games: TgdbGameEntry[];
  };
  include: {
    boxart?: {
      base_url: TgdbBaseUrls;
      data: Record<string, TgdbBoxartEntry[]>;
    };
    platform?: {
      data: Record<string, TgdbPlatformEntry>;
    };
  };
  pages: {
    previous: string | null;
    current: string;
    next: string | null;
  };
}

// ── Platform name normalisation ───────────────────────────────────────────────

/**
 * Maps TheGamesDB platform names to the short forms used across the site.
 * TGDB names tend to be verbose (e.g. "Sony Playstation 5"); we collapse them
 * to match the boutique-release platform chips ("PS5", "Switch", etc.).
 */
const PLATFORM_MAP: Record<string, string> = {
  // PlayStation
  "Sony Playstation 5": "PS5",
  "Sony Playstation 4": "PS4",
  "Sony Playstation 3": "PS3",
  "Sony Playstation 2": "PS2",
  "Sony Playstation": "PS1",
  "PlayStation 5": "PS5",
  "PlayStation 4": "PS4",
  "PlayStation 3": "PS3",
  "PlayStation 2": "PS2",
  "PlayStation": "PS1",
  "PSP": "PSP",
  "PlayStation Portable": "PSP",
  "PlayStation Vita": "PS Vita",
  // Xbox
  "Microsoft Xbox Series X": "Xbox Series",
  "Microsoft Xbox One": "Xbox One",
  "Microsoft Xbox 360": "Xbox 360",
  "Microsoft Xbox": "Xbox",
  "Xbox Series X": "Xbox Series",
  "Xbox One": "Xbox One",
  "Xbox 360": "Xbox 360",
  "Xbox": "Xbox",
  // Nintendo
  "Nintendo Switch": "Switch",
  "Nintendo 3DS": "3DS",
  "Nintendo DS": "DS",
  "Nintendo 64": "N64",
  "Super Nintendo (SNES)": "SNES",
  "Nintendo Entertainment System (NES)": "NES",
  "Nintendo GameCube": "GameCube",
  "Nintendo Wii": "Wii",
  "Nintendo Wii U": "Wii U",
  "GameBoy Advance": "GBA",
  "GameBoy Color": "GBC",
  "GameBoy": "Game Boy",
  // PC / Other
  "PC": "PC",
  "Mac OS": "macOS",
  "Linux": "Linux",
  "iOS": "iOS",
  "Android": "Android",
  // Sega
  "Sega Genesis": "Genesis",
  "Sega Saturn": "Saturn",
  "Sega Dreamcast": "Dreamcast",
  "Sega Game Gear": "Game Gear",
  "Sega CD": "Sega CD",
  "Sega 32X": "32X",
};

const normPlatform = (name: string): string => PLATFORM_MAP[name] ?? name;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the front-boxart thumb URL for a given game ID from the TGDB include block.
 */
function resolveCoverUrl(
  gameId: number,
  boxart: TgdbSearchResponse["include"]["boxart"],
): string | null {
  if (!boxart) return null;
  const entries = boxart.data[String(gameId)];
  if (!entries || entries.length === 0) return null;
  // Prefer front boxart; fall back to first image of any type
  const front = entries.find(e => e.type === "boxart" && e.side === "front") ?? entries[0];
  return `${boxart.base_url.thumb}${front.filename}`;
}

/**
 * Resolve a numeric TGDB platform ID to a normalised display name.
 */
function resolvePlatform(
  platformId: number | null,
  platformData: TgdbSearchResponse["include"]["platform"],
): string | null {
  if (platformId === null || !platformData) return null;
  const entry = platformData.data[String(platformId)];
  if (!entry) return null;
  return normPlatform(entry.name);
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/games/config
 * Returns whether the TGDB API key is configured.
 */
router.get("/games/config", (_req, res): void => {
  res.json({ configured: tgdbConfigured });
});

/**
 * GET /api/games/search
 *
 * Query params:
 *   q    — title search term (required; returns empty results if omitted)
 *   page — 1-based page number (default 1)
 *
 * 503 when TGDB_API_KEY is not configured.
 */
router.get("/games/search", async (req, res): Promise<void> => {
  if (!tgdbConfigured) {
    res.status(503).json({
      error: "TGDB_API_KEY not configured. Add it to Replit Secrets to enable game search.",
      configured: false,
    });
    return;
  }

  const q    = typeof req.query.q    === "string" ? req.query.q.trim() : "";
  const page = Math.max(1, parseInt(String(req.query.page ?? "1")) || 1);

  // No query — return empty immediately (TGDB ByGameTitle requires a name)
  if (!q) {
    res.json({ count: 0, next: null, previous: null, results: [], configured: true, empty: true });
    return;
  }

  const offset = (page - 1) * PAGE_SIZE;
  // Normalise to lowercase so "Zelda" and "zelda" share a cache entry
  const cacheKey = `tgdb|${q.toLowerCase()}|${page}`;
  const cached = getCached(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    // TGDB ByGameTitle returns exactly PAGE_SIZE (20) results per page.
    // We pass the offset explicitly; the response pages.next being non-null
    // confirms a subsequent page exists, and we return page±1 as synthetic
    // page numbers. Both offset math and frontend totalPages=ceil(count/20)
    // are consistent with this single PAGE_SIZE constant.
    const params = new URLSearchParams({
      apikey:  TGDB_KEY,
      name:    q,
      fields:  "overview,rating,platform",
      include: "boxart,platform",
    });
    if (offset > 0) params.set("offset", String(offset));

    const tgdbRes = await fetch(`${TGDB_BASE}/Games/ByGameTitle?${params}`, {
      headers: { "User-Agent": "DiscWatchHQ/1.0 (+https://discwatchhq.com)" },
      signal:  AbortSignal.timeout(10_000),
    });

    if (!tgdbRes.ok) {
      logger.warn({ status: tgdbRes.status }, "TheGamesDB API error");
      res.status(502).json({ error: `TheGamesDB returned HTTP ${tgdbRes.status}` });
      return;
    }

    const tgdb = (await tgdbRes.json()) as TgdbSearchResponse;

    if (tgdb.code !== 200 || !tgdb.data?.games) {
      logger.warn({ code: tgdb.code, status: tgdb.status }, "TheGamesDB non-success response");
      res.status(502).json({ error: `TheGamesDB error: ${tgdb.status ?? "unknown"}` });
      return;
    }

    const results = tgdb.data.games.map(game => ({
      id:             game.id,
      title:          game.game_title,
      releaseDate:    game.release_date ?? null,
      platform:       resolvePlatform(game.platform ?? null, tgdb.include.platform),
      coverImageUrl:  resolveCoverUrl(game.id, tgdb.include.boxart),
      rating:         game.rating ?? null,
      retailerSearchUrls: {
        ebay:     buildEbaySearchUrl(game.game_title),
        amazon:   buildAmazonSearchUrl(game.game_title),
        gamestop: buildGameStopSearchUrl(game.game_title),
        bestbuy:  buildBestBuySearchUrl(game.game_title),
      },
    }));

    const response = {
      count:      tgdb.data.count,
      next:       tgdb.pages.next     ? page + 1 : null,
      previous:   tgdb.pages.previous ? page - 1 : null,
      results,
      configured: true,
      empty:      false,
    };

    setCached(cacheKey, response);
    res.json(response);
  } catch (err) {
    logger.error({ err }, "TheGamesDB fetch error");
    res.status(502).json({ error: "Failed to reach TheGamesDB API" });
  }
});

export default router;
