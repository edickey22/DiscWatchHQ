/**
 * Price Snapshot Cleanup — removes price_snapshots rows older than 90 days.
 *
 * Runs once at server start (after a short delay) and then every 24 hours.
 * A single DELETE per day is cheap even for a large table: the
 * price_snapshots_snapped_at_idx index makes the range scan fast, and 90-day
 * retention is plenty for any weekly / monthly trend we'll ever need to show.
 */
import { lt } from "drizzle-orm";
import { db, priceSnapshotsTable } from "@workspace/db";
import { logger } from "./logger";

const RETENTION_DAYS = 90;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1_000; // 24 h

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

async function runCleanup(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1_000);
  try {
    const result = await db
      .delete(priceSnapshotsTable)
      .where(lt(priceSnapshotsTable.snappedAt, cutoff));
    logger.info({ cutoff: cutoff.toISOString(), rowCount: (result as { rowCount?: number }).rowCount ?? "?" },
      "Price snapshot cleanup complete");
  } catch (err) {
    logger.error({ err }, "Price snapshot cleanup failed");
  }
}

export function startPriceSnapshotCleanup(): void {
  // First run: 5 minutes after startup to avoid competing with the initial
  // eBay price scheduler burst.
  setTimeout(() => {
    runCleanup();
  }, 5 * 60 * 1_000);

  cleanupInterval = setInterval(() => {
    runCleanup();
  }, CLEANUP_INTERVAL_MS);
}

export function stopPriceSnapshotCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
