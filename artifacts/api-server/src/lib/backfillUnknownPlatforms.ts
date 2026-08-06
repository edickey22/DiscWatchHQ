/**
 * backfillUnknownPlatforms.ts
 *
 * One-time backfill: finds all releases with platforms = {Unknown} and either
 * - updates them to the platform(s) extracted from their title, or
 * - sets platforms to [] (empty) when no platform keyword is found in the title
 *   (e.g. vinyl LPs, art cards, books, no-game collector items).
 *
 * Safe to run multiple times — rows that were already fixed are skipped.
 */

import { db, releasesTable } from "@workspace/db";
import { sql, eq, type SQL } from "drizzle-orm";
import { logger } from "./logger";
import { extractPlatformsFromTitle } from "./platformExtractor";

export interface BackfillResult {
  total:     number;
  updated:   Array<{ id: number; title: string; platforms: string[] }>;
  cleared:   Array<{ id: number; title: string }>;
}

/**
 * Run the Unknown-platform backfill.
 *
 * @returns A summary of every row touched.
 */
export async function backfillUnknownPlatforms(): Promise<BackfillResult> {
  // Load all releases whose platforms array contains the literal "Unknown" entry
  const rows = await db.execute<{ id: number; title: string }>(
    sql`SELECT id, title FROM releases WHERE platforms @> ARRAY['Unknown']::text[]`
  );

  const rowsArray = (rows as unknown as { rows: { id: number; title: string }[] }).rows
    ?? (rows as unknown as { id: number; title: string }[]);

  const result: BackfillResult = { total: rowsArray.length, updated: [], cleared: [] };

  for (const row of rowsArray) {
    const extracted = extractPlatformsFromTitle(row.title);

    if (extracted.length > 0) {
      // Platform(s) found in title — write them
      await db
        .update(releasesTable)
        .set({ platforms: extracted })
        .where(eq(releasesTable.id, row.id));

      result.updated.push({ id: row.id, title: row.title, platforms: extracted });
      logger.info({ id: row.id, title: row.title, platforms: extracted },
        "backfillUnknownPlatforms: updated platforms from title");
    } else {
      // No platform keyword found — clear the Unknown sentinel to empty array.
      // Use a raw SQL cast because Drizzle can't infer the element type for [].
      await db
        .update(releasesTable)
        .set({ platforms: sql`ARRAY[]::text[]` as unknown as SQL<string[]> })
        .where(eq(releasesTable.id, row.id));

      result.cleared.push({ id: row.id, title: row.title });
      logger.info({ id: row.id, title: row.title },
        "backfillUnknownPlatforms: cleared Unknown (no platform in title)");
    }
  }

  logger.info(
    { total: result.total, updated: result.updated.length, cleared: result.cleared.length },
    "backfillUnknownPlatforms: complete"
  );

  return result;
}
