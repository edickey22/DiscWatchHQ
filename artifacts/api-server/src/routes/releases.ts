import { Router, type IRouter } from "express";
import { eq, desc, ilike, and, sql } from "drizzle-orm";
import { db, releasesTable, publishersTable } from "@workspace/db";
import {
  ListReleasesQueryParams,
  ListAvailableReleasesQueryParams,
  ListSoldOutReleasesQueryParams,
  ListComingSoonReleasesQueryParams,
  GetReleaseParams,
} from "@workspace/api-zod";
import { buildEbaySearchUrl, buildAmazonUrl } from "../lib/affiliateConfig";

const router: IRouter = Router();

type ReleaseStatus = "available" | "sold_out" | "coming_soon";

/** Build a type-safe condition list and run the releases query */
async function queryReleases(opts: {
  status?: ReleaseStatus;
  platform?: string;
  publisher?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const { status, platform, publisher, search, limit = 50, offset = 0 } = opts;

  const conditions = [];

  if (status) conditions.push(eq(releasesTable.status, status));
  if (search) conditions.push(ilike(releasesTable.title, `%${search}%`));
  if (publisher) conditions.push(eq(publishersTable.slug, publisher));
  if (platform) {
    conditions.push(
      sql`${releasesTable.platforms} @> ARRAY[${platform}]::text[]`
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const base = db
    .select({
      id: releasesTable.id,
      title: releasesTable.title,
      publisherId: releasesTable.publisherId,
      publisherName: publishersTable.name,
      publisherSlug: publishersTable.slug,
      platforms: releasesTable.platforms,
      status: releasesTable.status,
      coverImageUrl: releasesTable.coverImageUrl,
      productUrl: releasesTable.productUrl,
      price: releasesTable.price,
      editionType: releasesTable.editionType,
      preorderCloseDate: releasesTable.preorderCloseDate,
      releaseDate: releasesTable.releaseDate,
      soldOutAt: releasesTable.soldOutAt,
      amazonUrl: releasesTable.amazonUrl,
      firstSeenAt: releasesTable.firstSeenAt,
      createdAt: releasesTable.createdAt,
      updatedAt: releasesTable.updatedAt,
    })
    .from(releasesTable)
    .innerJoin(publishersTable, eq(releasesTable.publisherId, publishersTable.id));

  const ordered = (where ? base.where(where) : base).orderBy(
    status === "sold_out"
      ? desc(releasesTable.soldOutAt)
      : desc(releasesTable.updatedAt)
  );

  const countBase = db
    .select({ count: sql<number>`count(*)::int` })
    .from(releasesTable)
    .innerJoin(publishersTable, eq(releasesTable.publisherId, publishersTable.id));

  const [releases, [{ count: total }]] = await Promise.all([
    ordered.limit(limit).offset(offset),
    where ? countBase.where(where) : countBase,
  ]);

  return { releases, total };
}

type RawRow = Awaited<ReturnType<typeof queryReleases>>["releases"][number];

/** Enrich a DB row with affiliate-aware URLs before sending to the client */
function formatRelease(row: RawRow) {
  return {
    id: row.id,
    title: row.title,
    publisherId: row.publisherId,
    publisherName: row.publisherName,
    publisherSlug: row.publisherSlug,
    platforms: row.platforms,
    status: row.status,
    coverImageUrl: row.coverImageUrl ?? null,
    productUrl: row.productUrl,
    price: row.price ?? null,
    editionType: row.editionType ?? null,
    preorderCloseDate: row.preorderCloseDate ?? null,
    releaseDate: row.releaseDate ?? null,
    soldOutAt: row.soldOutAt?.toISOString() ?? null,
    // Affiliate URLs — built with configured IDs (or plain URLs if IDs not yet set)
    amazonUrl: row.amazonUrl ? buildAmazonUrl(row.amazonUrl) : null,
    ebaySearchUrl: row.status === "sold_out" ? buildEbaySearchUrl(row.title) : null,
    firstSeenAt: row.firstSeenAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/releases", async (req, res): Promise<void> => {
  const parsed = ListReleasesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { status, platform, publisher, search, limit, offset } = parsed.data;
  const { releases, total } = await queryReleases({ status, platform, publisher, search, limit, offset });
  res.json({ releases: releases.map(formatRelease), total });
});

router.get("/releases/available", async (req, res): Promise<void> => {
  const parsed = ListAvailableReleasesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { platform, publisher } = parsed.data;
  const { releases, total } = await queryReleases({ status: "available", platform, publisher });
  res.json({ releases: releases.map(formatRelease), total });
});

router.get("/releases/sold-out", async (req, res): Promise<void> => {
  const parsed = ListSoldOutReleasesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { platform, publisher, limit } = parsed.data;
  const { releases, total } = await queryReleases({ status: "sold_out", platform, publisher, limit });
  res.json({ releases: releases.map(formatRelease), total });
});

router.get("/releases/coming-soon", async (req, res): Promise<void> => {
  const parsed = ListComingSoonReleasesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { platform, publisher } = parsed.data;
  const { releases, total } = await queryReleases({ status: "coming_soon", platform, publisher });
  res.json({ releases: releases.map(formatRelease), total });
});

router.get("/releases/stats", async (_req, res): Promise<void> => {
  const [available, soldOut, comingSoon] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(releasesTable).where(eq(releasesTable.status, "available")),
    db.select({ count: sql<number>`count(*)::int` }).from(releasesTable).where(eq(releasesTable.status, "sold_out")),
    db.select({ count: sql<number>`count(*)::int` }).from(releasesTable).where(eq(releasesTable.status, "coming_soon")),
  ]);

  const total = (available[0].count ?? 0) + (soldOut[0].count ?? 0) + (comingSoon[0].count ?? 0);

  const [lastPub] = await db
    .select({ lastScrapedAt: publishersTable.lastScrapedAt })
    .from(publishersTable)
    .orderBy(desc(publishersTable.lastScrapedAt))
    .limit(1);

  res.json({
    available: available[0].count ?? 0,
    soldOut: soldOut[0].count ?? 0,
    comingSoon: comingSoon[0].count ?? 0,
    totalTracked: total,
    lastUpdated: lastPub?.lastScrapedAt?.toISOString() ?? null,
  });
});

router.get("/releases/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = GetReleaseParams.safeParse({ id: parseInt(raw, 10) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid release ID" });
    return;
  }

  const [row] = await db
    .select({
      id: releasesTable.id,
      title: releasesTable.title,
      publisherId: releasesTable.publisherId,
      publisherName: publishersTable.name,
      publisherSlug: publishersTable.slug,
      platforms: releasesTable.platforms,
      status: releasesTable.status,
      coverImageUrl: releasesTable.coverImageUrl,
      productUrl: releasesTable.productUrl,
      price: releasesTable.price,
      editionType: releasesTable.editionType,
      preorderCloseDate: releasesTable.preorderCloseDate,
      releaseDate: releasesTable.releaseDate,
      soldOutAt: releasesTable.soldOutAt,
      amazonUrl: releasesTable.amazonUrl,
      firstSeenAt: releasesTable.firstSeenAt,
      createdAt: releasesTable.createdAt,
      updatedAt: releasesTable.updatedAt,
    })
    .from(releasesTable)
    .innerJoin(publishersTable, eq(releasesTable.publisherId, publishersTable.id))
    .where(eq(releasesTable.id, parsed.data.id))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Release not found" });
    return;
  }

  res.json(formatRelease(row));
});

export default router;
