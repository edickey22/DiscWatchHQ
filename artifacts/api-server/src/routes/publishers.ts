import { Router, type IRouter } from "express";
import { desc, sql } from "drizzle-orm";
import { db, publishersTable, releasesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/publishers", async (_req, res): Promise<void> => {
  const publishers = await db
    .select({
      id: publishersTable.id,
      name: publishersTable.name,
      slug: publishersTable.slug,
      websiteUrl: publishersTable.websiteUrl,
      logoUrl: publishersTable.logoUrl,
      enabled: publishersTable.enabled,
      lastScrapedAt: publishersTable.lastScrapedAt,
      releaseCount: sql<number>`(
        select count(*)::int from releases where publisher_id = ${publishersTable.id}
      )`,
    })
    .from(publishersTable)
    .orderBy(publishersTable.name);

  res.json(
    publishers.map((p) => ({
      ...p,
      lastScrapedAt: p.lastScrapedAt?.toISOString() ?? null,
    }))
  );
});

export default router;
