/**
 * catalogBackfill — daily-throttled proactive catalog enrichment.
 *
 * Phase 1 – RAWG seeding (virtually unlimited)
 *   Processes up to RAWG_PER_DAY franchise titles per run from POPULAR_TITLES,
 *   upserting RAWG results (Metacritic scores, cover screenshots, platform lists).
 *   RAWG has a 40 req/min free-tier cap with no monthly limit worth worrying about.
 *   Progress stored in system_kv → "rawg_backfill_idx" so it resumes across restarts.
 *
 * Phase 2 – TGDB enrichment (hard-capped at BACKFILL_ALLOC calls/day)
 *   Processes up to BACKFILL_ALLOC (= 10) franchise titles per run from the same
 *   list, fetching TGDB results (ESRB ratings, publisher names, boxart).
 *   Before each TGDB call: checks whether TGDB data is already in the DB for this
 *   franchise — if yes, skips (permanent cache). Checks tgdbBudget before fetching.
 *   Progress stored in system_kv → "tgdb_backfill_idx".
 *
 * Schedule
 *   Fires 10 s after startup, then every 24 h thereafter (daily rollover).
 *   Each run is a bounded batch — it does not try to process all titles at once.
 *   When all titles are processed, the index wraps around (continuous enrichment
 *   cycle, refreshing stale entries approximately every 10 days for TGDB).
 *
 * Budget interaction
 *   Uses canCallTgdb("backfill") + recordTgdbCall("backfill") from tgdbBudget.ts.
 *   TGDB budget is shared with live user searches — backfill is explicitly limited
 *   to BACKFILL_ALLOC (10) calls/day so it never crowds out real-time searches.
 */

import { eq } from "drizzle-orm";
import { db, systemKv, catalogGamesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  fetchFromRawg, fetchFromTgdb, rawgReady, tgdbReady, upsertCatalogGames,
} from "./catalogService";
import { checkAndReserveTgdbCall, BACKFILL_ALLOC } from "./tgdbBudget";
import { logger } from "./logger";

// ── Tuning constants ──────────────────────────────────────────────────────────

const RAWG_PER_DAY  = 20;         // max RAWG franchise lookups per run
const RAWG_PACE_MS  = 350;        // ms between RAWG requests (stays well under 40/min)
const TGDB_PER_DAY  = BACKFILL_ALLOC;  // honour the same cap as tgdbBudget
const STARTUP_DELAY = 10_000;     // 10 s grace period after server start
const DAILY_MS      = 24 * 60 * 60 * 1_000; // 24 h

// ── Franchise list ────────────────────────────────────────────────────────────

/** Broad selection of franchises and landmark titles spanning all eras. */
const POPULAR_TITLES = [
  // Nintendo first-party
  "Super Mario", "The Legend of Zelda", "Pokemon", "Metroid", "Kirby",
  "Donkey Kong", "Star Fox", "Fire Emblem", "Splatoon", "Animal Crossing",
  "Bayonetta", "Xenoblade", "Super Smash Bros",
  // Sony first-party
  "God of War", "Uncharted", "The Last of Us", "Horizon", "Spider-Man",
  "Gran Turismo", "Ratchet and Clank", "Demon's Souls",
  // Microsoft first-party
  "Halo", "Forza", "Gears of War", "Fable",
  // Capcom
  "Resident Evil", "Devil May Cry", "Monster Hunter", "Street Fighter",
  "Mega Man", "Dragon's Dogma", "Onimusha",
  // Konami
  "Castlevania", "Silent Hill", "Metal Gear Solid", "Contra",
  // Square Enix
  "Final Fantasy", "Dragon Quest", "Kingdom Hearts", "Chrono Trigger",
  "Parasite Eve", "Tactics Ogre",
  // Atlus
  "Persona", "Shin Megami Tensei",
  // Bandai Namco
  "Tekken", "Soul Calibur", "Tales of", "Dark Souls", "Elden Ring", "Pac-Man",
  // Sega
  "Sonic the Hedgehog", "Yakuza", "Phantasy Star", "Streets of Rage",
  // Activision / Blizzard
  "Call of Duty", "Diablo", "StarCraft", "Warcraft",
  // Ubisoft
  "Assassin's Creed", "Splinter Cell", "Prince of Persia",
  // Bethesda
  "The Elder Scrolls", "Fallout", "Doom", "Quake",
  // 2K / Rockstar
  "Grand Theft Auto", "Red Dead Redemption", "BioShock", "Borderlands",
  // Indie
  "Minecraft", "Terraria", "Stardew Valley", "Hollow Knight", "Celeste",
  "Cuphead", "Shovel Knight",
  // Modern AAA
  "The Witcher", "Cyberpunk 2077", "Half-Life", "Portal",
  "Mass Effect", "Dragon Age",
  // Retro / arcade
  "Mortal Kombat", "Tetris", "Galaga", "Frogger", "R-Type", "Gradius",
  "Ghosts n Goblins", "Double Dragon", "Ninja Gaiden", "Earthbound",
];

