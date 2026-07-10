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
import { and, asc, ilike, sql } from "drizzle-orm";
import { db, catalogGamesTable, type CatalogGameRow } from "@workspace/db";
import {
  rawgReady, tgdbReady, RAWG_KEY,
  fetchFromRawg, fetchFromTgdb, fetchTgdbById, upsertCatalogGames,
  fetchPopularFromRawg, fetchNewReleasesFromRawg,
  normPlatform,
} from "../lib/catalogService";
import { checkAndReserveTgdbCall } from "../lib/tgdbBudget";
import {
  buildEbaySearchUrl, buildAmazonSearchUrl,
  buildGameStopSearchUrl, buildBestBuySearchUrl,
} from "../lib/affiliateConfig";
import { logger } from "../lib/logger";

const router = Router();
const PAGE_SIZE = 20;

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
    releaseDate:   row.releaseYear ? String(row.releaseYear) : null,
    platforms:     row.platforms,
    coverImageUrl: row.coverImageUrl  ?? null,
    metacritic:    row.metacritic     ?? null,
    esrbRating:    row.esrbRating     ?? null,
    publisherName: row.publisherName  ?? null,
    // Always compute fresh from current affiliate config — never read stored
    // DB values, which may have been written before an affiliate ID was set.
    retailerSearchUrls: {
      ebay:     buildEbaySearchUrl(row.title),
      amazon:   buildAmazonSearchUrl(row.title),
      gamestop: buildGameStopSearchUrl(row.title),
      bestbuy:  buildBestBuySearchUrl(row.title),
    },
  };
}

// ── DB query ──────────────────────────────────────────────────────────────────

