/**
 * /api/games — Dual-source game catalog: TheGamesDB + RAWG Video Games Database
 *
 * Both sources are queried in parallel on every search. Results are merged
 * and deduplicated by normalised title (RAWG preferred when both match —
 * it carries a Metacritic score; TGDB fills gaps RAWG doesn't cover).
 *
 * Keys (both optional — sources that lack a key silently contribute 0 results):
 *   TGDB_API_KEY   — TheGamesDB v1 API key (https://thegamesdb.net)
 *   RAWG_API_KEY   — RAWG API key (https://rawg.io/apidocs)
 *
 * Attribution:
 *   TheGamesDB — community-run open database (courtesy credit shown)
 *   RAWG       — required by their free-tier terms (credit shown)
 *
 * Cache: in-memory true-LRU, 500-entry cap, 10-minute TTL.
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

// ── Key detection (read once at startup) ─────────────────────────────────────

const TGDB_KEY  = (process.env.TGDB_API_KEY  ?? "").trim();
const RAWG_KEY  = (process.env.RAWG_API_KEY  ?? "").trim();
const tgdbReady = !!TGDB_KEY;
const rawgReady = !!RAWG_KEY;

const TGDB_BASE  = "https://api.thegamesdb.net/v1";
const RAWG_BASE  = "https://api.rawg.io/api";
const PAGE_SIZE  = 20;
const CACHE_TTL  = 10 * 60 * 1_000;

// ── Unified result type (shared by API + frontend) ────────────────────────────

export interface CatalogGame {
  /** Namespaced: "rawg:123" or "tgdb:456" */
  id:        string;
  source:    "rawg" | "tgdb";
  title:     string;
  releaseDate:   string | null;
  platforms:     string[];
  coverImageUrl: string | null;
  /** Metacritic score 0-100; RAWG only, null for TGDB entries. */
  metacritic:    number | null;
  /** ESRB content rating ("E", "E10+", "T", "M", "AO", "RP"); TGDB only. */
  esrbRating:    string | null;
  retailerSearchUrls: {
    ebay:     string;
    amazon:   string;
    gamestop: string;
    bestbuy:  string;
  };
}

// ── In-memory true-LRU cache ──────────────────────────────────────────────────

interface CacheEntry { data: unknown; cachedAt: number; accessedAt: number }
const cache = new Map<string, CacheEntry>();

function getCached(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL) { cache.delete(key); return null; }
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

// ── Platform name normalisation ───────────────────────────────────────────────

const PLATFORM_MAP: Record<string, string> = {
  // PlayStation (TGDB verbose names + RAWG short names)
  "Sony Playstation 5": "PS5", "PlayStation 5": "PS5",
  "Sony Playstation 4": "PS4", "PlayStation 4": "PS4",
  "Sony Playstation 3": "PS3", "PlayStation 3": "PS3",
  "Sony Playstation 2": "PS2", "PlayStation 2": "PS2",
  "Sony Playstation":   "PS1", "PlayStation":   "PS1",
  "PlayStation Portable": "PSP", "PSP": "PSP",
  "PlayStation Vita":   "PS Vita",
  // Xbox
  "Microsoft Xbox Series X": "Xbox Series", "Xbox Series S/X": "Xbox Series",
  "Microsoft Xbox One":      "Xbox One",    "Xbox One":        "Xbox One",
  "Microsoft Xbox 360":      "Xbox 360",    "Xbox 360":        "Xbox 360",
  "Microsoft Xbox":          "Xbox",        "Xbox":            "Xbox",
  // Nintendo
  "Nintendo Switch": "Switch", "Nintendo Switch 2": "Switch 2",
  "Nintendo 3DS": "3DS", "Nintendo DS": "DS", "Nintendo 64": "N64",
  "Super Nintendo (SNES)": "SNES", "Nintendo Entertainment System (NES)": "NES",
  "Nintendo GameCube": "GameCube", "Nintendo Wii": "Wii", "Nintendo Wii U": "Wii U",
  "GameBoy Advance": "GBA", "GameBoy Color": "GBC", "GameBoy": "Game Boy",
  // PC / Other
  "PC": "PC", "Mac OS": "macOS", "macOS": "macOS", "Linux": "Linux",
  "iOS": "iOS", "Android": "Android",
  // Sega
  "Sega Genesis": "Genesis", "Sega Saturn": "Saturn",
  "Sega Dreamcast": "Dreamcast", "Sega Game Gear": "Game Gear",
};

