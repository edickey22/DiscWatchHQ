import type { PublisherScraper } from "./types";
import { limitedRunScraper } from "./publishers/limitedRun";
import { strictlyLimitedScraper } from "./publishers/strictlyLimited";
import { iam8bitScraper } from "./publishers/iam8bit";
import { superRareScraper } from "./publishers/superRare";
import { fangamerScraper } from "./publishers/fangamer";
import { xboxGameStudiosScraper } from "./publishers/xboxGameStudios";
import { blizzardGearScraper } from "./publishers/blizzardGear";
import { eastasiasoftScraper } from "./publishers/eastasiasoft";
import { redArtGamesScraper } from "./publishers/redArtGames";

/**
 * Registry of all active publisher scrapers.
 * To add a new publisher, import its scraper and add it to this array.
 * The slug must match the slug in the publishers DB table.
 *
 * ── Active scrapers ──────────────────────────────────────────────────────────
 *
 *   Publisher                 Domain                        Feed type
 *   ──────────────────────────────────────────────────────────────────────────
 *   Limited Run Games         limitedrungames.com           Shopify JSON  ✓ HIGH
 *   Strictly Limited Games    strictlylimitedgames.com      Shopify JSON  ✓ HIGH
 *   iam8bit                   iam8bit.com                   Shopify JSON  ✓ HIGH
 *   Super Rare Games          superraregames.com            Shopify JSON  ✓ HIGH
 *   Fangamer                  fangamer.com                  Shopify JSON  ✓ HIGH
 *   Xbox Game Studios Shop    shop.xboxgamestudios.com      Shopify JSON  ✓ HIGH
 *   Blizzard Gear Store       gear.blizzard.com             Shopify JSON  ✓ HIGH
 *   eastasiasoft               shop.eastasiasoft.com         Shopify JSON  ✓ HIGH
 *   Red Art Games             redartgames.com               HTML parsing ⚠ MEDIUM
 *
 * ── Seeded / disabled (no scraper yet) ──────────────────────────────────────
 *
 *   Publisher                 Reason not yet scraped
 *   ──────────────────────────────────────────────────────────────────────────
 *   Special Reserve Games     Defunct (2024); domain → Devolver Digital
 *   Nintendo Official Store   Custom platform; no public product feed
 *   PlayStation Direct        Custom platform; no public product feed
 */
const scrapers: PublisherScraper[] = [
  limitedRunScraper,         // limitedrungames.com          — Shopify JSON /collections/*
  strictlyLimitedScraper,    // strictlylimitedgames.com     — Shopify JSON /collections/*
  iam8bitScraper,            // iam8bit.com                  — Shopify JSON /collections/games
  superRareScraper,          // superraregames.com           — Shopify JSON /collections/*
  fangamerScraper,           // fangamer.com                 — Shopify JSON /collections/physical-games
  xboxGameStudiosScraper,    // shop.xboxgamestudios.com     — Shopify JSON /collections/collector-editions
  blizzardGearScraper,       // gear.blizzard.com            — Shopify JSON /collections/limited-edition
  eastasiasoftScraper,       // shop.eastasiasoft.com        — Shopify JSON /collections/games
  redArtGamesScraper,        // redartgames.com              — HTML parsing of /33-games listing pages
];

export function getScraperBySlug(slug: string): PublisherScraper | undefined {
  return scrapers.find((s) => s.slug === slug);
}

export function getAllScrapers(): PublisherScraper[] {
  return scrapers;
}
