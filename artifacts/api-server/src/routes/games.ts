/**
 * /api/games — DB-backed game catalog search (RAWG + TheGamesDB).
 *
 * Results are persisted to the catalog_games table, making the site's own
 * PostgreSQL database the primary search index. Searches query the DB first;
 * on a cold cache (< 10 DB results for page 1) both live sources are fetched,
 * upserted, and the DB is re-queried before responding.
 *
 * Routes:
 *   GET /api/games/config        — which API keys are active
 *   GET /api/games/search        — title search with optional platform filter
 *   GET /api/games/tgdb/:id      — fetch + upsert single TGDB game by ID
 *
 * Attribution:
 *   TheGamesDB — community-run open database (courtesy credit required)
 *   RAWG       — required by their free-tier API terms
 */

import { Router } from "express";
import { and, asc, ilike, sql, type SQL } from "drizzle-orm";
import { db, catalogGamesTable, gameDetailCacheTable, type CatalogGameRow } from "@workspace/db";
import {
  rawgReady, tgdbReady, RAWG_KEY,
  fetchFromRawg, fetchFromTgdb, fetchTgdbById, upsertCatalogGames,
  fetchPopularFromRawg, fetchNewReleasesFromRawg, fetchUpcomingFromRawg,
  normPlatform,
} from "../lib/catalogService";
import { checkAndReserveTgdbCall } from "../lib/tgdbBudget";
import {
  buildEbaySearchUrl, buildAmazonSearchUrl,
  buildGameStopSearchUrl, buildBestBuySearchUrl,
  buildEbayStrategyGuideUrl, buildAmazonStrategyGuideUrl,
  buildPlatformSearchUrls,
} from "../lib/affiliateConfig";
import { logger } from "../lib/logger";
import { fetchLivePricing } from "../lib/catalogLivePricing";

const router = Router();
const PAGE_SIZE = 20;

// ── Detail response cache ─────────────────────────────────────────────────────
// L1: in-process Map — zero-latency for repeated opens within the same session/instance.
// L2: game_detail_cache Postgres table — survives restarts, shared across autoscale instances.
// On a cache miss both layers are missed; RAWG is called, result written to L2 then L1.
const _detailCache    = new Map<string, { data: unknown; expiresAt: number }>();
const DETAIL_CACHE_TTL_MS    = 30 * 60 * 1_000;            // L1: 30 minutes
const DETAIL_DB_CACHE_TTL_MS = 60 * 24 * 60 * 60 * 1_000; // L2: 60 days

// ── Response formatter ────────────────────────────────────────────────────────

/**
 * Shape the API response to match the frontend's CatalogGame interface.
 * Includes publisherName so the card can display it when available.
 */
function formatRow(row: CatalogGameRow) {
  return {
    id:            row.sourceId,
    source:        row.source as "rawg" | "tgdb",
    title:         row.title,
    // Prefer the full YYYY-MM-DD date string; fall back to year-only string for older rows.
  releaseDate:   row.releaseDate ?? (row.releaseYear ? String(row.releaseYear) : null),
    platforms:     row.platforms,
    genres:        row.genres        ?? [],
    coverImageUrl: row.coverImageUrl ?? null,
    metacritic:    row.metacritic    ?? null,
    esrbRating:    row.esrbRating    ?? null,
    publisherName: row.publisherName ?? null,
    // Always compute fresh from current affiliate config — never read stored
    // DB values, which may have been written before an affiliate ID was set.
    retailerSearchUrls: {
      ebay:     buildEbaySearchUrl(row.title),
      amazon:   buildAmazonSearchUrl(row.title),
      gamestop: buildGameStopSearchUrl(row.title),
      bestbuy:  buildBestBuySearchUrl(row.title),
    },
    // Per-platform-qualified variants (e.g. "Stardew Valley Switch") — used
    // when the visitor explicitly selects one of the platform tags on a card,
    // so the outbound search is precise instead of generic. Falls back to the
    // unqualified urls above by default.
    retailerSearchUrlsByPlatform: buildPlatformSearchUrls(row.title, row.platforms),
    guideSearchUrls: {
      ebay:   buildEbayStrategyGuideUrl(row.title),
      amazon: buildAmazonStrategyGuideUrl(row.title),
    },
  };
}

/** Valid sort options for the catalog search endpoint. */
type SortOption = "best_rated" | "newest" | "oldest" | "alpha";

/**
 * Deduplicate search results by exact title (case-insensitive).
 *
 * Why this is needed: TGDB creates one database row per platform for the same
 * game (e.g. "Elden Ring" on PS4, PS5, PC, Xbox One, Xbox Series each get their
 * own tgdb:NNNNN row). RAWG consolidates all platforms into a single entry.
 * This function keeps the single best entry per title: rawg beats tgdb as the
 * source, then higher Metacritic breaks ties between same-source duplicates.
 *
 * Applied to every search response so no caller sees duplicates regardless of
 * which source originally populated the DB row.
 */
function deduplicateByTitle(
  results: ReturnType<typeof formatRow>[],
): ReturnType<typeof formatRow>[] {
  const best = new Map<string, ReturnType<typeof formatRow>>();
  for (const r of results) {
    const key = r.title.toLowerCase().trim();
    const current = best.get(key);
    if (!current) {
      best.set(key, r);
    } else {
      // rawg always wins over tgdb; within the same source prefer higher Metacritic
      const newWins =
        (r.source === "rawg" && current.source !== "rawg") ||
        (r.source === current.source && (r.metacritic ?? -1) > (current.metacritic ?? -1));
      if (newWins) best.set(key, r);
    }
  }
  return Array.from(best.values());
}

