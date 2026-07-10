/**
 * catalogService — shared logic for the unified game catalog (RAWG + TGDB).
 *
 * Provides:
 *   fetchFromRawg()  — fetch a search page from RAWG → InsertCatalogGame[]
 *   fetchFromTgdb()  — fetch a search page from TGDB → InsertCatalogGame[]
 *   upsertCatalogGames() — persist rows to catalog_games with ON CONFLICT DO UPDATE
 *
 * Imported by both the /api/games/search route (live search) and the
 * catalog backfill scheduler (proactive indexing).
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
  "Sony Playstation 5": "PS5",   "PlayStation 5": "PS5",
  "Sony Playstation 4": "PS4",   "PlayStation 4": "PS4",
  "Sony Playstation 3": "PS3",   "PlayStation 3": "PS3",
  "Sony Playstation 2": "PS2",   "PlayStation 2": "PS2",
  "Sony Playstation":   "PS1",   "PlayStation":   "PS1",
  "PlayStation Portable": "PSP", "PSP": "PSP",
  "PlayStation Vita":   "PS Vita",
  // Xbox
  "Microsoft Xbox Series X": "Xbox Series", "Xbox Series S/X": "Xbox Series",
  "Microsoft Xbox One":      "Xbox One",    "Xbox One":        "Xbox One",
  "Microsoft Xbox 360":      "Xbox 360",    "Xbox 360":        "Xbox 360",
  "Microsoft Xbox":          "Xbox",        "Xbox":            "Xbox",
  // Nintendo
  "Nintendo Switch":    "Switch",  "Nintendo Switch 2": "Switch 2",
  "Nintendo 3DS":       "3DS",     "Nintendo DS":        "DS",
  "Nintendo 64":        "N64",
  "Super Nintendo (SNES)": "SNES", "Nintendo Entertainment System (NES)": "NES",
  "Nintendo GameCube":  "GameCube","Nintendo Wii":    "Wii",
  "Nintendo Wii U":     "Wii U",
  "GameBoy Advance":    "GBA",     "GameBoy Color":  "GBC",
  "GameBoy":            "Game Boy",
  // PC / Other
  "PC": "PC", "Mac OS": "macOS", "macOS": "macOS", "Linux": "Linux",
  "iOS": "iOS", "Android": "Android",
  // Sega
  "Sega Genesis": "Genesis", "Sega Saturn": "Saturn",
  "Sega Dreamcast": "Dreamcast", "Sega Game Gear": "Game Gear",
  "Sega CD": "Sega CD", "Sega 32X": "32X",
};

export const normPlatform = (n: string): string => PLATFORM_MAP[n] ?? n;

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
interface RawgGame {
  id: number; name: string; released: string | null;
  background_image: string | null; metacritic: number | null;
  platforms: RawgPlatformEntry[] | null;
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
    const rows: InsertCatalogGame[] = (data.results ?? []).map(g => ({
      source:        "rawg",
      sourceId:      `rawg:${g.id}`,
      title:         g.name,
      platforms:     (g.platforms ?? []).map(p => normPlatform(p.platform.name)),
      publisherName: null,
      coverImageUrl: g.background_image ?? null,
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

// ── TGDB ──────────────────────────────────────────────────────────────────────

interface TgdbBoxartEntry  { id: number; type: string; side?: string; filename: string }
interface TgdbBaseUrls     { thumb: string }
interface TgdbGameEntry    { id: number; game_title: string; release_date: string | null; platform: number | null; rating: string | null }
interface TgdbPlatformRow  { id: number; name: string }
interface TgdbSearchResp   {
  code: number; status: string;
  data:    { count: number; games: TgdbGameEntry[] };
  include: {
    boxart?:   { base_url: TgdbBaseUrls; data: Record<string, TgdbBoxartEntry[]> };
    platform?: { data: Record<string, TgdbPlatformRow> };
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

export async function fetchFromTgdb(
  q: string,
  page = 1,
): Promise<{ rows: InsertCatalogGame[]; total: number; hasNext: boolean }> {
  if (!tgdbReady) return { rows: [], total: 0, hasNext: false };

  try {
    const offset = (page - 1) * 20;
    const params = new URLSearchParams({
      apikey: TGDB_KEY, name: q,
      fields: "overview,rating,platform", include: "boxart,platform",
    });
    if (offset > 0) params.set("offset", String(offset));

    const res = await fetch(`https://api.thegamesdb.net/v1/Games/ByGameTitle?${params}`, {
      headers: { "User-Agent": "DiscWatchHQ/1.0" },
      signal:  AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "TGDB API error");
      return { rows: [], total: 0, hasNext: false };
    }
    const data = (await res.json()) as TgdbSearchResp;
    if (data.code !== 200 || !data.data?.games) {
      logger.warn({ code: data.code }, "TGDB non-success");
      return { rows: [], total: 0, hasNext: false };
    }

    const rows: InsertCatalogGame[] = data.data.games.map(g => ({
      source:        "tgdb",
      sourceId:      `tgdb:${g.id}`,
      title:         g.game_title,
      platforms:     [resolveTgdbPlatform(g.platform ?? null, data.include.platform)].filter(Boolean) as string[],
      publisherName: null,
      coverImageUrl: resolveCoverUrl(g.id, data.include.boxart),
      releaseYear:   parseYear(g.release_date),
      metacritic:    null,
      esrbRating:    g.rating ?? null,
      retailerUrls:  retailerUrls(g.game_title),
    }));

    return { rows, total: data.data.count, hasNext: !!data.pages.next };
  } catch (err) {
    logger.error({ err }, "TGDB fetch error");
    return { rows: [], total: 0, hasNext: false };
  }
}

// ── Upsert ────────────────────────────────────────────────────────────────────

/**
 * Upsert catalog game rows into the database.
 * On conflict (same source_id), update mutable fields only.
 * Returns the number of rows processed.
 */
export async function upsertCatalogGames(rows: InsertCatalogGame[]): Promise<number> {
  if (rows.length === 0) return 0;
  // Deduplicate within the batch by sourceId (last writer wins).
  const seen = new Map<string, InsertCatalogGame>();
  for (const row of rows) seen.set(row.sourceId, row);
  const unique = Array.from(seen.values());

  await db.insert(catalogGamesTable)
    .values(unique)
    .onConflictDoUpdate({
      target: catalogGamesTable.sourceId,
      set: {
        title:        sql`EXCLUDED.title`,
        platforms:    sql`EXCLUDED.platforms`,
        coverImageUrl: sql`EXCLUDED.cover_image_url`,
        metacritic:   sql`EXCLUDED.metacritic`,
        esrbRating:   sql`EXCLUDED.esrb_rating`,
        retailerUrls: sql`EXCLUDED.retailer_urls`,
        updatedAt:    sql`NOW()`,
      },
    });

  return unique.length;
}
