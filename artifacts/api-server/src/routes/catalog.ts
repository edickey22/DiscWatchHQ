/**
 * /api/catalog — metadata endpoints for the unified game catalog.
 *
 * GET /catalog/stats     — total catalog_games count (used by header)
 * GET /catalog/platforms — distinct platforms present in catalog_games
 */

import { Router } from "express";
import { sql } from "drizzle-orm";
import { db, catalogGamesTable } from "@workspace/db";

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

export default router;