async function queryDb(
  q: string,
  page: number,
  platformFilter: string,
): Promise<{ results: ReturnType<typeof formatRow>[]; total: number }> {
  const likePattern = `%${q}%`;
  const conditions  = [ilike(catalogGamesTable.title, likePattern)];
  if (platformFilter) {
    conditions.push(
      sql`${catalogGamesTable.platforms} && ARRAY[${platformFilter}]::text[]`,
    );
  }
  const where  = and(...conditions);
  const offset = (page - 1) * PAGE_SIZE;

  const [rows, [{ total }]] = await Promise.all([
    db.select()
      .from(catalogGamesTable)
      .where(where)
      .orderBy(
        // Exact title → prefix match → substring; then Metacritic desc; then A–Z
        sql`CASE
          WHEN LOWER(${catalogGamesTable.title}) = LOWER(${q})           THEN 0
          WHEN LOWER(${catalogGamesTable.title}) LIKE LOWER(${q}) || '%' THEN 1
          ELSE 2
        END`,
        sql`${catalogGamesTable.metacritic} DESC NULLS LAST`,
        asc(catalogGamesTable.title),
      )
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
 *   q        — title search string (required; empty → empty result)
 *   page     — 1-based page (default 1)
 *   platform — platform filter string (e.g. "PS5", "Switch")
 *
 * Cold search (page 1, < 10 DB results): fires RAWG + TGDB in parallel,
 * upserts results, then re-queries the DB — one round-trip for the caller.
 */
router.get("/games/search", async (req, res): Promise<void> => {
  const q              = typeof req.query.q        === "string" ? req.query.q.trim()        : "";
  const page           = Math.max(1, parseInt(String(req.query.page     ?? "1")) || 1);
  const platformFilter = typeof req.query.platform === "string" ? req.query.platform.trim() : "";
  const sources        = { rawg: rawgReady, tgdb: tgdbReady };

  if (!q) {
    res.json({ count: 0, next: null, previous: null, results: [], sources, empty: true });
    return;
  }

  // ── 1. Query local DB ──
  let { results, total } = await queryDb(q, page, platformFilter);

  // ── 2. Cold cache on page 1: fetch live + upsert + re-query ──
  if (page === 1 && total < 10 && (rawgReady || tgdbReady)) {
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
        // True cache miss — atomically check budget and reserve a slot.
        // checkAndReserveTgdbCall mutates the in-memory counter synchronously
        // (no intermediate await after the state load) so concurrent requests
        // see the updated count in their microtask and can't both slip through.
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

    const [rawgRes, tgdbRes] = await Promise.allSettled([
      fetchFromRawg(q, 1),
      callTgdb
        ? fetchFromTgdb(q, 1)
        : Promise.resolve({ rows: [] as typeof catalogGamesTable.$inferInsert[], total: 0, hasNext: false }),
    ]);

    if (rawgRes.status === "rejected") logger.error({ err: rawgRes.reason }, "RAWG live fetch failed");
    if (tgdbRes.status === "rejected") logger.error({ err: tgdbRes.reason }, "TGDB live fetch failed");

    const liveRows = [
      ...(rawgRes.status === "fulfilled" ? rawgRes.value.rows : []),
      ...(tgdbRes.status === "fulfilled" ? tgdbRes.value.rows : []),
    ];

    if (liveRows.length > 0) {
      try {
        await upsertCatalogGames(liveRows);
        // Re-query — now the DB has the freshly upserted rows
        ({ results, total } = await queryDb(q, page, platformFilter));
      } catch (err) {
        logger.error({ err }, "catalog upsert failed");
        // Graceful fallback: serve live rows directly rather than an empty response
        if (results.length === 0) {
          results = liveRows.slice(0, PAGE_SIZE).map(r => ({
            id:            r.sourceId,
            source:        r.source as "rawg" | "tgdb",
            title:         r.title,
            releaseDate:   r.releaseYear ? String(r.releaseYear) : null,
            platforms:     r.platforms   ?? [],  // InsertCatalogGame.platforms has a default
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
          }));
          total = results.length;
        }
      }
    }
  }

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
  const page   = Math.max(1, parseInt(String(req.query.page ?? "1")) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const metacriticFilter = sql`${catalogGamesTable.metacritic} IS NOT NULL`;

  const [dbRows, [{ total }]] = await Promise.all([
    db.select().from(catalogGamesTable)
      .where(metacriticFilter)
      .orderBy(sql`${catalogGamesTable.metacritic} DESC NULLS LAST`)
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` })
      .from(catalogGamesTable)
      .where(metacriticFilter),
  ]);

  // Cold cache: only try RAWG on page 1 when the DB has very few rated games.
  // Checking `dbRows.length < PAGE_SIZE` is wrong — it fires on every last page
  // even when the DB is fully warm.  `total < PAGE_SIZE` on page 1 is the only
  // reliable signal that the catalog is genuinely sparse.
  if (page === 1 && total < PAGE_SIZE && rawgReady) {
    const { rows } = await fetchPopularFromRawg(1);
    if (rows.length > 0) {
      try { await upsertCatalogGames(rows); } catch (err) { logger.error({ err }, "popular upsert failed"); }
      const [fresh, [{ freshTotal }]] = await Promise.all([
        db.select().from(catalogGamesTable)
          .where(metacriticFilter)
          .orderBy(sql`${catalogGamesTable.metacritic} DESC NULLS LAST`)
          .limit(PAGE_SIZE)
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

  res.json({
    results:  dbRows.map(formatRow),
    count:    total,
    next:     total > page * PAGE_SIZE ? page + 1 : null,
    previous: page > 1 ? page - 1 : null,
  });
});

/**
 * GET /api/games/new-releases
 *
 * Returns recently-released games (past 12 months by releaseYear).
 * Primary source: DB (release_year >= currentYear-1, ordered by release_year DESC).
 * Cold cache: fetches from RAWG ordering=-released with date range, upserts, re-queries.
 */
router.get("/games/new-releases", async (req, res): Promise<void> => {
  const page       = Math.max(1, parseInt(String(req.query.page ?? "1")) || 1);
  const offset     = (page - 1) * PAGE_SIZE;
  const prevYear   = new Date().getFullYear() - 1;

  const recentFilter = sql`${catalogGamesTable.releaseYear} >= ${prevYear}`;

  const [dbRows, [{ total }]] = await Promise.all([
    db.select().from(catalogGamesTable)
      .where(recentFilter)
      .orderBy(
        sql`${catalogGamesTable.releaseYear} DESC NULLS LAST`,
        sql`${catalogGamesTable.updatedAt} DESC`,
      )
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` })
      .from(catalogGamesTable)
      .where(recentFilter),
  ]);

  // Cold cache: only seed from RAWG on page 1 when the DB has very few recent
  // games.  Checking `dbRows.length < PAGE_SIZE` misfires on every last page.
  if (page === 1 && total < PAGE_SIZE && rawgReady) {
    const { rows } = await fetchNewReleasesFromRawg(1);
    if (rows.length > 0) {
      try { await upsertCatalogGames(rows); } catch (err) { logger.error({ err }, "new-releases upsert failed"); }
      const [fresh, [{ freshTotal }]] = await Promise.all([
        db.select().from(catalogGamesTable)
          .where(recentFilter)
          .orderBy(
            sql`${catalogGamesTable.releaseYear} DESC NULLS LAST`,
            sql`${catalogGamesTable.updatedAt} DESC`,
          )
          .limit(PAGE_SIZE)
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

  res.json({
    results:  dbRows.map(formatRow),
    count:    total,
    next:     total > page * PAGE_SIZE ? page + 1 : null,
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
      releaseDate:   r.releaseYear ? String(r.releaseYear) : null,
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
        ).then(r => r.ok ? r.json() : null),
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
 * GET /api/games/detail/:sourceId
 *
 * Returns enriched data for a single game, used by the Browse Games modal.
 * For RAWG-sourced games, fetches description, screenshots, and trailer from
 * the RAWG games/{id} and games/{id}/movies endpoints.
 * For TGDB-sourced games, returns the DB row (no screenshot/trailer API).
 *
 * RAWG attribution is required by RAWG API ToS — the `attribution` field in
 * the response tells the frontend which credit to display.
 */
router.get("/games/detail/:sourceId", async (req, res): Promise<void> => {
  const sourceId = decodeURIComponent(req.params.sourceId);

  // Load base row from DB
  const stored = await db.select()
    .from(catalogGamesTable)
    .where(sql`${catalogGamesTable.sourceId} = ${sourceId}`)
    .limit(1);

  const baseRow = stored.length > 0 ? formatRow(stored[0]) : null;

  // ── RAWG-enriched detail ────────────────────────────────────────────────────
  if (sourceId.startsWith("rawg:") && rawgReady) {
    const rawgId = sourceId.replace(/^rawg:/, "");

    interface RawgDetailResp {
      name: string;
      description_raw: string | null;
      background_image: string | null;
      metacritic: number | null;
      short_screenshots: Array<{ id: number; image: string }> | null;
      clip: { clip: string; video: string; preview: string } | null;
      esrb_rating: { name: string } | null;
      publishers: Array<{ name: string }> | null;
      platforms: Array<{ platform: { name: string } }> | null;
      released: string | null;
    }
    interface RawgMoviesResp {
      count: number;
      results: Array<{
        id: number; name: string; preview: string;
        data: { 480: string; max: string };
      }>;
    }

    interface RawgScreenshotResp {
      count: number;
      results: Array<{ id: number; image: string }>;
    }

    const [detailRes, moviesRes, screenshotsRes] = await Promise.allSettled([
      fetch(`https://api.rawg.io/api/games/${rawgId}?key=${RAWG_KEY}`, {
        headers: { "User-Agent": "DiscWatchHQ/1.0" },
        signal:  AbortSignal.timeout(10_000),
      }),
      fetch(`https://api.rawg.io/api/games/${rawgId}/movies?key=${RAWG_KEY}`, {
        headers: { "User-Agent": "DiscWatchHQ/1.0" },
        signal:  AbortSignal.timeout(10_000),
      }),
      fetch(`https://api.rawg.io/api/games/${rawgId}/screenshots?key=${RAWG_KEY}&page_size=6`, {
        headers: { "User-Agent": "DiscWatchHQ/1.0" },
        signal:  AbortSignal.timeout(10_000),
      }),
    ]);

    let description:      string | null = null;
    let screenshots:      string[]      = [];
    let trailerYoutubeId: string | null = null;
    let trailerUrl:       string | null = null;

    if (detailRes.status === "fulfilled" && detailRes.value.ok) {
      const detail = (await detailRes.value.json()) as RawgDetailResp;
      description = detail.description_raw?.trim() ?? null;

      // Some games have a clip field (YouTube redirect)
      if (detail.clip?.video) {
        trailerYoutubeId = detail.clip.video;
        trailerUrl = `https://www.youtube.com/watch?v=${trailerYoutubeId}`;
      }
    } else if (detailRes.status === "rejected") {
      logger.warn({ err: detailRes.reason, sourceId }, "RAWG game detail fetch failed");
    }

    // Screenshots endpoint returns actual screenshots (not included in game detail response)
    if (screenshotsRes.status === "fulfilled" && screenshotsRes.value.ok) {
      const ss = (await screenshotsRes.value.json()) as RawgScreenshotResp;
      screenshots = (ss.results ?? []).slice(0, 6).map(s => s.image).filter(Boolean);
    }

    // Movies endpoint often carries richer trailer data than the clip field
    if (moviesRes.status === "fulfilled" && moviesRes.value.ok) {
      const movies = (await moviesRes.value.json()) as RawgMoviesResp;
      const first = movies.results?.[0];
      if (first && !trailerYoutubeId) {
        const videoUrl = first.data?.max ?? first.data?.["480"] ?? "";
        // Extract YouTube video ID from various URL shapes
        const ytMatch = videoUrl.match(
          /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
        );
        if (ytMatch) {
          trailerYoutubeId = ytMatch[1];
          trailerUrl = `https://www.youtube.com/watch?v=${trailerYoutubeId}`;
        } else if (videoUrl.startsWith("http")) {
          trailerUrl = videoUrl;
        }
      }
    }

    const base = baseRow ?? { id: sourceId, source: "rawg" as const, title: sourceId,
      releaseDate: null, platforms: [], coverImageUrl: null,
      metacritic: null, esrbRating: null, publisherName: null,
      retailerSearchUrls: {
        ebay: buildEbaySearchUrl(sourceId), amazon: buildAmazonSearchUrl(sourceId),
        gamestop: buildGameStopSearchUrl(sourceId), bestbuy: buildBestBuySearchUrl(sourceId),
      },
    };

    res.json({ ...base, description, screenshots, trailerYoutubeId, trailerUrl, attribution: "rawg" });
    return;
  }

  // ── TGDB / fallback — return DB row without enrichment ─────────────────────
  if (!baseRow) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  res.json({
    ...baseRow,
    description:      null,
    screenshots:      [],
    trailerYoutubeId: null,
    trailerUrl:       null,
    attribution:      baseRow.source,
  });
});

export default router;