// ── DB query ──────────────────────────────────────────────────────────────────

async function queryDb(
  q: string,
  page: number,
  platformFilter: string,
  genreFilter: string   = "",
  yearFrom: number | null = null,
  yearTo:   number | null = null,
  sort: SortOption        = "best_rated",
): Promise<{ results: ReturnType<typeof formatRow>[]; total: number }> {
  const conditions: SQL[] = [];

  // Title search — optional in browse mode (empty q + active filters)
  if (q.trim()) {
    conditions.push(ilike(catalogGamesTable.title, `%${q}%`));
  }
  if (platformFilter) {
    conditions.push(sql`${catalogGamesTable.platforms} && ARRAY[${platformFilter}]::text[]`);
  }
  if (genreFilter) {
    conditions.push(sql`${catalogGamesTable.genres} && ARRAY[${genreFilter}]::text[]`);
  }
  if (yearFrom !== null) {
    conditions.push(sql`${catalogGamesTable.releaseYear} >= ${yearFrom}`);
  }
  if (yearTo !== null) {
    conditions.push(sql`${catalogGamesTable.releaseYear} <= ${yearTo}`);
  }

  const where  = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (page - 1) * PAGE_SIZE;

  // Build sort expressions.
  // In search mode: relevance tier first, user sort as tiebreaker.
  // In browse mode: user sort is primary.
  const sortExprs = [];

  if (q.trim()) {
    sortExprs.push(sql`CASE
      WHEN LOWER(${catalogGamesTable.title}) = LOWER(${q})           THEN 0
      WHEN LOWER(${catalogGamesTable.title}) LIKE LOWER(${q}) || '%' THEN 1
      ELSE 2
    END`);
  }

  switch (sort) {
    case "newest":
      sortExprs.push(sql`${catalogGamesTable.releaseYear} DESC NULLS LAST`);
      sortExprs.push(asc(catalogGamesTable.title));
      break;
    case "oldest":
      sortExprs.push(sql`${catalogGamesTable.releaseYear} ASC NULLS LAST`);
      sortExprs.push(asc(catalogGamesTable.title));
      break;
    case "alpha":
      sortExprs.push(asc(catalogGamesTable.title));
      break;
    default: // "best_rated"
      sortExprs.push(sql`${catalogGamesTable.metacritic} DESC NULLS LAST`);
      sortExprs.push(asc(catalogGamesTable.title));
  }

  const [rows, [{ total }]] = await Promise.all([
    db.select()
      .from(catalogGamesTable)
      .where(where)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .orderBy(...(sortExprs as any[]))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` })
      .from(catalogGamesTable)
      .where(where),
  ]);

  return { results: rows.map(formatRow), total };
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/games/config
 * Reports which catalog API keys are configured.
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
 *   q        — title search string (optional in browse mode)
 *   page     — 1-based page (default 1)
 *   platform — exact platform name (e.g. "PS5", "Switch")
 *   genre    — exact genre name (e.g. "Action", "RPG")
 *   yearFrom — minimum release year (inclusive)
 *   yearTo   — maximum release year (inclusive)
 *   sort     — "best_rated" | "newest" | "oldest" | "alpha" (default: best_rated)
 *
 * Browse mode: q may be empty when at least one other filter is set.
 * Cold search: only fires RAWG + TGDB when q is non-empty and < 10 DB results on page 1.
 */
router.get("/games/search", async (req, res): Promise<void> => {
  const q              = typeof req.query.q        === "string" ? req.query.q.trim()        : "";
  const page           = Math.max(1, parseInt(String(req.query.page     ?? "1")) || 1);
  const platformFilter = typeof req.query.platform === "string" ? req.query.platform.trim() : "";
  const genreFilter    = typeof req.query.genre    === "string" ? req.query.genre.trim()    : "";
  const yearFrom       = req.query.yearFrom ? (parseInt(String(req.query.yearFrom), 10) || null) : null;
  const yearTo         = req.query.yearTo   ? (parseInt(String(req.query.yearTo),   10) || null) : null;
  const rawSort        = String(req.query.sort ?? "");
  const sort           = (["best_rated", "newest", "oldest", "alpha"].includes(rawSort)
    ? rawSort : "best_rated") as SortOption;
  const sources        = { rawg: rawgReady, tgdb: tgdbReady };

  // Require at least q or one active filter — pure no-op otherwise
  const hasFilters = !!(platformFilter || genreFilter || yearFrom !== null || yearTo !== null);
  if (!q && !hasFilters) {
    res.json({ count: 0, next: null, previous: null, results: [], sources, empty: true });
    return;
  }

  // ── 1. Query local DB ──
  let { results, total } = await queryDb(q, page, platformFilter, genreFilter, yearFrom, yearTo, sort);

  // ── 2. Cold cache on page 1 (search mode only): fetch live + upsert + re-query ──
  // Skip cold cache in browse mode (empty q) — we're scanning the whole table already.
  if (q && page === 1 && total < 10 && (rawgReady || tgdbReady)) {
    // ── TGDB permanent-cache check ──────────────────────────────────────────
    // TGDB has a 1 000 req/month cap. Once a query's results are in the DB
    // (source = 'tgdb'), we never call TGDB for that term again — the DB IS
    // the permanent cache. We only spend a TGDB call on a true cache miss
    // (zero TGDB rows match this search term) AND if the daily budget allows.
    let callTgdb = false;
    if (tgdbReady) {
      const [{ tgdbHits }] = await db
        .select({ tgdbHits: sql<number>`count(*)::int` })
        .from(catalogGamesTable)
        .where(sql`source = 'tgdb' AND title ILIKE ${"%" + q + "%"}`);

      if (tgdbHits === 0) {
        callTgdb = await checkAndReserveTgdbCall("search");
        if (callTgdb) {
          logger.debug({ q }, "TGDB live fetch: cache miss + budget slot reserved");
        } else {
          logger.info({ q }, "TGDB live fetch skipped: daily budget exhausted — falling back to RAWG + DB");
        }
      } else {
        logger.debug({ q, tgdbHits }, "TGDB live fetch skipped: already permanently cached in DB");
      }
    }

    // RAWG first — it's curated and returns clean deduplicated entries.
    // TGDB is community-edited and mixes in junk (fake platform entries,
    // test rows). Call TGDB only as a genuine fallback when RAWG has zero
    // results, not as a parallel enrichment source.
    let rawgRows: typeof catalogGamesTable.$inferInsert[] = [];
    try {
      const rawgRes = await fetchFromRawg(q, 1);
      rawgRows = rawgRes.rows;
    } catch (err) {
      logger.error({ err }, "RAWG live fetch failed");
    }

    const tgdbRows: typeof catalogGamesTable.$inferInsert[] = [];
    if (callTgdb && rawgRows.length === 0) {
      try {
        const tgdbRes = await fetchFromTgdb(q, 1);
        tgdbRows.push(...tgdbRes.rows);
        logger.debug({ q, tgdbCount: tgdbRes.rows.length }, "TGDB fallback used (RAWG had 0 results)");
      } catch (err) {
        logger.error({ err }, "TGDB live fetch failed");
      }
    } else if (callTgdb && rawgRows.length > 0) {
      logger.debug({ q, rawgCount: rawgRows.length }, "TGDB fallback skipped — RAWG returned results");
    }

    const liveRows = [...rawgRows, ...tgdbRows];

    if (liveRows.length > 0) {
      try {
        await upsertCatalogGames(liveRows);
        // Re-query — now the DB has the freshly upserted rows
        ({ results, total } = await queryDb(q, page, platformFilter, genreFilter, yearFrom, yearTo, sort));
      } catch (err) {
        logger.error({ err }, "catalog upsert failed");
        // Graceful fallback: serve live rows directly rather than an empty response
        if (results.length === 0) {
          results = liveRows.slice(0, PAGE_SIZE).map(r => ({
            id:            r.sourceId,
            source:        r.source as "rawg" | "tgdb",
            title:         r.title,
            releaseDate:   r.releaseDate ?? (r.releaseYear ? String(r.releaseYear) : null),
            platforms:     r.platforms   ?? [],
            genres:        r.genres      ?? [],
            coverImageUrl: r.coverImageUrl ?? null,
            metacritic:    r.metacritic   ?? null,
            esrbRating:    r.esrbRating   ?? null,
            publisherName: r.publisherName ?? null,
            retailerSearchUrls: {
              ebay:     buildEbaySearchUrl(r.title),
              amazon:   buildAmazonSearchUrl(r.title),
              gamestop: buildGameStopSearchUrl(r.title),
              bestbuy:  buildBestBuySearchUrl(r.title),
            },
            retailerSearchUrlsByPlatform: buildPlatformSearchUrls(r.title, r.platforms ?? []),
            guideSearchUrls: {
              ebay:   buildEbayStrategyGuideUrl(r.title),
              amazon: buildAmazonStrategyGuideUrl(r.title),
            },
          }));
          total = results.length;
        }
      }
    }
  }

  // Deduplicate by title before responding — groups RAWG + TGDB variants of the same game,
  // keeping the better entry (rawg > tgdb; higher Metacritic as tiebreaker within source).
  results = deduplicateByTitle(results);

  res.json({
    count:    total,
    next:     total > page * PAGE_SIZE ? page + 1 : null,
    previous: page > 1 ? page - 1 : null,
    results,
    sources,
    empty:    false,
  });
});

/**
 * GET /api/games/popular
 *
 * Returns the highest-rated games in the catalog by Metacritic score.
 * Primary source: DB (catalog_games WHERE metacritic IS NOT NULL, ordered DESC).
 * Cold cache (< PAGE_SIZE results): fetches from RAWG ordering=-metacritic,
 * upserts to catalog_games, re-queries.
 *
 * Honest labelling: "industry-wide by Metacritic score from RAWG" — NOT
 * "trending on DiscWatchHQ" (no on-site usage data exists yet to support that).
 */
router.get("/games/popular", async (req, res): Promise<void> => {
  const page  = Math.max(1, parseInt(String(req.query.page ?? "1")) || 1);
  // ?limit caps at 24 for the homepage preview; full paginated view uses PAGE_SIZE
  const limit = page === 1
    ? Math.min(24, Math.max(1, parseInt(String(req.query.limit ?? String(PAGE_SIZE))) || PAGE_SIZE))
    : PAGE_SIZE;
  const offset = (page - 1) * PAGE_SIZE;

  const metacriticFilter = sql`${catalogGamesTable.metacritic} IS NOT NULL`;

  const [dbRows, [{ total }]] = await Promise.all([
    db.select().from(catalogGamesTable)
      .where(metacriticFilter)
      .orderBy(sql`${catalogGamesTable.metacritic} DESC NULLS LAST`)
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` })
      .from(catalogGamesTable)
      .where(metacriticFilter),
  ]);

  // Cold cache: only try RAWG on page 1 when the DB has very few rated games.
  if (page === 1 && total < PAGE_SIZE && rawgReady) {
    const { rows } = await fetchPopularFromRawg(1);
    if (rows.length > 0) {
      try { await upsertCatalogGames(rows); } catch (err) { logger.error({ err }, "popular upsert failed"); }
      const [fresh, [{ freshTotal }]] = await Promise.all([
        db.select().from(catalogGamesTable)
          .where(metacriticFilter)
          .orderBy(sql`${catalogGamesTable.metacritic} DESC NULLS LAST`)
          .limit(limit)
          .offset(0),
        db.select({ freshTotal: sql<number>`count(*)::int` })
          .from(catalogGamesTable)
          .where(metacriticFilter),
      ]);
      res.json({
        results:  fresh.map(formatRow),
        count:    freshTotal,
        next:     freshTotal > PAGE_SIZE ? 2 : null,
        previous: null,
      });
      return;
    }
  }

  // When ?limit overrides the page size (preview-only mode), suppress `next`
  // so callers don't follow into a paginated continuation with wrong offsets.
  // Full pagination is handled by the view-all pages, which never pass ?limit.
  const effectiveNext = limit === PAGE_SIZE && total > page * PAGE_SIZE ? page + 1 : null;
  res.json({
    results:  dbRows.map(formatRow),
    count:    total,
    next:     effectiveNext,
    previous: page > 1 ? page - 1 : null,
  });
});

