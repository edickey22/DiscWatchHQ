/**
 * /api/price-history — price trend data for releases and console models.
 *
 * GET /api/price-history/release/:id
 *   Returns the last 90 days of snapshots for a boutique release.
 *   Includes both "release_ebay" (eBay resale) and "release_list" (publisher
 *   list price) rows so the caller can distinguish the two series.
 *
 * GET /api/price-history/console/:id
 *   Returns the last 90 days of "console_ebay" snapshots for a console model
 *   (the minimum Buy-It-Now price across all filtered listings at each run).
 *
 * Response shape (same for both routes):
 *   {
 *     snapshots: Array<{
 *       source:    string;        // "ebay" | "publisher" | …
 *       itemType:  string;        // "release_ebay" | "release_list" | "console_ebay"
 *       priceUsd:  number | null;
 *       snappedAt: string;        // ISO 8601
 *     }>;
 *     trend: {
 *       currentPrice:  number | null;   // most recent non-null price (primary source)
 *       weekAgoPrice:  number | null;   // oldest non-null price >= 7 days ago
 *       sevenDayLow:   number | null;   // minimum non-null price in last 7 days
 *       sevenDayHigh:  number | null;
 *       changePercent: number | null;   // (current - weekAgo) / weekAgo * 100
 *       direction:     "up" | "down" | "flat" | null;
 *     };
 *   }
 *
 * Queries are index-only on price_snapshots_item_idx and bounded to 90 days,
 * so they are cheap even as the table grows.
 */
import { Router } from "express";
import { and, eq, gte, desc, or } from "drizzle-orm";
import { db, priceSnapshotsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

const NINETY_DAYS_MS  = 90 * 24 * 60 * 60 * 1_000;
const SEVEN_DAYS_MS   =  7 * 24 * 60 * 60 * 1_000;

/**
 * Derive trend stats from a sorted (newest-first) list of non-null-priced snapshots.
 *
 * weekAgoPrice semantics:
 *   - Snapshots are ordered newest → oldest (desc snapped_at from the DB query).
 *   - "Older snapshots" = those whose snapped_at is before the 7-day cutoff.
 *   - Among those, index [0] is the one CLOSEST to the 7-day boundary (it is the
 *     newest of the older group in a newest-first list) — the best representative
 *     of "what the price was approximately 7 days ago".
 *   - We never fall back to the oldest overall snapshot when there is no 7-day
 *     history yet: in that case weekAgoPrice is null and direction/changePercent
 *     are also null so the UI shows only the 7-day low badge without a fake %.
 */
function computeTrend(
  snapshots: Array<{ priceUsd: number | null; snappedAt: Date }>,
) {
  const priced = snapshots.filter(s => s.priceUsd !== null) as Array<{ priceUsd: number; snappedAt: Date }>;
  if (priced.length === 0) {
    return { currentPrice: null, weekAgoPrice: null, sevenDayLow: null, sevenDayHigh: null, changePercent: null, direction: null };
  }

  const now          = Date.now();
  const sevenDaysAgo = now - SEVEN_DAYS_MS;

  const currentPrice = priced[0].priceUsd;  // newest-first → index 0 is most recent

  const last7Days    = priced.filter(s => s.snappedAt.getTime() >= sevenDaysAgo);
  const sevenDayLow  = last7Days.length > 0 ? Math.min(...last7Days.map(s => s.priceUsd)) : null;
  const sevenDayHigh = last7Days.length > 0 ? Math.max(...last7Days.map(s => s.priceUsd)) : null;

  // olderSnapshots are in newest-first order, so [0] is closest to the 7-day
  // boundary — the most accurate "week ago" reference point.
  const olderSnapshots = priced.filter(s => s.snappedAt.getTime() < sevenDaysAgo);
  const weekAgoPrice   = olderSnapshots.length > 0 ? olderSnapshots[0].priceUsd : null;

  // No weekly direction when there is no genuine 7-day comparison available.
  // This prevents "↑ X% this week" appearing for items that are < 7 days old
  // or whose history window hasn't reached 7 days yet.
  const changePercent =
    weekAgoPrice !== null && weekAgoPrice > 0
      ? ((currentPrice - weekAgoPrice) / weekAgoPrice) * 100
      : null;

  // ±1% tolerance absorbs floating-point and scheduler-timing noise.
  const direction: "up" | "down" | "flat" | null =
    changePercent === null ? null
    : changePercent >  1   ? "up"
    : changePercent < -1   ? "down"
    :                        "flat";

  return { currentPrice, weekAgoPrice, sevenDayLow, sevenDayHigh, changePercent, direction };
}

router.get("/price-history/release/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid release ID" });
    return;
  }

  try {
    const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
    const snapshots = await db
      .select({
        itemType:  priceSnapshotsTable.itemType,
        source:    priceSnapshotsTable.source,
        priceUsd:  priceSnapshotsTable.priceUsd,
        snappedAt: priceSnapshotsTable.snappedAt,
      })
      .from(priceSnapshotsTable)
      .where(
        and(
          // Restrict to release series only — never mix in console_ebay rows,
          // even if a numeric release ID happens to match a console model string.
          or(
            eq(priceSnapshotsTable.itemType, "release_ebay"),
            eq(priceSnapshotsTable.itemType, "release_list"),
          ),
          eq(priceSnapshotsTable.itemId, String(id)),
          gte(priceSnapshotsTable.snappedAt, cutoff),
        )
      )
      .orderBy(desc(priceSnapshotsTable.snappedAt))
      .limit(1000);

    // For trend computation, prefer eBay resale series (primary interest for
    // sold-out releases).  Fall back to list price if no eBay rows.
    const ebaySnapshots = snapshots.filter(s => s.itemType === "release_ebay");
    const trendSource   = ebaySnapshots.length > 0 ? ebaySnapshots : snapshots;
    const trend         = computeTrend(trendSource);

    res.json({
      snapshots: snapshots.map(s => ({
        itemType:  s.itemType,
        source:    s.source,
        priceUsd:  s.priceUsd,
        snappedAt: s.snappedAt.toISOString(),
      })),
      trend,
    });
  } catch (err) {
    logger.error({ err, releaseId: id }, "Price history fetch failed");
    res.status(500).json({ error: "Failed to fetch price history" });
  }
});

router.get("/price-history/console/:id", async (req, res): Promise<void> => {
  const consoleId = req.params.id;
  if (!consoleId) {
    res.status(400).json({ error: "Invalid console ID" });
    return;
  }

  try {
    const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
    const snapshots = await db
      .select({
        itemType:  priceSnapshotsTable.itemType,
        source:    priceSnapshotsTable.source,
        priceUsd:  priceSnapshotsTable.priceUsd,
        snappedAt: priceSnapshotsTable.snappedAt,
      })
      .from(priceSnapshotsTable)
      .where(
        and(
          eq(priceSnapshotsTable.itemType, "console_ebay"),
          eq(priceSnapshotsTable.itemId, consoleId),
          gte(priceSnapshotsTable.snappedAt, cutoff),
        )
      )
      .orderBy(desc(priceSnapshotsTable.snappedAt))
      .limit(200);

    const trend = computeTrend(snapshots);

    res.json({
      snapshots: snapshots.map(s => ({
        itemType:  s.itemType,
        source:    s.source,
        priceUsd:  s.priceUsd,
        snappedAt: s.snappedAt.toISOString(),
      })),
      trend,
    });
  } catch (err) {
    logger.error({ err, consoleId }, "Console price history fetch failed");
    res.status(500).json({ error: "Failed to fetch price history" });
  }
});

export default router;
