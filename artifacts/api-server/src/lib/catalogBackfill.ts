/**
 * catalogBackfill — proactive catalog seeding from RAWG.
 *
 * Runs once at server startup if the catalog_games table has fewer than
 * MIN_ENTRIES rows, fetching page 1 of results (20 games) for each
 * franchise/keyword in POPULAR_TITLES. With ~70 franchises this produces
 * ~1,200–1,400 entries covering retro through current-gen titles.
 *
 * Rate limiting: 350 ms between RAWG requests → ~3 req/sec, well within
 * the free-tier 40 req/min cap. Total runtime: ~25 seconds in background.
 *
 * Subsequent server restarts skip the backfill once count ≥ MIN_ENTRIES.
 */

import { sql } from "drizzle-orm";
import { db, catalogGamesTable } from "@workspace/db";
import { fetchFromRawg, rawgReady, upsertCatalogGames } from "./catalogService";
import { logger } from "./logger";

const MIN_ENTRIES = 1_000;
const PACE_MS     = 350; // ms between RAWG requests

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
  // Konami / Castlevania / Silent Hill
  "Castlevania", "Silent Hill", "Metal Gear Solid", "Contra",
  // Square Enix
  "Final Fantasy", "Dragon Quest", "Kingdom Hearts", "Chrono",
  "Parasite Eve", "Tactics Ogre",
  // Atlus / Persona
  "Persona", "Shin Megami Tensei", "Dragon Odyssey",
  // Bandai Namco
  "Tekken", "Soul Calibur", "Tales of", "Dark Souls", "Elden Ring",
  "Pac-Man",
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
  // Indie / modern
  "Minecraft", "Terraria", "Stardew Valley", "Hollow Knight", "Celeste",
  "Cuphead", "Shovel Knight",
  // Misc modern
  "The Witcher", "Cyberpunk 2077", "Elden Ring", "Half-Life", "Portal",
  "Mass Effect", "Dragon Age",
  // Retro / arcade
  "Mortal Kombat", "Street Fighter", "Tetris", "Pong", "Galaga", "Frogger",
  "R-Type", "Gradius", "Ghosts n Goblins", "Double Dragon", "Ninja Gaiden",
  "Earthbound", "Chrono Trigger",
];

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function startCatalogBackfill(): void {
  if (!rawgReady) {
    logger.info("Catalog backfill skipped — RAWG_API_KEY not set");
    return;
  }

  // Run fully in background — do not block server startup
  setTimeout(async () => {
    try {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(catalogGamesTable);

      if (count >= MIN_ENTRIES) {
        logger.info({ count }, "Catalog backfill skipped — already populated");
        return;
      }

      logger.info({ count, target: MIN_ENTRIES, franchises: POPULAR_TITLES.length },
        "Starting catalog backfill…");

      let totalUpserted = 0;

      for (const title of POPULAR_TITLES) {
        try {
          const { rows } = await fetchFromRawg(title, 1);
          if (rows.length > 0) {
            const n = await upsertCatalogGames(rows);
            totalUpserted += n;
          }
        } catch (err) {
          logger.warn({ err, title }, "Backfill fetch failed for title — skipping");
        }
        await delay(PACE_MS);
      }

      logger.info({ totalUpserted }, "Catalog backfill complete");
    } catch (err) {
      logger.error({ err }, "Catalog backfill error");
    }
  }, 8_000); // 8 second grace period after server start
}