/**
 * GET /api/games/new-releases
 *
 * Returns games released in the past 12 months (date-precise, not year-approximate).
 * Filter: release_date >= 12-months-ago AND release_date <= today (YYYY-MM-DD text compare).
 * Order: release_date DESC (newest actual release first — NOT updatedAt, which would surface
 * unreleased games whose RAWG page was recently edited).
 * Cold cache: on page 1 with < PAGE_SIZE matching rows, fetches from RAWG with
 * dates=oneYearAgo,today&ordering=-released, upserts with full release_date, re-queries.
 */
router.get("/games/new-releases", async (req, res): Promise<void> => {
  const page  = Math.max(1, parseInt(String(req.query.page ?? "1")) || 1);
  const limit = page === 1
    ? Math.min(24, Math.max(1, parseInt(String(req.query.limit ?? String(PAGE_SIZE))) || PAGE_SIZE))
    : PAGE_SIZE;
  const offset     = (page - 1) * PAGE_SIZE;
  // Dynamic date boundaries — computed fresh on every request, never hardcoded.
  const today      = new Date().toISOString().slice(0, 10);                          // e.g. "2026-07-10"
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10); // e.g. "2025-07-10"

  // Use release_date (full YYYY-MM-DD) for exact boundary enforcement.
  // Excludes future games (Fable 2027-02-xx) even if their RAWG page was recently updated.
  const recentFilter = sql`
    ${catalogGamesTable.releaseDate} IS NOT NULL
    AND ${catalogGamesTable.releaseDate} >= ${oneYearAgo}
    AND ${catalogGamesTable.releaseDate} <= ${today}
  `;

  const [dbRows, [{ total }]] = await Promise.all([
    db.select().from(catalogGamesTable)
      .where(recentFilter)
      .orderBy(sql`${catalogGamesTable.releaseDate} DESC NULLS LAST`)
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` })
      .from(catalogGamesTable)
      .where(recentFilter),
  ]);

  // Cold cache: seed from RAWG on page 1 when few precise-dated rows exist.
  if (page === 1 && total < PAGE_SIZE && rawgReady) {
    const { rows } = await fetchNewReleasesFromRawg(1);
    if (rows.length > 0) {
      try { await upsertCatalogGames(rows); } catch (err) { logger.error({ err }, "new-releases upsert failed"); }
      const [fresh, [{ freshTotal }]] = await Promise.all([
        db.select().from(catalogGamesTable)
          .where(recentFilter)
          .orderBy(sql`${catalogGamesTable.releaseDate} DESC NULLS LAST`)
          .limit(limit)
          .offset(0),
        db.select({ freshTotal: sql<number>`count(*)::int` })
          .from(catalogGamesTable)
          .where(recentFilter),
      ]);
      res.json({
        results:  fresh.map(formatRow),
        count:    freshTotal,
        next:     freshTotal > PAGE_SIZE ? 2 : null,
        previous: null,
      });
      return;
    }
  }

  const effectiveNextNew = limit === PAGE_SIZE && total > page * PAGE_SIZE ? page + 1 : null;
  res.json({
    results:  dbRows.map(formatRow),
    count:    total,
    next:     effectiveNextNew,
    previous: page > 1 ? page - 1 : null,
  });
});

/**
 * GET /api/games/upcoming
 *
 * Returns games with confirmed release dates strictly in the future (after today).
 * Filter: release_date > today — date-precise, never shows already-released games
 * regardless of which calendar year they belong to.
 * Order: release_date ASC (soonest upcoming first).
 * Cold cache: on page 1 when DB has < 5 future-dated rows, fetches from RAWG with
 * dates=today,2027-12-31&ordering=released, upserts with full release_date, re-queries.
 */
router.get("/games/upcoming", async (req, res): Promise<void> => {
  const page  = Math.max(1, parseInt(String(req.query.page ?? "1")) || 1);
  const limit = page === 1
    ? Math.min(24, Math.max(1, parseInt(String(req.query.limit ?? String(PAGE_SIZE))) || PAGE_SIZE))
    : PAGE_SIZE;
  const offset = (page - 1) * PAGE_SIZE;
  const today  = new Date().toISOString().slice(0, 10); // e.g. "2026-07-10"

  // Strict future: release_date > today. Excludes all games already released,
  // including those that released earlier in the current calendar year.
  // Also requires at least one known platform — RAWG sometimes returns
  // placeholder/unannounced entries with a future date but no platform data
  // yet (no confirmed hardware to actually buy this on), which read as
  // broken/empty cards in the "Upcoming" section, so they're filtered out.
  const upcomingFilter = sql`
    ${catalogGamesTable.releaseDate} IS NOT NULL
    AND ${catalogGamesTable.releaseDate} > ${today}
    AND cardinality(${catalogGamesTable.platforms}) > 0
  `;

  const [dbRows, [{ total }]] = await Promise.all([
    db.select().from(catalogGamesTable)
      .where(upcomingFilter)
      .orderBy(sql`${catalogGamesTable.releaseDate} ASC NULLS LAST`)
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` })
      .from(catalogGamesTable)
      .where(upcomingFilter),
  ]);

  // Cold cache: seed from RAWG when DB has very few future-dated rows on page 1.
  if (page === 1 && total < 5 && rawgReady) {
    const { rows } = await fetchUpcomingFromRawg(1);
    if (rows.length > 0) {
      try { await upsertCatalogGames(rows); } catch (err) { logger.error({ err }, "upcoming upsert failed"); }
      const [fresh, [{ freshTotal }]] = await Promise.all([
        db.select().from(catalogGamesTable)
          .where(upcomingFilter)
          .orderBy(sql`${catalogGamesTable.releaseDate} ASC NULLS LAST`)
          .limit(limit)
          .offset(0),
        db.select({ freshTotal: sql<number>`count(*)::int` })
          .from(catalogGamesTable)
          .where(upcomingFilter),
      ]);
      res.json({
        results:  fresh.map(formatRow),
        count:    freshTotal,
        next:     limit === PAGE_SIZE && freshTotal > PAGE_SIZE ? 2 : null,
        previous: null,
      });
      return;
    }
  }

  res.json({
    results:  dbRows.map(formatRow),
    count:    total,
    next:     limit === PAGE_SIZE && total > page * PAGE_SIZE ? page + 1 : null,
    previous: page > 1 ? page - 1 : null,
  });
});

