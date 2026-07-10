/**
 * catalogService — shared logic for the unified game catalog (RAWG + TGDB).
 *
 * Provides:
 *   fetchFromRawg()    — search RAWG → InsertCatalogGame[]
 *   fetchFromTgdb()    — search TGDB v1.1/Games/ByGameName → InsertCatalogGame[]
 *   fetchTgdbById()    — fetch specific game(s) via v1/Games/ByGameID (batch-safe)
 *   upsertCatalogGames() — persist rows to catalog_games with ON CONFLICT DO UPDATE
 *
 * Imported by both the /api/games/search route (live search) and the
 * catalog backfill scheduler (proactive indexing via RAWG only).
 *
 * TGDB API facts (confirmed from live API + spec.yaml):
 *   - Search endpoint: GET /v1.1/Games/ByGameName?name=…&page=N
 *   - Detail endpoint: GET /v1/Games/ByGameID?id=1,2,3
 *   - Auth: apikey query param on every request
 *   - `fields` param: overview, rating, platform, publishers, genres, developers, etc.
 *   - `include` param: ONLY boxart and platform (genres/publishers/developers are IDs in fields)
 *   - Publisher names require separate GET /v1/Publishers (4 567 entries; cached once)
 *   - Monthly allowance: 1 000 free requests; allowance_refresh_timer shows seconds to reset
 *   - include.platform wraps data as { data: { "id": { id, name, alias } } }
 *   - game.platform is a single integer ID (not an array)
 */

import { sql } from "drizzle-orm";
import { db, catalogGamesTable, type InsertCatalogGame } from "@workspace/db";
import {
  buildEbaySearchUrl,
  buildAmazonSearchUrl,
  buildGameStopSearchUrl,
  buildBestBuySearchUrl,
} from "./affiliateConfig";
import { logger } from "./logger";

// ── Key detection ─────────────────────────────────────────────────────────────

export const TGDB_KEY  = (process.env.TGDB_API_KEY  ?? "").trim();
export const RAWG_KEY  = (process.env.RAWG_API_KEY  ?? "").trim();
export const tgdbReady = !!TGDB_KEY;
export const rawgReady = !!RAWG_KEY;

// ── Platform normalisation ────────────────────────────────────────────────────

const PLATFORM_MAP: Record<string, string> = {
  // PlayStation
  "Sony Playstation 5":       "PS5",
  "PlayStation 5":            "PS5",
  "Sony Playstation 4":       "PS4",
  "PlayStation 4":            "PS4",
  "Sony Playstation 3":       "PS3",
  "PlayStation 3":            "PS3",
  "Sony Playstation 2":       "PS2",
  "PlayStation 2":            "PS2",
  "Sony Playstation":         "PS1",
  "PlayStation":              "PS1",
  "PlayStation Portable":     "PSP",
  "PSP":                      "PSP",
  "PlayStation Vita":         "PS Vita",
  // Xbox
  "Microsoft Xbox Series X":  "Xbox Series",
  "Xbox Series S/X":          "Xbox Series",
  "Microsoft Xbox One":       "Xbox One",
  "Xbox One":                 "Xbox One",
  "Microsoft Xbox 360":       "Xbox 360",
  "Xbox 360":                 "Xbox 360",
  "Microsoft Xbox":           "Xbox",
  "Xbox":                     "Xbox",
  // Nintendo
  "Nintendo Switch":          "Switch",
  "Nintendo Switch 2":        "Switch 2",
  "Nintendo 3DS":             "3DS",
  "Nintendo DS":              "DS",
  "Nintendo 64":              "N64",
  "Super Nintendo (SNES)":    "SNES",
  "Nintendo Entertainment System (NES)": "NES",
  "Nintendo GameCube":        "GameCube",
  "Nintendo Wii":             "Wii",
  "Nintendo Wii U":           "Wii U",
  "GameBoy Advance":          "GBA",
  "Game Boy Advance":         "GBA",
  "GameBoy Color":            "GBC",
  "Game Boy Color":           "GBC",
  "GameBoy":                  "Game Boy",
  "Game Boy":                 "Game Boy",
  // PC / Other
  "PC":                       "PC",
  "Mac OS":                   "macOS",
  "macOS":                    "macOS",
  "Linux":                    "Linux",
  "iOS":                      "iOS",
  "Android":                  "Android",
  // Sega
  "Sega Genesis":             "Genesis",
  "Sega Mega Drive":          "Genesis",
  "Sega Saturn":              "Saturn",
  "Sega Dreamcast":           "Dreamcast",
  "Sega Game Gear":           "Game Gear",
  "Sega CD":                  "Sega CD",
  "Sega 32X":                 "32X",
  "Sega Master System":       "Master System",
  // Misc
  "Atari 2600":               "Atari 2600",
  "Atari 5200":               "Atari 5200",
  "Atari 7800":               "Atari 7800",
  "Neo Geo":                  "Neo Geo",
  "TurboGrafx-16":            "TG-16",
  "TG-16":                    "TG-16",
};