const normPlatform = (n: string): string => PLATFORM_MAP[n] ?? n;

// ── Deduplication ─────────────────────────────────────────────────────────────

/**
 * Collapse a title to a stable key for dedup comparison.
 * Strips punctuation, collapses whitespace, lowercases.
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Merge results from both sources, deduplicating by normalised title.
 *
 * Priority: RAWG wins over TGDB for the primary result (Metacritic, image)
 * when both match the same title. Platforms from both are union-merged.
 * When only TGDB covers a title (multiple per-platform entries), they are
 * collapsed into one card with combined platforms.
 */
function deduplicateResults(games: CatalogGame[]): CatalogGame[] {
  const seen = new Map<string, CatalogGame>();

  for (const game of games) {
    const key = normalizeTitle(game.title);
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, { ...game, platforms: [...game.platforms] });
      continue;
    }

    // Merge platforms from both entries
    const mergedPlatforms = [...new Set([...existing.platforms, ...game.platforms])];

    if (existing.source === "tgdb" && game.source === "rawg") {
      // Promote RAWG (has Metacritic); keep TGDB's ESRB if RAWG doesn't have it
      seen.set(key, {
        ...game,
        platforms:  mergedPlatforms,
        esrbRating: existing.esrbRating ?? game.esrbRating,
      });
    } else {
      // Same source or RAWG already present — just merge platforms
      existing.platforms = mergedPlatforms;
    }
  }

  return Array.from(seen.values());
}

// ── TGDB fetch ────────────────────────────────────────────────────────────────

interface TgdbBoxartEntry { id: number; type: string; side?: string; filename: string }
interface TgdbBaseUrls    { thumb: string }
interface TgdbGameEntry   { id: number; game_title: string; release_date: string | null; platform: number | null; rating: string | null }
interface TgdbPlatformRow { id: number; name: string }
interface TgdbSearchResp  {
  code: number; status: string;
  data:    { count: number; games: TgdbGameEntry[] };
  include: {
    boxart?:    { base_url: TgdbBaseUrls; data: Record<string, TgdbBoxartEntry[]> };
    platform?:  { data: Record<string, TgdbPlatformRow> };
  };
  pages: { previous: string | null; current: string; next: string | null };
}

function resolveCoverUrl(gameId: number, boxart: TgdbSearchResp["include"]["boxart"]): string | null {
  if (!boxart) return null;
  const entries = boxart.data[String(gameId)];
  if (!entries?.length) return null;
  const front = entries.find(e => e.type === "boxart" && e.side === "front") ?? entries[0];
  return `${boxart.base_url.thumb}${front.filename}`;
}

function resolveTgdbPlatform(platformId: number | null, platformData: TgdbSearchResp["include"]["platform"]): string | null {
  if (platformId === null || !platformData) return null;
  const entry = platformData.data[String(platformId)];
  return entry ? normPlatform(entry.name) : null;
}