/**
 * GET /api/games/tgdb/:id
 *
 * Fetch a single TGDB game by its integer ID, upsert to catalog, return
 * the enriched row. ID may be supplied as a bare integer ("53") or with
 * the sourceId prefix ("tgdb:53") for convenience.
 *
 * Designed for on-demand enrichment: clicking into a game that was indexed
 * from a search (which may only have bare title data) triggers a full
 * ByGameID fetch for the publisher name, ESRB rating, boxart, etc.
 */
router.get("/games/tgdb/:id", async (req, res): Promise<void> => {
  if (!tgdbReady) {
    res.status(503).json({ error: "TGDB_API_KEY not configured" });
    return;
  }

  const raw    = req.params.id.replace(/^tgdb:/, "");
  const gameId = parseInt(raw, 10);

  // Reject non-numeric strings like "123abc" — parseInt("123abc") === 123 but
  // the original string was not a clean integer.
  if (isNaN(gameId) || gameId <= 0 || String(gameId) !== raw) {
    res.status(400).json({ error: "Invalid TGDB game ID — expected a positive integer" });
    return;
  }

  const rows = await fetchTgdbById([gameId]);

  if (rows.length === 0) {
    res.status(404).json({ error: `TGDB game ${gameId} not found` });
    return;
  }

  try {
    await upsertCatalogGames(rows);
  } catch (err) {
    logger.error({ err, gameId }, "Failed to upsert TGDB game detail");
    // Non-fatal — still return the fetched data
  }

  // Re-read from DB so the response reflects the stored (canonical) row
  const stored = await db.select()
    .from(catalogGamesTable)
    .where(sql`${catalogGamesTable.sourceId} = ${"tgdb:" + gameId}`)
    .limit(1);

  if (stored.length > 0) {
    res.json(formatRow(stored[0]));
  } else {
    // DB read after upsert failed — return the live-fetched row directly
    const r = rows[0];
    res.json({
      id:            r.sourceId,
      source:        "tgdb" as const,
      title:         r.title,
      releaseDate:   r.releaseDate ?? (r.releaseYear ? String(r.releaseYear) : null),
      platforms:     r.platforms ?? [],
      coverImageUrl: r.coverImageUrl ?? null,
      metacritic:    null,
      esrbRating:    r.esrbRating  ?? null,
      publisherName: r.publisherName ?? null,
      retailerSearchUrls: {
        ebay:     buildEbaySearchUrl(r.title),
        amazon:   buildAmazonSearchUrl(r.title),
        gamestop: buildGameStopSearchUrl(r.title),
        bestbuy:  buildBestBuySearchUrl(r.title),
      },
      retailerSearchUrlsByPlatform: buildPlatformSearchUrls(r.title, r.platforms ?? []),
      guideSearchUrls: {
        ebay:   buildEbayStrategyGuideUrl(r.title),
        amazon: buildAmazonStrategyGuideUrl(r.title),
      },
    });
  }
});

