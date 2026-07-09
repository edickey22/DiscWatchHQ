import type { PublisherScraper } from "./types";
import { limitedRunScraper } from "./publishers/limitedRun";
import { strictlyLimitedScraper } from "./publishers/strictlyLimited";
import { iam8bitScraper } from "./publishers/iam8bit";
import { superRareScraper } from "./publishers/superRare";
import { fangamerScraper } from "./publishers/fangamer";

/**
 * Registry of all publisher scrapers.
 * To add a new publisher, import its scraper and add it to this array.
 * The slug must match the slug in the publishers DB table.
 *
 * Publishers with no scraper yet:
 *   - Special Reserve Games: defunct as of 2024, domain redirects to Devolver Digital
 */
const scrapers: PublisherScraper[] = [
  limitedRunScraper,         // limitedrungames.com  — Shopify JSON /collections/*
  strictlyLimitedScraper,    // strictlylimitedgames.com — Shopify JSON /collections/pre-order + coming-soon
  iam8bitScraper,            // iam8bit.com — Shopify JSON /collections/games
  superRareScraper,          // superraregames.com — Shopify JSON /collections/featured + all
  fangamerScraper,           // fangamer.com — Shopify JSON /collections/physical-games
];

export function getScraperBySlug(slug: string): PublisherScraper | undefined {
  return scrapers.find((s) => s.slug === slug);
}

export function getAllScrapers(): PublisherScraper[] {
  return scrapers;
}
