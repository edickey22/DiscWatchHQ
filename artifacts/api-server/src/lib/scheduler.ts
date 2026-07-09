import { logger } from "./logger";
import { runScraper } from "./scraper/runner";

let interval: NodeJS.Timeout | null = null;

/** Scrape interval in ms. Default: 2 hours */
const SCRAPE_INTERVAL_MS = parseInt(process.env.SCRAPE_INTERVAL_MS ?? "") || 2 * 60 * 60 * 1000;

export function startScheduler(): void {
  logger.info({ intervalMs: SCRAPE_INTERVAL_MS }, "Starting scrape scheduler");

  // Run once at startup (after a short delay so the server is ready)
  setTimeout(() => {
    logger.info("Running initial scrape on startup");
    runScraper().catch((err) => logger.error({ err }, "Initial scrape failed"));
  }, 10_000);

  // Then on a fixed interval
  interval = setInterval(() => {
    logger.info("Running scheduled scrape");
    runScraper().catch((err) => logger.error({ err }, "Scheduled scrape failed"));
  }, SCRAPE_INTERVAL_MS);
}

export function stopScheduler(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
    logger.info("Scrape scheduler stopped");
  }
}
