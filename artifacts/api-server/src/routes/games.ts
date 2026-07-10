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
  rawgReady, tgdbReady,
  fetchFromRawg, fetchFromTgdb, fetchTgdbById, upsertCatalogGames,
} from "../lib/catalogService";
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
    retailerSearchUrls: row.retailerUrls ?? {
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
    const [rawgRes, tgdbRes] = await Promise.allSettled([
      fetchFromRawg(q, 1),
      fetchFromTgdb(q, 1),
    ]);

    if (rawgRes.status === "rejected") logger.error({ err: rawgRes.reason  }, "RAWG live fetch failed");
    if (tgdbRes.status === "rejected") logger.error({ err: tgdbRes.reason  }, "TGDB live fetch failed");

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
            retailerSearchUrls: r.retailerUrls ?? {
              ebay: "", amazon: "", gamestop: "", bestbuy: "",
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
      retailerSearchUrls: r.retailerUrls ?? { ebay: "", amazon: "", gamestop: "", bestbuy: "" },
    });
  }
});

export default router;
