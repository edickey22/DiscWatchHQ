import { eq, and } from "drizzle-orm";
import { db, publishersTable, releasesTable, scrapeLogsTable } from "@workspace/db";
import { logger } from "../logger";
import { getAllScrapers, getScraperBySlug } from "./registry";
import type { ScrapedRelease } from "./types";

/** Simple in-process lock to prevent overlapping scrapes per publisher slug */
const runningScrapers = new Set<string>();

/**
 * Upsert scraped releases for a given publisher using ON CONFLICT.
 * Requires a unique constraint on (publisher_id, external_id) in the DB.
 */
async function upsertReleases(publisherId: number, scraped: ScrapedRelease[]): Promise<number> {
  if (scraped.length === 0) return 0;

  let upserted = 0;

  for (const item of scraped) {
    // Fetch existing to detect sold-out transition
    const [existing] = await db
      .select({ id: releasesTable.id, status: releasesTable.status, soldOutAt: releasesTable.soldOutAt })
      .from(releasesTable)
      .where(
        and(
          eq(releasesTable.publisherId, publisherId),
          eq(releasesTable.externalId, item.externalId)
        )
      )
      .limit(1);

    const soldOutAt =
      existing && existing.status !== "sold_out" && item.status === "sold_out"
        ? new Date()
        : (existing?.soldOutAt ?? (item.status === "sold_out" ? new Date() : undefined));

    if (existing) {
      await db
        .update(releasesTable)
        .set({
          title: item.title,
          platforms: item.platforms,
          status: item.status,
          coverImageUrl: item.coverImageUrl,
          price: item.price,
          editionType: item.editionType,
          preorderCloseDate: item.preorderCloseDate,
          releaseDate: item.releaseDate,
          soldOutAt,
          amazonUrl: item.amazonUrl ?? null,
        })
        .where(eq(releasesTable.id, existing.id));
    } else {
      await db.insert(releasesTable).values({
        publisherId,
        externalId: item.externalId,
        title: item.title,
        platforms: item.platforms,
        status: item.status,
        coverImageUrl: item.coverImageUrl,
        productUrl: item.productUrl,
        price: item.price,
        editionType: item.editionType,
        preorderCloseDate: item.preorderCloseDate,
        releaseDate: item.releaseDate,
        soldOutAt,
        amazonUrl: item.amazonUrl ?? null,
        firstSeenAt: new Date(),
      });
    }
    upserted++;
  }

  return upserted;
}

export async function runScraper(slug?: string): Promise<{ publishersTriggered: number }> {
  const scrapers = slug ? [getScraperBySlug(slug)].filter(Boolean) : getAllScrapers();

  if (scrapers.length === 0) {
    logger.warn({ slug }, "No scraper found for slug");
    return { publishersTriggered: 0 };
  }

  let triggered = 0;

  for (const scraper of scrapers) {
    const scraperSlug = scraper!.slug;

    if (runningScrapers.has(scraperSlug)) {
      logger.warn({ slug: scraperSlug }, "Scraper already running, skipping");
      continue;
    }

    const [publisher] = await db
      .select()
      .from(publishersTable)
      .where(eq(publishersTable.slug, scraperSlug))
      .limit(1);

    if (!publisher) {
      logger.warn({ slug: scraperSlug }, "Publisher not found in DB, skipping");
      continue;
    }

    if (!publisher.enabled) {
      logger.info({ slug: scraperSlug }, "Publisher disabled, skipping");
      continue;
    }

    runningScrapers.add(scraperSlug);

    const [log] = await db
      .insert(scrapeLogsTable)
      .values({ publisherId: publisher.id, startedAt: new Date(), status: "running" })
      .returning();

    try {
      logger.info({ publisher: publisher.name }, "Running scraper");
      const releases = await scraper!.scrape();
      const count = await upsertReleases(publisher.id, releases);

      await db
        .update(scrapeLogsTable)
        .set({ status: "success", completedAt: new Date(), releasesFound: count })
        .where(eq(scrapeLogsTable.id, log.id));

      await db
        .update(publishersTable)
        .set({ lastScrapedAt: new Date() })
        .where(eq(publishersTable.id, publisher.id));

      logger.info({ publisher: publisher.name, count }, "Scrape complete");
      triggered++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ publisher: publisher.name, err: message }, "Scrape failed");

      await db
        .update(scrapeLogsTable)
        .set({ status: "error", completedAt: new Date(), errorMessage: message })
        .where(eq(scrapeLogsTable.id, log.id));
    } finally {
      runningScrapers.delete(scraperSlug);
    }
  }

  return { publishersTriggered: triggered };
}
