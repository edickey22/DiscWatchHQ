#!/usr/bin/env tsx
/**
 * scripts/backfill-unknown-platforms.ts
 *
 * One-time production-safe backfill: scans all releases with
 * platforms = {Unknown} and either:
 *   - updates them to platform(s) extracted from the title, or
 *   - sets platforms to [] when the title contains no platform keyword
 *     (art cards, vinyl LPs, books, no-game collector items, etc.)
 *
 * Run (dev or production):
 *   pnpm --filter @workspace/api-server run backfill:platforms
 *
 * Or directly:
 *   cd artifacts/api-server && tsx scripts/backfill-unknown-platforms.ts
 *
 * Safe to run multiple times — only rows still carrying "Unknown" are touched.
 * Requires DATABASE_URL to be set in the environment (or .env).
 */

import { db } from "@workspace/db";
import { releasesTable } from "@workspace/db/schema";
import { sql, eq } from "drizzle-orm";
import { extractPlatformsFromTitle } from "../src/lib/platformExtractor";

async function run(): Promise<void> {
  console.log("Backfill: scanning releases with platforms = {Unknown} …\n");

  const rows = await db.execute<{ id: number; title: string }>(
    sql`SELECT id, title FROM releases WHERE platforms @> ARRAY['Unknown']::text[]`
  );

  const rowsArray =
    (rows as unknown as { rows: { id: number; title: string }[] }).rows ??
    (rows as unknown as { id: number; title: string }[]);

  if (rowsArray.length === 0) {
    console.log("✅  No Unknown-platform rows found — nothing to do.");
    process.exit(0);
  }

  console.log(`Found ${rowsArray.length} row(s) to process:\n`);

  let updatedCount = 0;
  let clearedCount = 0;

  for (const row of rowsArray) {
    const extracted = extractPlatformsFromTitle(row.title);

    if (extracted.length > 0) {
      await db
        .update(releasesTable)
        .set({ platforms: extracted })
        .where(eq(releasesTable.id, row.id));

      console.log(`  [UPDATED] id=${row.id}  "${row.title}"`);
      console.log(`            platforms → ${JSON.stringify(extracted)}`);
      updatedCount++;
    } else {
      // No platform keyword found — clear Unknown to empty array.
      // Use a raw SQL cast because Drizzle cannot infer the element type of [].
      await db
        .update(releasesTable)
        .set({ platforms: sql`ARRAY[]::text[]` as unknown as string[] })
        .where(eq(releasesTable.id, row.id));

      console.log(`  [CLEARED] id=${row.id}  "${row.title}"  (no platform in title)`);
      clearedCount++;
    }
  }

  console.log(`\n✅  Backfill complete.`);
  console.log(`    Updated: ${updatedCount}  |  Cleared: ${clearedCount}  |  Total: ${rowsArray.length}`);

  // Verify
  const remaining = await db.execute<{ cnt: string }>(
    sql`SELECT count(*)::text as cnt FROM releases WHERE platforms @> ARRAY['Unknown']::text[]`
  );
  const remainingRows =
    (remaining as unknown as { rows: { cnt: string }[] }).rows ??
    (remaining as unknown as { cnt: string }[]);
  const cnt = parseInt(remainingRows[0]?.cnt ?? "0", 10);

  if (cnt > 0) {
    console.warn(`\n⚠️  ${cnt} Unknown row(s) still remain — inspect manually.`);
    process.exit(1);
  } else {
    console.log("    Verification: zero Unknown rows remain. ✓");
  }
}

run().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
