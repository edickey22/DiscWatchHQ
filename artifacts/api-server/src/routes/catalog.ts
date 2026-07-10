/**
 * /api/catalog — metadata endpoints for the unified game catalog.
 *
 * GET /catalog/stats        — total catalog_games count (used by header)
 * GET /catalog/platforms    — distinct platforms present in catalog_games
 * GET /catalog/tgdb-budget  — daily TGDB API call budget status (monitoring)
 */

import { Router } from "express";
import { sql } from "drizzle-orm";
import { db, catalogGamesTable } from "@workspace/db";
import { getTgdbBudgetStatus, DAILY_TOTAL, BACKFILL_ALLOC, SEARCH_ALLOC } from "../lib/tgdbBudget";

const router = Router();

/**
 * GET /api/catalog/stats
 * Returns total count of catalog_games rows (RAWG + TGDB entries).
 */
router.get("/catalog/stats", async (_req, res): Promise<void> => {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(catalogGamesTable);
  res.json({ count });
});

/**
 * GET /api/catalog/platforms
 * Returns distinct platform names present in catalog_games, sorted A–Z,
 * each with a game count. Used by the Browse Games platform filter.
 */
router.get("/catalog/platforms", async (_req, res): Promise<void> => {
  const rows = await db.execute<{ platform: string; game_count: string }>(sql`
    SELECT
      unnest(platforms) AS platform,
      COUNT(*)          AS game_count
    FROM catalog_games
    WHERE array_length(platforms, 1) > 0
    GROUP BY platform
    ORDER BY platform ASC
  `);
  const platforms = rows.rows.map(r => ({
    name:  r.platform,
    count: parseInt(r.game_count, 10),
  }));
  res.json({ platforms });
});

/**
 * GET /api/catalog/genres
 * Returns distinct genre names present in catalog_games, sorted A–Z,
 * each with a game count. Used by the Browse Games genre filter.
 */
router.get("/catalog/genres", async (_req, res): Promise<void> => {
  const rows = await db.execute<{ genre: string; game_count: string }>(sql`
    SELECT
      unnest(genres) AS genre,
      COUNT(*)       AS game_count
    FROM catalog_games
    WHERE array_length(genres, 1) > 0
    GROUP BY genre
    ORDER BY genre ASC
  `);
  const genres = rows.rows.map(r => ({
    name:  r.genre,
    count: parseInt(r.game_count, 10),
  }));
  res.json({ genres });
});

/**
 * GET /api/catalog/tgdb-budget
 *
 * Returns the current state of the TGDB daily call budget.
 * Useful for monitoring how many API calls remain today.
 *
 * Example response:
 * {
 *   "date": "2026-07-10",
 *   "totalCalls": 5,
 *   "totalBudget": 28,
 *   "totalRemaining": 23,
 *   "backfillCalls": 2,
 *   "backfillBudget": 10,
 *   "searchCalls": 3,
 *   "searchBudget": 18,
 *   "exhausted": false
 * }
 */
router.get("/catalog/tgdb-budget", async (_req, res): Promise<void> => {
  const status = await getTgdbBudgetStatus();
  res.json({
    ...status,
    // Include the configured constants so callers know the full picture
    config: {
      dailyTotal:    DAILY_TOTAL,
      backfillAlloc: BACKFILL_ALLOC,
      searchAlloc:   SEARCH_ALLOC,
      monthlyTarget: DAILY_TOTAL * 30,  // 840 — comfortably under TGDB's 1000/month
    },
  });
});

export default router;