export const normPlatform = (n: string): string => PLATFORM_MAP[n] ?? n;

// ── Shared helpers ────────────────────────────────────────────────────────────

function retailerUrls(title: string) {
  return {
    ebay:     buildEbaySearchUrl(title),
    amazon:   buildAmazonSearchUrl(title),
    gamestop: buildGameStopSearchUrl(title),
    bestbuy:  buildBestBuySearchUrl(title),
  };
}

function parseYear(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const y = parseInt(dateStr.slice(0, 4), 10);
  return isNaN(y) ? null : y;
}

// ── RAWG ──────────────────────────────────────────────────────────────────────

interface RawgPlatformEntry { platform: { name: string } }
interface RawgGenre       { id: number; name: string }
interface RawgGame {
  id: number; name: string; released: string | null;
  background_image: string | null; metacritic: number | null;
  platforms: RawgPlatformEntry[] | null;
  genres:    RawgGenre[]         | null;
}
interface RawgListResp { count: number; next: string | null; results: RawgGame[] }

export async function fetchFromRawg(
  q: string,
  page = 1,
): Promise<{ rows: InsertCatalogGame[]; total: number; hasNext: boolean }> {
  if (!rawgReady) return { rows: [], total: 0, hasNext: false };

  try {
    const params = new URLSearchParams({
      key: RAWG_KEY, search: q,
      page: String(page), page_size: "20",
      // Exclude DLC, add-ons, editions, and collection/series duplicates so
      // a search for "Elden Ring" returns the base game, not 6 variants.
      exclude_additions:   "true",
      exclude_parents:     "true",
      exclude_game_series: "true",
      exclude_collection:  "true",
    });
    const res = await fetch(`https://api.rawg.io/api/games?${params}`, {
      headers: { "User-Agent": "DiscWatchHQ/1.0" },
      signal:  AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "RAWG API error");
      return { rows: [], total: 0, hasNext: false };
    }
    const data = (await res.json()) as RawgListResp;
    const rows: InsertCatalogGame[] = (data.results ?? [])
      .filter(g => isPlausibleRawgGame(g.name))
      .map(g => ({
        source:        "rawg",
        sourceId:      `rawg:${g.id}`,
        title:         g.name,
        platforms:     (g.platforms ?? []).map(p => normPlatform(p.platform.name)),
        genres:        (g.genres    ?? []).map(gn => gn.name),
        publisherName: null,
        coverImageUrl: g.background_image ?? null,
        releaseDate:   g.released ?? null,
        releaseYear:   parseYear(g.released),
        metacritic:    g.metacritic ?? null,
        esrbRating:    null,
        retailerUrls:  retailerUrls(g.name),
      }));
    return { rows, total: data.count, hasNext: !!data.next };
  } catch (err) {
    logger.error({ err }, "RAWG fetch error");
    return { rows: [], total: 0, hasNext: false };
  }
}

/**
 * Fetch top-rated games from RAWG using ordering=-metacritic.
 * Used by GET /api/games/popular to pre-populate the Browse Games page.
 * Attribution: "Popularity data from RAWG" (required by RAWG free-tier terms).
 */
