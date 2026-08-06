import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";
import { startEbayPriceScheduler } from "./lib/ebayPriceScheduler";
import { startConsoleListingsScheduler } from "./lib/consoleListingsScheduler";
import { startCatalogBackfill } from "./lib/catalogBackfill";
import { startAlertChecker } from "./lib/alertChecker";
import { startPriceSnapshotCleanup } from "./lib/priceSnapshotCleanup";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Publisher scraper scheduler — runs every ~2 hours, no quota concerns
  startScheduler();

  // eBay price scheduler — runs every 72 hours, only for sold-out titles.
  // See ebayPriceScheduler.ts for quota documentation.
  // Only active when EBAY_APP_ID + EBAY_CLIENT_SECRET secrets are set.
  startEbayPriceScheduler();

  // Console listings scheduler — runs every 24 hours, fetching multiple
  // filtered live listings per curated console model.
  // See consoleListingsScheduler.ts for quota documentation.
  // Only active when EBAY_APP_ID + EBAY_CLIENT_SECRET secrets are set.
  startConsoleListingsScheduler();

  // Catalog backfill — seeds catalog_games from RAWG if count < 1,000.
  // Fires 8 s after startup, fully in background, respects RAWG rate limits.
  startCatalogBackfill();

  // Alert checker — notifies users when tracked items change status/price.
  // Runs 2 min after startup, then every 4 hours. Requires SMTP credentials
  // for real delivery; logs to console in stub mode (see lib/email.ts).
  startAlertChecker();

  // Price snapshot cleanup — purges rows older than 90 days. Runs 5 min after
  // startup and then every 24 hours. Keeps the table bounded as snapshots
  // accumulate from the three scheduler write points.
  startPriceSnapshotCleanup();
});
