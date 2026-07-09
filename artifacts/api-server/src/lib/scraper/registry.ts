import type { PublisherScraper } from "./types";
import { limitedRunScraper } from "./publishers/limitedRun";

/**
 * Registry of all publisher scrapers.
 * To add a new publisher, import its scraper and add it to this array.
 * The slug must match the slug in the publishers DB table.
 */
const scrapers: PublisherScraper[] = [
  limitedRunScraper,
  // Future publishers:
  // strictlyLimitedScraper,
  // iam8bitScraper,
  // specialReserveScraper,
];

export function getScraperBySlug(slug: string): PublisherScraper | undefined {
  return scrapers.find((s) => s.slug === slug);
}

export function getAllScrapers(): PublisherScraper[] {
  return scrapers;
}