export async function fetchPopularFromRawg(
  page = 1,
): Promise<{ rows: InsertCatalogGame[]; total: number; hasNext: boolean }> {
  if (!rawgReady) return { rows: [], total: 0, hasNext: false };
  try {
    const params = new URLSearchParams({
      key: RAWG_KEY, ordering: "-metacritic",
      page_size: "20", page: String(page),
      exclude_additions:   "true",
      exclude_game_series: "true",
      exclude_collection:  "true",
    });
    const res = await fetch(`https://api.rawg.io/api/games?${params}`, {
      headers: { "User-Agent": "DiscWatchHQ/1.0" },
      signal:  AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "RAWG popular fetch error");
      return { rows: [], total: 0, hasNext: false };
    }
    const data = (await res.json()) as RawgListResp;
    const rows: InsertCatalogGame[] = (data.results ?? []).map(g => ({
      source: "rawg" as const, sourceId: `rawg:${g.id}`, title: g.name,
      platforms:     (g.platforms ?? []).map(p => normPlatform(p.platform.name)),
      genres:        (g.genres    ?? []).map(gn => gn.name),
      publisherName: null, coverImageUrl: g.background_image ?? null,
      releaseDate:   g.released ?? null,
      releaseYear:   parseYear(g.released), metacritic: g.metacritic ?? null,
      esrbRating:    null, retailerUrls: retailerUrls(g.name),
    }));
    return { rows, total: data.count, hasNext: !!data.next };
  } catch (err) {
    logger.error({ err }, "RAWG popular fetch error");
    return { rows: [], total: 0, hasNext: false };
  }
}

/**
 * Fetch upcoming games (future release dates) from RAWG.
 * Uses dates=today,2029-12-31&ordering=released to return games sorted soonest-first.
 * Only games with confirmed future release dates are returned.
 */
export async function fetchUpcomingFromRawg(page = 1): Promise<{ rows: InsertCatalogGame[]; total: number; hasNext: boolean }> {
  if (!rawgReady) return { rows: [], total: 0, hasNext: false };
  const today  = new Date().toISOString().slice(0, 10); // e.g. "2026-07-10"
  const future = "2029-12-31";
  const url = `https://api.rawg.io/api/games?key=${RAWG_KEY}&dates=${today},${future}&ordering=released&page_size=20&page=${page}&exclude_additions=true`;
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "DiscWatchHQ/1.0" },
      signal:  AbortSignal.timeout(12_000),
    });
    if (!resp.ok) throw new Error(`RAWG upcoming HTTP ${resp.status}`);
    const data = (await resp.json()) as RawgListResp;
    const rows: InsertCatalogGame[] = (data.results ?? []).map(g => ({
      source:        "rawg" as const,
      sourceId:      `rawg:${g.id}`,
      title:         g.name,
      platforms:     (g.platforms ?? []).map(p => normPlatform(p.platform.name)),
      genres:        (g.genres    ?? []).map(gn => gn.name),
      publisherName: null,
      coverImageUrl: g.background_image ?? null,
      releaseDate:   g.released ?? null,
      releaseYear:   parseYear(g.released),
      metacritic:    g.metacritic ?? null,
      esrbRating:    null,
      retailerUrls:  retailerUrls(g.name),
    }));
    return { rows, total: data.count, hasNext: !!data.next };
  } catch (err) {
    logger.error({ err }, "RAWG upcoming fetch error");
    return { rows: [], total: 0, hasNext: false };
  }
}

/**
 * Fetch recently-released games from RAWG (ordering=-released, past 12 months).
 * Used by GET /api/games/new-releases to pre-populate the Browse Games page.
 */
export async function fetchNewReleasesFromRawg(
  page = 1,
): Promise<{ rows: InsertCatalogGame[]; total: number; hasNext: boolean }> {
  if (!rawgReady) return { rows: [], total: 0, hasNext: false };
  try {
    const today      = new Date().toISOString().slice(0, 10);
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
    const params = new URLSearchParams({
      key: RAWG_KEY, ordering: "-released",
      dates: `${oneYearAgo},${today}`,
      page_size: "20", page: String(page),
    });
    const res = await fetch(`https://api.rawg.io/api/games?${params}`, {
      headers: { "User-Agent": "DiscWatchHQ/1.0" },
      signal:  AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "RAWG new-releases fetch error");
      return { rows: [], total: 0, hasNext: false };
    }
    const data = (await res.json()) as RawgListResp;
    const rows: InsertCatalogGame[] = (data.results ?? []).map(g => ({
      source: "rawg" as const, sourceId: `rawg:${g.id}`, title: g.name,
      platforms:     (g.platforms ?? []).map(p => normPlatform(p.platform.name)),
      genres:        (g.genres    ?? []).map(gn => gn.name),
      publisherName: null, coverImageUrl: g.background_image ?? null,
      releaseDate:   g.released ?? null,
      releaseYear:   parseYear(g.released), metacritic: g.metacritic ?? null,
      esrbRating:    null, retailerUrls: retailerUrls(g.name),
    }));
    return { rows, total: data.count, hasNext: !!data.next };
  } catch (err) {
    logger.error({ err }, "RAWG new-releases fetch error");
    return { rows: [], total: 0, hasNext: false };
  }
}