// ── Landing covers ────────────────────────────────────────────────────────────

interface LandingCover { title: string; coverImageUrl: string }
let _landingCoversCache: { covers: LandingCover[]; fetchedAt: number } | null = null;
const LANDING_CACHE_TTL_MS = 60 * 60_000; // 1 hour

/**
 * High-profile / visually rich titles to explicitly search for on RAWG.
 * Unreleased/unindexed titles (GTA VI, Wolverine, etc.) return empty results
 * and are silently skipped — the grid fills with other popular titles instead.
 * Only RAWG background_image URLs are used; no press-kit or external images.
 */
const CURATED_COVER_SEARCHES = [
  // 2026/2027 anticipated (many not yet in RAWG — will be skipped gracefully)
  "Grand Theft Auto VI",
  "Marvel Wolverine",
  "Kingdom Hearts IV",
  "Blood of Dawnwalker",
  "South of Midnight",
  "Fable 2024",
  "Avowed",
  // Confirmed in RAWG with great key art
  "Grand Theft Auto V",
  "Assassin Creed Shadows",
  "Final Fantasy VII Rebirth",
  "Final Fantasy XVI",
  "Elden Ring",
  "Cyberpunk 2077",
  "God of War Ragnarok",
  "Hogwarts Legacy",
  "Baldur Gate 3",
  "Marvel Spider-Man 2",
  "Black Myth Wukong",
  "Indiana Jones Great Circle",
  "Metaphor ReFantazio",
  "Stellar Blade",
  "Dragon Dogma 2",
  "Like a Dragon Infinite Wealth",
  "Tekken 8",
  "Street Fighter 6",
  "Diablo IV",
  "Starfield",
  "Armored Core VI",
  "Hellblade II",
  "Death Stranding 2",
  "Alan Wake 2",
  "Lies of P",
  "Remnant II",
  "Atomic Heart",
  "Dead Space 2023",
  "Resident Evil 4 Remake",
  "Returnal",
  "Demon Souls",
  "Forspoken",
  "Deathloop",
];

