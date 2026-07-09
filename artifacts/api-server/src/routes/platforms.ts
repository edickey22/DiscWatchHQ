import { Router, type IRouter } from "express";
import { db, releasesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/platforms", async (_req, res): Promise<void> => {
  // Unnest the platforms array column and count occurrences
  const result = await db.execute(
    sql`
      SELECT platform, count(*)::int as release_count
      FROM (
        SELECT unnest(platforms) as platform FROM releases
      ) sub
      GROUP BY platform
      ORDER BY release_count DESC, platform ASC
    `
  );

  type PlatformRow = { platform: string; release_count: number };
  const rowsArray = (result as unknown as { rows: PlatformRow[] }).rows ?? (result as unknown as PlatformRow[]);
  const platforms = rowsArray.map((r: PlatformRow) => ({
    name: r.platform,
    releaseCount: r.release_count,
  }));

  res.json(platforms);
});

export default router;