async function fetchFromTgdb(q: string, page: number): Promise<{ games: CatalogGame[]; total: number; hasNext: boolean }> {
  if (!tgdbReady) return { games: [], total: 0, hasNext: false };

  const offset = (page - 1) * PAGE_SIZE;
  const params = new URLSearchParams({
    apikey: TGDB_KEY, name: q,
    fields: "overview,rating,platform", include: "boxart,platform",
  });
  if (offset > 0) params.set("offset", String(offset));

  const res = await fetch(`${TGDB_BASE}/Games/ByGameTitle?${params}`, {
    headers: { "User-Agent": "DiscWatchHQ/1.0" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    logger.warn({ status: res.status }, "TGDB API error");
    return { games: [], total: 0, hasNext: false };
  }

  const data = (await res.json()) as TgdbSearchResp;
  if (data.code !== 200 || !data.data?.games) {
    logger.warn({ code: data.code }, "TGDB non-success");
    return { games: [], total: 0, hasNext: false };
  }

  const games: CatalogGame[] = data.data.games.map(g => ({
    id:           `tgdb:${g.id}`,
    source:       "tgdb" as const,
    title:        g.game_title,
    releaseDate:  g.release_date ?? null,
    platforms:    [resolveTgdbPlatform(g.platform ?? null, data.include.platform)].filter(Boolean) as string[],
    coverImageUrl: resolveCoverUrl(g.id, data.include.boxart),
    metacritic:   null,
    esrbRating:   g.rating ?? null,
    retailerSearchUrls: {
      ebay:     buildEbaySearchUrl(g.game_title),
      amazon:   buildAmazonSearchUrl(g.game_title),
      gamestop: buildGameStopSearchUrl(g.game_title),
      bestbuy:  buildBestBuySearchUrl(g.game_title),
    },
  }));

  return { games, total: data.data.count, hasNext: !!data.pages.next };
}

// ── RAWG fetch ────────────────────────────────────────────────────────────────

interface RawgPlatformEntry { platform: { name: string } }
interface RawgGame {
  id: number; name: string; released: string | null;
  background_image: string | null; metacritic: number | null;
  platforms: RawgPlatformEntry[] | null;
}
interface RawgListResp { count: number; next: string | null; previous: string | null; results: RawgGame[] }

async function fetchFromRawg(q: string, page: number): Promise<{ games: CatalogGame[]; total: number; hasNext: boolean }> {
  if (!rawgReady) return { games: [], total: 0, hasNext: false };

  const params = new URLSearchParams({
    key: RAWG_KEY, search: q,
    page: String(page), page_size: String(PAGE_SIZE),
  });

  const res = await fetch(`${RAWG_BASE}/games?${params}`, {
    headers: { "User-Agent": "DiscWatchHQ/1.0" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    logger.warn({ status: res.status }, "RAWG API error");
    return { games: [], total: 0, hasNext: false };
  }

  const data = (await res.json()) as RawgListResp;

  const games: CatalogGame[] = (data.results ?? []).map(g => ({
    id:           `rawg:${g.id}`,
    source:       "rawg" as const,
    title:        g.name,
    releaseDate:  g.released ?? null,
    platforms:    (g.platforms ?? []).map(p => normPlatform(p.platform.name)),
    coverImageUrl: g.background_image ?? null,
    metacritic:   g.metacritic ?? null,
    esrbRating:   null,
    retailerSearchUrls: {
      ebay:     buildEbaySearchUrl(g.name),
      amazon:   buildAmazonSearchUrl(g.name),
      gamestop: buildGameStopSearchUrl(g.name),
      bestbuy:  buildBestBuySearchUrl(g.name),
    },
  }));

  return { games, total: data.count, hasNext: !!data.next };
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/games/config
 * Reports which data sources are active.
 */
router.get("/games/config", (_req, res): void => {
  res.json({
    rawg:          rawgReady,
    tgdb:          tgdbReady,
    anyConfigured: rawgReady || tgdbReady,
  });
});

/**
 * GET /api/games/search
 *
 * Query params:
 *   q    — title search term (required; returns empty if blank)
 *   page — 1-based page (default 1)
 *
 * Both sources are queried in parallel. Results are merged and deduped
 * by normalised title. Each source silently no-ops if unconfigured.
 */
router.get("/games/search", async (req, res): Promise<void> => {
  const q    = typeof req.query.q    === "string" ? req.query.q.trim() : "";
  const page = Math.max(1, parseInt(String(req.query.page ?? "1")) || 1);

  const sources = { rawg: rawgReady, tgdb: tgdbReady };

  if (!q) {
    res.json({ count: 0, next: null, previous: null, results: [], sources, empty: true });
    return;
  }

  const cacheKey = `dual|${q.toLowerCase()}|${page}`;
  const cached = getCached(cacheKey);
  if (cached) { res.json(cached); return; }

  // Fire both sources concurrently; failures from either return empty arrays
  const [tgdbResult, rawgResult] = await Promise.allSettled([
    fetchFromTgdb(q, page),
    fetchFromRawg(q, page),
  ]);

  const tgdb = tgdbResult.status === "fulfilled" ? tgdbResult.value : { games: [], total: 0, hasNext: false };
  const rawg = rawgResult.status === "fulfilled" ? rawgResult.value : { games: [], total: 0, hasNext: false };

  if (tgdbResult.status === "rejected") logger.error({ err: tgdbResult.reason }, "TGDB fetch failed");
  if (rawgResult.status === "rejected") logger.error({ err: rawgResult.reason }, "RAWG fetch failed");

  // RAWG first so it wins title-collisions in the dedup (gets promoted over TGDB)
  const merged = deduplicateResults([...rawg.games, ...tgdb.games]);

  const response = {
    // Approximate total: sum of both source counts (pre-dedup, best estimate)
    count:    rawg.total + tgdb.total,
    next:     (rawg.hasNext || tgdb.hasNext) ? page + 1 : null,
    previous: page > 1 ? page - 1 : null,
    results:  merged,
    sources,
    empty:    false,
  };

  setCached(cacheKey, response);
  res.json(response);
});

export default router;