/**
 * GET /api/games/landing-covers
 *
 * Returns up to 80 game cover images for the landing-page tile wallpaper.
 *
 * Strategy (DB-first to minimise RAWG calls):
 *   1. Load all catalog_games with cover images, ordered by metacritic DESC.
 *   2. If total < 40 AND RAWG is configured: search RAWG for each curated title
 *      in parallel (max 1 request per title, take first match with a cover image).
 *      Upsert found rows to catalog_games so subsequent requests are DB-only.
 *   3. Cache the assembled cover list in-process for 1 hour (LANDING_CACHE_TTL_MS).
 *      This means RAWG curated searches run at most once per server restart.
 *
 * Attribution: all returned coverImageUrl values come from RAWG's
 * background_image field, same informational-reference context as RAWG itself.
 */
router.get("/games/landing-covers", async (req, res): Promise<void> => {
  // ── Serve from cache if fresh ──────────────────────────────────────────────
  const now = Date.now();
  if (_landingCoversCache && now - _landingCoversCache.fetchedAt < LANDING_CACHE_TTL_MS) {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json({ covers: _landingCoversCache.covers });
    return;
  }

  // ── Phase 1: load from DB ──────────────────────────────────────────────────
  const dbRows = await db.select()
    .from(catalogGamesTable)
    .where(sql`${catalogGamesTable.coverImageUrl} IS NOT NULL`)
    .orderBy(
      sql`${catalogGamesTable.metacritic} DESC NULLS LAST`,
      sql`${catalogGamesTable.updatedAt} DESC`,
    )
    .limit(80);

  const seenIds  = new Set(dbRows.map(r => r.sourceId));
  const seenUrls = new Set(dbRows.map(r => r.coverImageUrl));

  let coverRows = dbRows.map(r => ({ title: r.title, coverImageUrl: r.coverImageUrl! }));

  // ── Phase 2: curated RAWG searches (only if DB is sparse) ─────────────────
  if (coverRows.length < 40 && rawgReady) {
    const searchResults = await Promise.allSettled(
      CURATED_COVER_SEARCHES.map(q =>
        fetch(
          `https://api.rawg.io/api/games?key=${RAWG_KEY}&search=${encodeURIComponent(q)}&page_size=3&search_precise=true`,
          { headers: { "User-Agent": "DiscWatchHQ/1.0" }, signal: AbortSignal.timeout(8_000) },
        ).then(r => r.ok ? r.json() as Promise<{ results: Array<{ id: number; name: string; background_image: string | null; released: string | null; metacritic: number | null; platforms: Array<{ platform: { name: string } }> | null }> }> : null),
      ),
    );

    const newRows: typeof catalogGamesTable.$inferInsert[] = [];

    for (const result of searchResults) {
      if (result.status !== "fulfilled" || !result.value?.results?.length) continue;
      const games: Array<{
        id: number; name: string; background_image: string | null;
        released: string | null; metacritic: number | null;
        platforms: Array<{ platform: { name: string } }> | null;
      }> = result.value.results;

      for (const g of games) {
        if (!g.background_image) continue;
        const sourceId = `rawg:${g.id}`;
        if (seenIds.has(sourceId) || seenUrls.has(g.background_image)) continue;
        seenIds.add(sourceId);
        seenUrls.add(g.background_image);
        coverRows.push({ title: g.name, coverImageUrl: g.background_image });
        newRows.push({
          source: "rawg", sourceId, title: g.name,
          platforms: (g.platforms ?? []).map(p => normPlatform(p.platform.name)),
          publisherName: null, coverImageUrl: g.background_image,
          releaseYear: g.released ? parseInt(g.released.slice(0, 4), 10) || null : null,
          metacritic: g.metacritic ?? null, esrbRating: null,
          retailerUrls: {
            ebay:     buildEbaySearchUrl(g.name),
            amazon:   buildAmazonSearchUrl(g.name),
            gamestop: buildGameStopSearchUrl(g.name),
            bestbuy:  buildBestBuySearchUrl(g.name),
          },
        });
        break; // one result per search query
      }
    }

    // Persist to DB in the background — non-blocking
    if (newRows.length > 0) {
      upsertCatalogGames(newRows).catch(err =>
        logger.error({ err }, "landing covers curated upsert failed"),
      );
    }
  }

  // ── Deterministic shuffle (Fisher-Yates with title-hash seed) ─────────────
  // Consistent ordering per server instance avoids visual jumps on re-fetch
  // while still mixing curated and popular titles across all columns.
  const arr = coverRows.slice(0, 80);
  for (let i = arr.length - 1; i > 0; i--) {
    // Cheap hash: xor of char codes to seed position
    const seed = arr[i].title.split("").reduce((h, c) => (h ^ c.charCodeAt(0)) * 31, i);
    const j = Math.abs(seed) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  _landingCoversCache = { covers: arr, fetchedAt: now };

  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({ covers: arr });
});

/**
 * GET /api/games/live-pricing/:sourceId?title=Game+Title
 *
 * Returns live price + direct listing URL for eBay and/or Best Buy for the
 * given catalog game, fetched from the respective retailer APIs.
 *
 * Results are served from a 4-hour in-process cache — the first open after
 * a cache miss triggers the real API calls; subsequent opens within 4 h are
 * instantaneous. The modal fires this endpoint in parallel with /detail so
 * prices populate without blocking the initial modal render.
 *
 * When a retailer's credentials are not configured its key is absent from
 * the response (frontend falls back to the generic search URL).
 * When configured but no match found the key is present with value null.
 *
 * Response shape:
 *   {
 *     ebay?:    { price: number; url: string; cachedAt: number } | null,
 *     bestbuy?: { price: number; url: string; cachedAt: number } | null,
 *   }
 */
router.get("/games/live-pricing/:sourceId", async (req, res): Promise<void> => {
  const sourceId = decodeURIComponent(req.params.sourceId);
  const title    = String(req.query.title ?? "").trim();

  if (!title) {
    res.json({});
    return;
  }

  try {
    const result = await fetchLivePricing(sourceId, title);
    // No HTTP caching — in-process cache handles deduplication. The client
    // must not cache stale prices across sessions or on CDN edge nodes.
    res.set("Cache-Control", "no-store");
    res.json(result);
  } catch (err) {
    logger.warn({ err, sourceId, title }, "Live pricing request failed");
    res.json({});
  }
});

/**
 * GET /api/games/detail/:sourceId
 *
 * Returns enriched data for a single game, used by the Browse Games modal.
 * For RAWG-sourced games, fetches description and screenshots from the RAWG
 * games/{id} and games/{id}/screenshots endpoints.
 * For TGDB-sourced games, returns the DB row (no screenshot enrichment).
 *
 * RAWG attribution is required by RAWG API ToS — the `attribution` field in
 * the response tells the frontend which credit to display.
 */
router.get("/games/detail/:sourceId", async (req, res): Promise<void> => {
  const sourceId = decodeURIComponent(req.params.sourceId);

  // Serve from in-process cache if fresh (avoids redundant RAWG calls for
  // the same popup being opened multiple times in a session).
  const _cached = _detailCache.get(sourceId);
  if (_cached && _cached.expiresAt > Date.now()) {
    res.json(_cached.data);
    return;
  }

  // Load base row from DB
  const stored = await db.select()
    .from(catalogGamesTable)
    .where(sql`${catalogGamesTable.sourceId} = ${sourceId}`)
    .limit(1);

  const baseRow = stored.length > 0 ? formatRow(stored[0]) : null;

  // ── RAWG-enriched detail ────────────────────────────────────────────────────
  if (sourceId.startsWith("rawg:") && rawgReady) {
    const rawgId = sourceId.replace(/^rawg:/, "");

    // ── L2: DB cache check ────────────────────────────────────────────────────
    // Survives server restarts and is shared across all autoscale instances,
    // unlike the L1 in-process Map above.
    const dbCached = await db
      .select()
      .from(gameDetailCacheTable)
      .where(sql`${gameDetailCacheTable.sourceId} = ${sourceId} AND ${gameDetailCacheTable.expiresAt} > NOW()`)
      .limit(1);

    if (dbCached.length > 0) {
      const { description, screenshots } = dbCached[0];
      const base = baseRow ?? {
        id: sourceId, source: "rawg" as const, title: sourceId,
        releaseDate: null, platforms: [], genres: [], coverImageUrl: null,
        metacritic: null, esrbRating: null, publisherName: null,
        retailerSearchUrls: {
          ebay: buildEbaySearchUrl(sourceId), amazon: buildAmazonSearchUrl(sourceId),
          gamestop: buildGameStopSearchUrl(sourceId), bestbuy: buildBestBuySearchUrl(sourceId),
        },
        retailerSearchUrlsByPlatform: {} as Record<string, { ebay: string; amazon: string; gamestop: string; bestbuy: string }>,
        guideSearchUrls: {
          ebay: buildEbayStrategyGuideUrl(sourceId),
          amazon: buildAmazonStrategyGuideUrl(sourceId),
        },
      };
      const _dbPayload = { ...base, description, screenshots: screenshots ?? [], attribution: "rawg" };
      _detailCache.set(sourceId, { data: _dbPayload, expiresAt: Date.now() + DETAIL_CACHE_TTL_MS });
      logger.debug({ sourceId }, "game_detail_cache L2 hit");
      res.json(_dbPayload);
      return;
    }

    interface RawgDetailResp {
      name: string;
      description_raw: string | null;
      background_image: string | null;
      metacritic: number | null;
      short_screenshots: Array<{ id: number; image: string }> | null;
      esrb_rating: { name: string } | null;
      publishers: Array<{ name: string }> | null;
      platforms: Array<{ platform: { name: string } }> | null;
      released: string | null;
    }
    interface RawgScreenshotResp {
      count: number;
      results: Array<{ id: number; image: string }>;
    }

    // Two parallel requests: game detail (description, metadata) + screenshots.
    // The /movies endpoint was removed — live API diagnostics confirmed it returns
    // empty results for virtually the entire RAWG catalog (clip field is also null
    // for all tested games on the free-tier API).
    const [detailRes, screenshotsRes] = await Promise.allSettled([
      fetch(`https://api.rawg.io/api/games/${rawgId}?key=${RAWG_KEY}`, {
        headers: { "User-Agent": "DiscWatchHQ/1.0" },
        signal:  AbortSignal.timeout(10_000),
      }),
      fetch(`https://api.rawg.io/api/games/${rawgId}/screenshots?key=${RAWG_KEY}&page_size=6`, {
        headers: { "User-Agent": "DiscWatchHQ/1.0" },
        signal:  AbortSignal.timeout(10_000),
      }),
    ]);

    let description: string | null = null;
    let screenshots: string[]      = [];

    if (detailRes.status === "fulfilled" && detailRes.value.ok) {
      const detail = (await detailRes.value.json()) as RawgDetailResp;
      description = detail.description_raw?.trim() ?? null;
    } else if (detailRes.status === "rejected") {
      logger.warn({ err: detailRes.reason, sourceId }, "RAWG game detail fetch failed");
    }

    // Screenshots endpoint returns actual screenshots (not in the game detail response)
    if (screenshotsRes.status === "fulfilled" && screenshotsRes.value.ok) {
      const ss = (await screenshotsRes.value.json()) as RawgScreenshotResp;
      screenshots = (ss.results ?? []).slice(0, 6).map(s => s.image).filter(Boolean);
    }

    const base = baseRow ?? { id: sourceId, source: "rawg" as const, title: sourceId,
      releaseDate: null, platforms: [], genres: [], coverImageUrl: null,
      metacritic: null, esrbRating: null, publisherName: null,
      retailerSearchUrls: {
        ebay: buildEbaySearchUrl(sourceId), amazon: buildAmazonSearchUrl(sourceId),
        gamestop: buildGameStopSearchUrl(sourceId), bestbuy: buildBestBuySearchUrl(sourceId),
      },
      retailerSearchUrlsByPlatform: {} as Record<string, { ebay: string; amazon: string; gamestop: string; bestbuy: string }>,
      guideSearchUrls: {
        ebay:   buildEbayStrategyGuideUrl(sourceId),
        amazon: buildAmazonStrategyGuideUrl(sourceId),
      },
    };

    const _payload = { ...base, description, screenshots, attribution: "rawg" };

    // ── Write to L2 DB cache (fire-and-forget) ────────────────────────────────
    // Don't await — the response is already ready; we don't want to block the
    // client on a DB write. Errors are logged but do not fail the request.
    const _expiresAt = new Date(Date.now() + DETAIL_DB_CACHE_TTL_MS);
    db.insert(gameDetailCacheTable)
      .values({ sourceId, description, screenshots, expiresAt: _expiresAt })
      .onConflictDoUpdate({
        target: gameDetailCacheTable.sourceId,
        set: {
          description: sql`EXCLUDED.description`,
          screenshots: sql`EXCLUDED.screenshots`,
          fetchedAt:   sql`NOW()`,
          expiresAt:   sql`EXCLUDED.expires_at`,
        },
      })
      .catch(err => logger.warn({ err, sourceId }, "game_detail_cache L2 write failed"));

    _detailCache.set(sourceId, { data: _payload, expiresAt: Date.now() + DETAIL_CACHE_TTL_MS });
    res.json(_payload);
    return;
  }

  // ── TGDB / fallback — return DB row without enrichment ─────────────────────
  if (!baseRow) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const _tgdbPayload = {
    ...baseRow,
    description: null,
    screenshots: [],
    attribution: baseRow.source,
  };
  // Cache TGDB responses too — the DB row doesn't change between requests
  _detailCache.set(sourceId, { data: _tgdbPayload, expiresAt: Date.now() + DETAIL_CACHE_TTL_MS });
  res.json(_tgdbPayload);
});

export default router;