// ── TGDB types ────────────────────────────────────────────────────────────────
//
// Confirmed from live API responses + spec.yaml:
//   - game.platform is a single integer ID (not an array)
//   - include.platform wraps entries under a "data" key (same in v1 and v1.1)
//   - boxart base_url has original / small / thumb / medium / large variants
//   - publishers/genres/developers in fields are arrays of integer IDs

interface TgdbBoxartEntry {
  id: number; type: string; side: string | null;
  filename: string; resolution: string | null;
}

interface TgdbBoxartInclude {
  base_url: {
    original: string; small: string; thumb: string;
    cropped_center_thumb: string; medium: string; large: string;
  };
  data: Record<string, TgdbBoxartEntry[]>;
}

interface TgdbPlatformEntry { id: number; name: string; alias: string }
interface TgdbPlatformInclude { data: Record<string, TgdbPlatformEntry> }

interface TgdbGame {
  id: number;
  game_title: string;
  release_date: string | null;
  platform: number | null;    // single integer platform ID
  region_id?: number;
  country_id?: number;
  overview?: string | null;
  rating?: string | null;     // e.g. "E - Everyone", "T - Teen", "M - Mature", "Not Rated"
  developers?: number[];      // IDs — resolved to names via separate /v1/Developers (not cached here)
  genres?: number[];          // IDs
  publishers?: number[];      // IDs — resolved to names via publisher cache
}

interface TgdbSearchResp {
  code: number;
  status: string;
  data: { count: number; games: TgdbGame[] };
  include: {
    boxart?:    TgdbBoxartInclude;
    platform?:  TgdbPlatformInclude;
  };
  pages: { previous: string | null; current: string; next: string | null };
  remaining_monthly_allowance?: number;
  extra_allowance?: number;
}

interface TgdbPublishersResp {
  code: number;
  data: {
    count: number;
    publishers: Record<string, { id: number; name: string }>;
  };
}

// ── Publisher name cache ──────────────────────────────────────────────────────
//
// Fetches all 4 567 publishers from TGDB in a single request and caches them
// for the lifetime of the process. Costs 1 of the 1 000/month allowance.
// Fetched lazily on first TGDB search to avoid burning an allowance on startup
// if TGDB is never actually queried.

let _publisherCache: Map<number, string> | null = null;
let _publisherCacheFetch: Promise<Map<number, string>> | null = null;

/**
 * Lazily fetch and cache all TGDB publisher names (one request, ~4 500 entries).
 *
 * Singleton promise guard prevents concurrent duplicate fetches.
 * On transient failure the cache is left null so the next call retries —
 * only a permanent success commits to _publisherCache. This way a single
 * network blip doesn't permanently suppress publisher names for the process
 * lifetime.
 */
export async function getPublisherNames(): Promise<Map<number, string>> {
  if (_publisherCache) return _publisherCache;
  if (_publisherCacheFetch) return _publisherCacheFetch;

  _publisherCacheFetch = (async (): Promise<Map<number, string>> => {
    try {
      const params = new URLSearchParams({ apikey: TGDB_KEY });
      const res = await fetch(
        `https://api.thegamesdb.net/v1/Publishers?${params}`,
        { headers: { "User-Agent": "DiscWatchHQ/1.0" }, signal: AbortSignal.timeout(12_000) },
      );
      if (!res.ok) {
        logger.warn({ status: res.status }, "TGDB publishers fetch failed — will retry on next search");
        return new Map(); // do NOT commit to _publisherCache — allow retry
      }
      const data = (await res.json()) as TgdbPublishersResp;
      _publisherCache = new Map(
        Object.values(data.data.publishers).map(p => [p.id, p.name]),
      );
      logger.info({ count: _publisherCache.size }, "TGDB publisher cache loaded");
      return _publisherCache;
    } catch (err) {
      logger.warn({ err }, "TGDB publisher cache error — will retry on next search");
      return new Map(); // transient failure: do NOT commit, allow next call to retry
    } finally {
      _publisherCacheFetch = null; // always clear the in-flight promise
    }
  })();

  return _publisherCacheFetch;
}

