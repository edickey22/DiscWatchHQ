import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, publishersTable, scrapeLogsTable } from "@workspace/db";
import { TriggerScrapeBody } from "@workspace/api-zod";
import { runScraper } from "../lib/scraper/runner";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** Simple secret-key guard for the trigger endpoint.
 *  Set SCRAPE_SECRET in env; if unset the endpoint is disabled entirely.
 */
function requireScrapeSecret(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
): void {
  const secret = process.env.SCRAPE_SECRET;
  if (!secret) {
    res.status(403).json({ error: "Scrape trigger is disabled — set SCRAPE_SECRET to enable it" });
    return;
  }
  const provided = req.headers["x-scrape-secret"] ?? req.body?.secret;
  if (provided !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.get("/scrape/status", async (_req, res): Promise<void> => {
  const publishers = await db
    .select({
      publisherId: publishersTable.id,
      publisherName: publishersTable.name,
      publisherSlug: publishersTable.slug,
    })
    .from(publishersTable)
    .orderBy(publishersTable.name);

  const results = await Promise.all(
    publishers.map(async (pub) => {
      const [log] = await db
        .select()
        .from(scrapeLogsTable)
        .where(eq(scrapeLogsTable.publisherId, pub.publisherId))
        .orderBy(desc(scrapeLogsTable.startedAt))
        .limit(1);

      return {
        publisherId: pub.publisherId,
        publisherName: pub.publisherName,
        publisherSlug: pub.publisherSlug,
        lastRunAt: log?.startedAt?.toISOString() ?? null,
        lastRunStatus: log?.status ?? null,
        releasesFound: log?.releasesFound ?? null,
        errorMessage: log?.errorMessage ?? null,
      };
    })
  );

  res.json(results);
});

router.post("/scrape/trigger", requireScrapeSecret, async (req, res): Promise<void> => {
  const parsed = TriggerScrapeBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const publisherSlug = parsed.data.publisherSlug ?? undefined;

  // Run async — respond immediately with 202
  runScraper(publisherSlug)
    .then(({ publishersTriggered }) => {
      logger.info({ publisherSlug, publishersTriggered }, "Manual scrape completed");
    })
    .catch((err) => {
      logger.error({ err }, "Manual scrape failed");
    });

  res.status(202).json({
    message: publisherSlug
      ? `Scrape triggered for ${publisherSlug}`
      : "Scrape triggered for all publishers",
    publishersTriggered: publisherSlug ? 1 : 1,
  });
});

export default router;