// ── system_kv helpers ─────────────────────────────────────────────────────────

async function readIdx(key: string): Promise<number> {
  const rows = await db.select().from(systemKv).where(eq(systemKv.key, key)).limit(1);
  if (!rows.length) return 0;
  return ((rows[0].value as { nextIndex?: number }).nextIndex ?? 0);
}

async function writeIdx(key: string, nextIndex: number): Promise<void> {
  const value = { nextIndex } as unknown as Record<string, unknown>;
  await db.insert(systemKv)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemKv.key, set: { value, updatedAt: new Date() } });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/** True if any catalog_games row from TGDB matches this franchise name. */
async function hasTgdbEntries(franchise: string): Promise<boolean> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` })
    .from(catalogGamesTable)
    .where(sql`source = 'tgdb' AND title ILIKE ${"%" + franchise + "%"}`);
  return n > 0;
}

// ── Main backfill run ─────────────────────────────────────────────────────────

async function runBackfill(): Promise<void> {
  const total = POPULAR_TITLES.length;
  logger.info({ titles: total }, "Catalog backfill run starting");

  // ── Phase 1: RAWG ──────────────────────────────────────────────────────────
  if (rawgReady) {
    let rawgIdx = await readIdx("rawg_backfill_idx");
    let rawgDone = 0;

    while (rawgDone < RAWG_PER_DAY) {
      const title = POPULAR_TITLES[rawgIdx % total];
      try {
        const { rows } = await fetchFromRawg(title, 1);
        if (rows.length > 0) await upsertCatalogGames(rows);
      } catch (err) {
        logger.warn({ err, title }, "Backfill RAWG fetch failed — skipping title");
      }
      rawgIdx++;
      rawgDone++;
      await delay(RAWG_PACE_MS);
    }

    await writeIdx("rawg_backfill_idx", rawgIdx % total);
    logger.info({ rawgDone, nextRawgIdx: rawgIdx % total }, "Backfill RAWG phase complete");
  }

  // ── Phase 2: TGDB enrichment ───────────────────────────────────────────────
  if (!tgdbReady) {
    logger.debug("Backfill TGDB phase skipped — TGDB_API_KEY not set");
    return;
  }

  let tgdbIdx  = await readIdx("tgdb_backfill_idx");
  let tgdbDone = 0;   // TGDB calls made this run
  let skipped  = 0;   // titles skipped because already indexed

  while (tgdbDone < TGDB_PER_DAY) {
    const title = POPULAR_TITLES[tgdbIdx % total];

    // Permanent cache check — if TGDB data already in DB, skip (never re-fetch)
    const alreadyIndexed = await hasTgdbEntries(title);
    if (alreadyIndexed) {
      skipped++;
      tgdbIdx++;
      // If every title is already indexed, break to avoid infinite loop
      if (skipped >= total) {
        logger.info("Backfill TGDB phase: all titles already indexed");
        break;
      }
      continue;
    }

    // Atomically check budget and reserve a slot — returns false if exhausted
    if (!(await checkAndReserveTgdbCall("backfill"))) {
      logger.info({ tgdbDone, remaining: TGDB_PER_DAY - tgdbDone }, "Backfill TGDB phase: daily budget exhausted");
      break;
    }

    try {
      const { rows } = await fetchFromTgdb(title, 1);
      if (rows.length > 0) await upsertCatalogGames(rows);
      logger.debug({ title, rows: rows.length }, "Backfill TGDB: upserted");
    } catch (err) {
      logger.warn({ err, title }, "Backfill TGDB fetch failed — skipping title");
    }

    tgdbIdx++;
    tgdbDone++;
    await delay(500); // extra breathing room for TGDB (rate-limit headroom)
  }

  await writeIdx("tgdb_backfill_idx", tgdbIdx % total);
  logger.info(
    { tgdbDone, skipped, nextTgdbIdx: tgdbIdx % total },
    "Backfill TGDB phase complete",
  );
}

// ── Exported entry point ──────────────────────────────────────────────────────

let _started = false;

export function startCatalogBackfill(): void {
  if (_started) return;
  _started = true;

  if (!rawgReady && !tgdbReady) {
    logger.info("Catalog backfill skipped — neither RAWG_API_KEY nor TGDB_API_KEY is set");
    return;
  }

  const schedule = async () => {
    try {
      await runBackfill();
    } catch (err) {
      logger.error({ err }, "Catalog backfill run failed");
    }
    // Schedule next run in 24 h — independent of how long this run took
    setTimeout(schedule, DAILY_MS);
  };

  // First run after startup grace period
  setTimeout(schedule, STARTUP_DELAY);
  logger.info({ startupDelayMs: STARTUP_DELAY }, "Catalog backfill scheduled");
}
