/**
 * /api/games — DB-backed game catalog search (TheGamesDB + RAWG).
 *
 * Results are persisted to the catalog_games table, making the site's own
 * PostgreSQL database the search index. Searches query the DB first; on a
 * cold cache (< 10 DB results for page 1) both live sources are fetched,
 * upserted, and the DB is re-queried before responding.
 *
 * The catalog grows organically through searches and is seeded proactively
 * by the backfill scheduler (catalogBackfill.ts).
 *
 * Attribution:
 *   TheGamesDB — community-run open database (courtesy credit)
 *   RAWG       — required by their free-tier API terms
 */

import { Router } from "express";
import { and, asc, ilike, sql } from "drizzle-orm";
import { db, catalogGamesTable, type CatalogGameRow } from "@workspace/db";
import {
  rawgReady, tgdbReady,
  fetchFromRawg, fetchFromTgdb, upsertCatalogGames,
} from "../lib/catalogService";
import {
  buildEbaySearchUrl, buildAmazonSearchUrl,
  buildGameStopSearchUrl, buildBestBuySearchUrl,
} from "../lib/affiliateConfig";
import { logger } from "../lib/logger";

const router = Router();
const PAGE_SIZE = 20;

// ── Response formatter ────────────────────────────────────────────────────────

/** Shape the frontend's TgdbGameCard.CatalogGame interface expects. */
function formatRow(row: CatalogGameRow) {
  return {
    id:           row.sourceId,
    source:       row.source as "rawg" | "tgdb",
    title:        row.title,
    releaseDate:  row.releaseYear ? String(row.releaseYear) : null,
    platforms:    row.platforms,
    coverImageUrl: row.coverImageUrl ?? null,
    metacritic:   row.metacritic ?? null,
    esrbRating:   row.esrbRating ?? null,
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
  const conditions = [ilike(catalogGamesTable.title, likePattern)];
  if (platformFilter) {
    conditions.push(
      sql`${catalogGamesTable.platforms} && ARRAY[${platformFilter}]::text[]`,
    );
  }
  const where = and(...conditions);
  const offset = (page - 1) * PAGE_SIZE;

  const [rows, [{ total }]] = await Promise.all([
    db.select()
      .from(catalogGamesTable)
      .where(where)
      .orderBy(
        // Exact title matches first, then prefix matches, then substring
        sql`CASE
          WHEN LOWER(${catalogGamesTable.title}) = LOWER(${q})          THEN 0
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
 *   q        — title search (required; empty returns empty)
 *   page     — 1-based page number (default 1)
 *   platform — platform filter (e.g. "PS5", "Switch")
 *
 * Cold search (< 10 DB results on page 1): fires both live APIs, upserts
 * results, then re-queries the DB — single round-trip for the caller.
 */
router.get("/games/search", async (req, res): Promise<void> => {
  const q              = typeof req.query.q        === "string" ? req.query.q.trim()        : "";
  const page           = Math.max(1, parseInt(String(req.query.page     ?? "1")) || 1);
  const platformFilter = typeof req.query.platform === "string" ? req.query.platform.trim() : "";

  const sources = { rawg: rawgReady, tgdb: tgdbReady };

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

    if (rawgRes.status === "rejected")  logger.error({ err: rawgRes.reason  }, "RAWG live fetch failed");
    if (tgdbRes.status === "rejected")  logger.error({ err: tgdbRes.reason  }, "TGDB live fetch failed");

    const liveRows = [
      ...(rawgRes.status === "fulfilled" ? rawgRes.value.rows : []),
      ...(tgdbRes.status === "fulfilled" ? tgdbRes.value.rows : []),
    ];

    if (liveRows.length > 0) {
      try {
        await upsertCatalogGames(liveRows);
        // Re-query now that the DB has the upserted rows
        ({ results, total } = await queryDb(q, page, platformFilter));
      } catch (err) {
        logger.error({ err }, "catalog upsert failed");
        // Fall through with whatever the live APIs returned directly
        if (results.length === 0) {
          results = liveRows.slice(0, PAGE_SIZE).map(r => ({
            id:            r.sourceId,
            source:        r.source as "rawg" | "tgdb",
            title:         r.title,
            releaseDate:   r.releaseYear ? String(r.releaseYear) : null,
            platforms:     r.platforms   ?? [],   // InsertCatalogGame has optional default
            coverImageUrl: r.coverImageUrl ?? null,
            metacritic:    r.metacritic   ?? null,
            esrbRating:    r.esrbRating   ?? null,
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

export default router;