// ── TGDB response mapper ──────────────────────────────────────────────────────

function resolveCover(
  gameId: number,
  boxart: TgdbBoxartInclude | undefined,
): string | null {
  if (!boxart) return null;
  const entries = boxart.data[String(gameId)];
  if (!entries?.length) return null;
  // Prefer front boxart, fall back to first available entry
  const front = entries.find(e => e.type === "boxart" && e.side === "front") ?? entries[0];
  // Use medium CDN variant for good quality / file-size tradeoff
  return `${boxart.base_url.medium}${front.filename}`;
}

function resolvePlatformName(
  platformId: number | null,
  platformInclude: TgdbPlatformInclude | undefined,
): string | null {
  if (platformId === null || !platformInclude) return null;
  const entry = platformInclude.data[String(platformId)];
  return entry ? normPlatform(entry.name) : null;
}

// ── RAWG quality filter ───────────────────────────────────────────────────────
//
// RAWG's community DB includes fan-made retro demakes ("Elden Ring PS1",
// "Celeste GBA"), challenge videos ("Elden Ring in 24 Hours"), and other
// noise. Filter these out before upsert so they never reach the DB or the UI.

/** Retro platform labels that fan demakes inject into their RAWG titles. */
const RAWG_RETRO_DEMAKE_RE  = /\s+(PS1|PS2|GB|GBA|GBC|N64|NES|SNES|GameCube|Dreamcast|Saturn|Sega\s+Genesis)(\s|$|\s*\()/i;
/** "in N hours/minutes" challenge-run titles. */
const RAWG_TIME_CHALLENGE_RE = /\s+in\s+\d+\s+(minute|hour|day|second)/i;

/**
 * Returns false for RAWG entries that are clearly fan demakes, challenge
 * submissions, or community test/junk titles.
 *
 * NOTE: deliberately does NOT reject on a bare /\btest\b/ pattern to avoid
 * false positives on real game titles like "Test Drive", "The Turing Test",
 * "Test Mechanic", etc.
 */
function isPlausibleRawgGame(name: string): boolean {
  // Explicit community junk markers (very low false-positive risk)
  if (/zoohair/i.test(name))             return false;
  if (/\bdemake\b/i.test(name))          return false;
  // Reject parenthetical test tokens: "(test)" / "(Test Build)" — yes
  if (/\(\s*test[\s)]/i.test(name))      return false;
  // Reject titles that END with " Test" (fan-build annotation pattern) UNLESS
  // the title starts with "The ", "A ", or "An " — which protects legitimate
  // titles like "The Turing Test" while catching "Elden Ring Test".
  if (/\s+Test\s*$/i.test(name) && !/^(the|a|an)\s/i.test(name)) return false;

  // Fan-demake pattern: title ends in / is followed by a retro-platform label
  // e.g. "Elden Ring PS1", "Celeste GBA", "Half-Life GB (2021)"
  if (RAWG_RETRO_DEMAKE_RE.test(name))   return false;

  // Challenge-run titles: "Elden Ring in 24 Hours", "Minecraft in 60 seconds"
  if (RAWG_TIME_CHALLENGE_RE.test(name)) return false;

  return true;
}

// ── TGDB quality filter ───────────────────────────────────────────────────────
//
// TGDB is community-edited and contains junk/test entries (e.g. "Elden Ring PS1",
// "Elden Ring Test", "Elden Ring PS1 (ZooHair)"). Filter them before upsert so
// they never reach the DB or the UI.

/**
 * Platforms definitively discontinued before 2007 — any TGDB entry on these
 * platforms with a release year >= 2016 is almost certainly a fan port / fake.
 *
 * Deliberately excludes Wii, Xbox 360, PS2, GBA (all had real tail releases
 * after 2010) to avoid false positives on legitimate late-cycle titles.
 */
const TGDB_ANCIENT_PLATFORMS = new Set([
  "PS1",
  "Game Boy", "GBC",          // discontinued 2003
  "N64",                       // discontinued 2002
  "SNES", "NES",
  "Genesis", "Saturn", "Dreamcast", "Game Gear", "Sega CD", "32X",
  "Master System",
  "Atari 2600", "Atari 5200", "Atari 7800",
  "TG-16", "Neo Geo",
]);

/**
 * Returns false for TGDB entries that are clearly junk/test/placeholder.
 * Applied per-row before any DB write so stale data never reaches the UI.
 *
 * NOTE: deliberately does NOT reject on a bare /\btest\b/ to avoid false
 * positives on "Test Drive", "The Turing Test", etc.
 */
function isPlausibleTgdbEntry(g: TgdbGame, platformName: string | null): boolean {
  const title = g.game_title;

  // Explicit community junk tokens (very specific, low false-positive risk)
  if (/zoohair/i.test(title))          return false;
  if (/\bplaceholder\b/i.test(title))  return false;
  if (/\(\s*test[\s)]/i.test(title))   return false; // "(test)" / "(Test Build)"

  // Platform plausibility: ancient platform + clearly-modern release → fake.
  // "Elden Ring PS1" released 2022 on a platform discontinued in 2006 = junk.
  // Threshold is 2016 (conservative) to avoid flagging any real tail releases.
  if (platformName && TGDB_ANCIENT_PLATFORMS.has(platformName) && g.release_date) {
    const year = parseInt(g.release_date.slice(0, 4), 10);
    if (!isNaN(year) && year >= 2016) return false;
  }

  return true;
}

/**
 * Map a TGDB search/detail response to InsertCatalogGame rows.
 * Shared between fetchFromTgdb (search) and fetchTgdbById (detail).
 * Junk/test entries are filtered out before mapping.
 */
function mapTgdbGames(
  data: TgdbSearchResp,
  publisherNames: Map<number, string>,
): InsertCatalogGame[] {
  const rows: InsertCatalogGame[] = [];

  for (const g of data.data.games) {
    const platformName   = resolvePlatformName(g.platform ?? null, data.include.platform);
    if (!isPlausibleTgdbEntry(g, platformName)) continue;

    const publisherName  = g.publishers?.[0] != null
      ? (publisherNames.get(g.publishers[0]) ?? null)
      : null;

    rows.push({
      source:        "tgdb",
      sourceId:      `tgdb:${g.id}`,
      title:         g.game_title,
      platforms:     platformName ? [platformName] : [],
      publisherName,
      coverImageUrl: resolveCover(g.id, data.include.boxart),
      releaseYear:   parseYear(g.release_date),
      metacritic:    null,                    // TGDB has no Metacritic data
      esrbRating:    g.rating ?? null,
      retailerUrls:  retailerUrls(g.game_title),
    });
  }

  return rows;
}

// ── TGDB search ───────────────────────────────────────────────────────────────

/**
 * Search TheGamesDB by title.
 *
 * Uses v1.1/Games/ByGameName (correct endpoint — v1 had broken `mode` handling).
 * Fields include publishers so we can resolve names via the publisher cache.
 * Publisher cache and the game search fire in parallel to minimise latency.
 *
 * Note: include only supports "boxart" and "platform"; publishers/genres/genres
 * are returned as ID arrays via fields and resolved client-side from the cache.
 */
export async function fetchFromTgdb(
  q: string,
  page = 1,
): Promise<{ rows: InsertCatalogGame[]; total: number; hasNext: boolean }> {
  if (!tgdbReady) return { rows: [], total: 0, hasNext: false };

  try {
    const params = new URLSearchParams({
      apikey:  TGDB_KEY,
      name:    q,
      fields:  "overview,rating,platform,publishers,genres",
      include: "boxart,platform",
      page:    String(page),
    });

    // Fetch publisher cache and game results in parallel
    const [publisherNames, res] = await Promise.all([
      getPublisherNames(),
      fetch(`https://api.thegamesdb.net/v1.1/Games/ByGameName?${params}`, {
        headers: { "User-Agent": "DiscWatchHQ/1.0" },
        signal:  AbortSignal.timeout(12_000),
      }),
    ]);

    if (!res.ok) {
      logger.warn({ status: res.status, q }, "TGDB ByGameName API error");
      return { rows: [], total: 0, hasNext: false };
    }

    const data = (await res.json()) as TgdbSearchResp;

    if (data.remaining_monthly_allowance !== undefined) {
      logger.debug(
        { remaining: data.remaining_monthly_allowance, extra: data.extra_allowance },
        "TGDB allowance",
      );
    }

    if (data.code !== 200 || !data.data?.games) {
      logger.warn({ code: data.code, status: data.status }, "TGDB non-success response");
      return { rows: [], total: 0, hasNext: false };
    }

    const rows = mapTgdbGames(data, publisherNames);
    return { rows, total: data.data.count, hasNext: !!data.pages.next };
  } catch (err) {
    logger.error({ err, q }, "TGDB fetchFromTgdb error");
    return { rows: [], total: 0, hasNext: false };
  }
}

// ── TGDB by-ID detail lookup ──────────────────────────────────────────────────

/**
 * Fetch one or more games by their TGDB integer IDs.
 *
 * Uses v1/Games/ByGameID which accepts a comma-separated id list — safe to pass
 * up to ~50 IDs per call without hitting URL length limits. Fetches richer data
 * than the search endpoint (adds `developers` field).
 *
 * Designed for:
 *   - On-demand single-game detail enrichment (publishers, cover, ESRB)
 *   - Batch enrichment after a search upserts bare title-only records
 */
export async function fetchTgdbById(
  ids: number[],
): Promise<InsertCatalogGame[]> {
  if (!tgdbReady || ids.length === 0) return [];

  try {
    const params = new URLSearchParams({
      apikey:  TGDB_KEY,
      id:      ids.join(","),
      fields:  "overview,rating,platform,publishers,genres,developers",
      include: "boxart,platform",
    });

    const [publisherNames, res] = await Promise.all([
      getPublisherNames(),
      fetch(`https://api.thegamesdb.net/v1/Games/ByGameID?${params}`, {
        headers: { "User-Agent": "DiscWatchHQ/1.0" },
        signal:  AbortSignal.timeout(12_000),
      }),
    ]);

    if (!res.ok) {
      logger.warn({ status: res.status, ids }, "TGDB ByGameID API error");
      return [];
    }

    const data = (await res.json()) as TgdbSearchResp;

    if (data.remaining_monthly_allowance !== undefined) {
      logger.debug(
        { remaining: data.remaining_monthly_allowance },
        "TGDB allowance after ByGameID",
      );
    }

    if (data.code !== 200 || !data.data?.games?.length) return [];
    return mapTgdbGames(data, publisherNames);
  } catch (err) {
    logger.error({ err, ids }, "TGDB fetchTgdbById error");
    return [];
  }
}

// ── Upsert ────────────────────────────────────────────────────────────────────

/**
 * Upsert catalog game rows into the database.
 * Deduplicates by sourceId within the batch (last writer wins).
 * ON CONFLICT targets source_id; mutable metadata fields are updated.
 * publisher_name and esrb_rating are included so TGDB re-fetches enrich them.
 */
export async function upsertCatalogGames(rows: InsertCatalogGame[]): Promise<number> {
  if (rows.length === 0) return 0;

  // Deduplicate within the batch by sourceId
  const seen = new Map<string, InsertCatalogGame>();
  for (const row of rows) seen.set(row.sourceId, row);
  const unique = Array.from(seen.values());

  await db.insert(catalogGamesTable)
    .values(unique)
    .onConflictDoUpdate({
      target: catalogGamesTable.sourceId,
      set: {
        title:         sql`EXCLUDED.title`,
        platforms:     sql`EXCLUDED.platforms`,
        genres:        sql`EXCLUDED.genres`,
        publisherName: sql`EXCLUDED.publisher_name`,
        coverImageUrl: sql`EXCLUDED.cover_image_url`,
        metacritic:    sql`EXCLUDED.metacritic`,
        esrbRating:    sql`EXCLUDED.esrb_rating`,
        retailerUrls:  sql`EXCLUDED.retailer_urls`,
        updatedAt:     sql`NOW()`,
      },
    });

  return unique.length;
}
