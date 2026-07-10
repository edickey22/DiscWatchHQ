/**
 * SEO endpoints — sitemap.xml and robots redirect.
 *
 * GET /sitemap.xml
 *   Dynamic XML sitemap. Queries all releases from the DB so new releases
 *   are reflected within one cache TTL (1 hour). Accessible externally at
 *   /api/sitemap.xml via Replit's path-based reverse proxy.
 *
 *   Priority tiers:
 *     1.0 — home page
 *     0.9 — currently available releases (highest commercial intent)
 *     0.8 — coming-soon releases + browse page
 *     0.5 — sold-out releases (still valuable for secondary-market traffic)
 *
 *   Submit to Google Search Console at:
 *     https://search.google.com/search-console → Sitemaps → enter your URL
 *
 * Base URL derivation
 *   Uses REPLIT_DOMAINS env var (set automatically by Replit) when available,
 *   otherwise falls back to the Host header from the incoming request.
 */

import { Router } from "express";
import { desc } from "drizzle-orm";
import { db, releasesTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

function escapeXml(s: string): string {
  return s
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&apos;")
}

/** Derive the public-facing base URL for this deployment. */
function getBaseUrl(req: import("express").Request): string {
  const replitDomains = process.env.REPLIT_DOMAINS
  if (replitDomains) {
    const primary = replitDomains.split(",")[0].trim()
    return `https://${primary}`
  }
  const host     = req.get("x-forwarded-host") || req.get("host") || "localhost"
  const protocol = req.get("x-forwarded-proto") || req.protocol || "https"
  // Strip the /api path prefix that Replit's proxy prepends
  return `${protocol}://${host}`
}

router.get("/sitemap.xml", async (req, res): Promise<void> => {
  try {
    const baseUrl = getBaseUrl(req)

    const releases = await db
      .select({
        id:        releasesTable.id,
        status:    releasesTable.status,
        updatedAt: releasesTable.updatedAt,
      })
      .from(releasesTable)
      .orderBy(desc(releasesTable.updatedAt))

    const urlEntries: string[] = []

    // ── Static pages ────────────────────────────────────────────────────────
    urlEntries.push(`
  <url>
    <loc>${escapeXml(baseUrl)}/</loc>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>`)

    urlEntries.push(`
  <url>
    <loc>${escapeXml(baseUrl)}/games</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`)

    // ── Release pages ────────────────────────────────────────────────────────
    for (const r of releases) {
      const status    = r.status as string
      const priority  =
        status === "available"   ? "0.9" :
        status === "coming_soon" ? "0.8" : "0.5"
      const changefreq =
        status === "available"   ? "daily"   :
        status === "coming_soon" ? "daily"   : "monthly"
      const lastmod = r.updatedAt instanceof Date
        ? r.updatedAt.toISOString().slice(0, 10)
        : String(r.updatedAt).slice(0, 10)

      urlEntries.push(`
  <url>
    <loc>${escapeXml(baseUrl)}/releases/${r.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`)
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
    http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urlEntries.join("")}
</urlset>`

    res.set("Content-Type", "application/xml; charset=utf-8")
    res.set("Cache-Control", "public, max-age=3600") // 1-hour cache
    res.send(xml)

    logger.debug({ urls: urlEntries.length, baseUrl }, "Sitemap served")
  } catch (err) {
    logger.error({ err }, "Sitemap generation failed")
    res.status(500).send("<?xml version='1.0'?><error>Sitemap unavailable</error>")
  }
})

export default router
