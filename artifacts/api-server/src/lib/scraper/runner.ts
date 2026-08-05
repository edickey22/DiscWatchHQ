import { eq, and, desc, inArray } from "drizzle-orm";
import { db, publishersTable, releasesTable, scrapeLogsTable, priceSnapshotsTable } from "@workspace/db";
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

  // --- Batch prefetch 1: all existing releases for this publisher in one query ---
  const existingRows = await db
    .select({ id: releasesTable.id, externalId: releasesTable.externalId, status: releasesTable.status, soldOutAt: releasesTable.soldOutAt })
    .from(releasesTable)
    .where(eq(releasesTable.publisherId, publisherId));

  const existingByExternalId = new Map(existingRows.map(r => [r.externalId, r]));

  // --- Batch prefetch 2: latest release_list price snapshot for all known release IDs ---
  // Replaces the per-release SELECT inside the loop with a single indexed scan
  // followed by an in-memory Map lookup.
  //
  // Dedup: publisher list prices rarely change (a $49.99 edition stays at
  // $49.99 for months). Inserting on every 2-hour scrape run generates
  // ~500 redundant rows per run — ~540k unnecessary rows over 90 days.
  // We skip the insert when the most recent release_list snapshot already
  // has the same price (within floating-point tolerance).
  const lastSnapshotByItemId = new Map<string, number>(); // itemId -> priceUsd

  if (existingRows.length > 0) {
    const itemIds = existingRows.map(r => String(r.id));
    // Fetch all recent release_list snapshots for these IDs in one query,
    // newest first; keep only the first (latest) row encountered per itemId.
    const snapshots = await db
      .select({ itemId: priceSnapshotsTable.itemId, priceUsd: priceSnapshotsTable.priceUsd })
      .from(priceSnapshotsTable)
      .where(
        and(
          eq(priceSnapshotsTable.itemType, "release_list"),
          inArray(priceSnapshotsTable.itemId, itemIds),
        )
      )
      .orderBy(desc(priceSnapshotsTable.snappedAt));

    for (const row of snapshots) {
      if (!lastSnapshotByItemId.has(row.itemId)) {
        lastSnapshotByItemId.set(row.itemId, row.priceUsd);
      }
    }
  }

  let upserted = 0;

  for (const item of scraped) {
    const existing = existingByExternalId.get(item.externalId);

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

      // Snapshot the publisher list price when it is present.
      if (item.price) {
        const parsed = parseFloat(item.price.replace(/[^0-9.]/g, ""));
        if (!isNaN(parsed) && parsed > 0) {
          const lastPrice = lastSnapshotByItemId.get(String(existing.id));
          const priceUnchanged =
            lastPrice != null &&
            Math.abs(lastPrice - parsed) < 0.001;

          if (!priceUnchanged) {
            await db.insert(priceSnapshotsTable).values({
              itemType:  "release_list",
              itemId:    String(existing.id),
              source:    "publisher",
              priceUsd:  parsed,
              snappedAt: new Date(),
            }).catch(err =>
              logger.warn({ err, releaseId: existing.id }, "List price snapshot write failed — non-fatal"),
            );
          }
        }
      }
    } else {
      const [inserted] = await db.insert(releasesTable).values({
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
      }).returning({ id: releasesTable.id });

      // Snapshot the initial publisher list price for the new release.
      if (inserted && item.price) {
        const parsed = parseFloat(item.price.replace(/[^0-9.]/g, ""));
        if (!isNaN(parsed) && parsed > 0) {
          await db.insert(priceSnapshotsTable).values({
            itemType:  "release_list",
            itemId:    String(inserted.id),
            source:    "publisher",
            priceUsd:  parsed,
            snappedAt: new Date(),
          }).catch(err =>
            logger.warn({ err, releaseId: inserted.id }, "Initial list price snapshot write failed — non-fatal"),
          );
        }
      }
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
