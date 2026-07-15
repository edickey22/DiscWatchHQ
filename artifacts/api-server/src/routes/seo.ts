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
 *   Uses SITE_URL env var when set (e.g. "https://discwatchhq.com").
 *   Falls back to https://discwatchhq.com hardcoded — never derives from
 *   REPLIT_DOMAINS, which is always the .replit.app dev subdomain and would
 *   point Google at the wrong domain.
 */

import { Router } from "express";
import { desc } from "drizzle-orm";
import { db, releasesTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { CONSOLE_MODELS } from "../lib/consoleModels";

const router = Router();

function escapeXml(s: string): string {
  return s
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&apos;")
}

/**
 * Return the canonical public-facing base URL.
 *
 * Reads SITE_URL first (set explicitly in Replit Secrets as
 * "https://discwatchhq.com").  Falls back to the hardcoded production domain
 * so the sitemap is always correct even if the secret is missing.
 *
 * We deliberately do NOT derive the domain from REPLIT_DOMAINS or request
 * headers — REPLIT_DOMAINS is always the .replit.app dev subdomain and
 * request Host headers vary by proxy hop, both of which caused the sitemap
 * to emit disc-watch-hq.replit.app URLs instead of discwatchhq.com.
 */
function getBaseUrl(): string {
  return (process.env.SITE_URL ?? "https://discwatchhq.com").replace(/\/$/, "")
}

router.get("/sitemap.xml", async (req, res): Promise<void> => {
  try {
    const baseUrl = getBaseUrl()

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
    <priority>0.9</priority>
  </url>`)

    urlEntries.push(`
  <url>
    <loc>${escapeXml(baseUrl)}/boutique</loc>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>`)

    urlEntries.push(`
  <url>
    <loc>${escapeXml(baseUrl)}/consoles</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`)

    // Individual console pages
    for (const console of CONSOLE_MODELS) {
      urlEntries.push(`
  <url>
    <loc>${escapeXml(baseUrl)}/consoles/${escapeXml(console.slug)}</loc>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`)
    }

    urlEntries.push(`
  <url>
    <loc>${escapeXml(baseUrl)}/games/popular</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`)

    urlEntries.push(`
  <url>
    <loc>${escapeXml(baseUrl)}/games/new-releases</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`)

    urlEntries.push(`
  <url>
    <loc>${escapeXml(baseUrl)}/games/upcoming</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`)

    urlEntries.push(`
  <url>
    <loc>${escapeXml(baseUrl)}/about</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`)

    urlEntries.push(`
  <url>
    <loc>${escapeXml(baseUrl)}/privacy</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>`)

    urlEntries.push(`
  <url>
    <loc>${escapeXml(baseUrl)}/terms</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
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
