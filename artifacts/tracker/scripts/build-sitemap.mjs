/**
 * build-sitemap.mjs
 *
 * Runs after `vite build` to generate /sitemap.xml inside the static output
 * directory (dist/public/). Served directly by the CDN at /sitemap.xml —
 * no /api/ prefix, no Express dependency, always accessible to Googlebot.
 *
 * Reads:
 *   DATABASE_URL   — postgres connection string (same env var used by the API)
 *   REPLIT_DOMAINS — comma-separated deployed domain(s); first is canonical
 *
 * Writes: artifacts/tracker/dist/public/sitemap.xml
 */

import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../dist/public");

// ── Base URL ──────────────────────────────────────────────────────────────────

function getBaseUrl() {
  // SITE_URL takes priority — set this to the canonical production domain,
  // e.g. https://discwatchhq.com, so the sitemap uses the right hostname.
  const siteUrl = process.env.SITE_URL;
  if (siteUrl) {
    return siteUrl.replace(/\/+$/, ""); // strip trailing slash
  }
  // Fallback to Replit's dev tunnel domain (only correct in dev builds).
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) {
    const primary = domains.split(",")[0].trim();
    return `https://${primary}`;
  }
  return "https://localhost";
}

// ── XML helpers ───────────────────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry({ loc, lastmod, changefreq, priority }) {
  const lastmodTag = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "";
  return (
    `\n  <url>` +
    `\n    <loc>${esc(loc)}</loc>` +
    lastmodTag +
    `\n    <changefreq>${changefreq}</changefreq>` +
    `\n    <priority>${priority}</priority>` +
    `\n  </url>`
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const baseUrl = getBaseUrl();
  console.log(`[sitemap] base URL: ${baseUrl}`);

  const entries = [];

  // Static pages
  entries.push(urlEntry({ loc: `${baseUrl}/`,        changefreq: "hourly", priority: "1.0" }));
  entries.push(urlEntry({ loc: `${baseUrl}/games`,   changefreq: "daily",  priority: "0.9" }));
  entries.push(urlEntry({ loc: `${baseUrl}/boutique`,changefreq: "hourly", priority: "0.9" }));
  entries.push(urlEntry({ loc: `${baseUrl}/about`,   changefreq: "monthly", priority: "0.8" }));
  entries.push(urlEntry({ loc: `${baseUrl}/consoles`,changefreq: "daily",  priority: "0.8" }));

  // NOTE: /releases/:id pages are intentionally excluded from the sitemap.
  // Each release page carries <meta name="robots" content="noindex, follow"> so
  // Googlebot removes them from its quality pool. Including them here would send
  // a contradictory signal (sitemap = "index", page = "don't") that Google's
  // quality algorithms treat as a reason to ignore the noindex directive.
  // Release pages remain fully accessible to real visitors; they are simply not
  // submitted for indexing.

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset\n` +
    `  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
    `  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n` +
    `  xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9\n` +
    `    http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">` +
    entries.join("") +
    `\n</urlset>\n`;

  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "sitemap.xml");
  writeFileSync(outPath, xml, "utf-8");
  console.log(`[sitemap] written → ${outPath} (${entries.length} URLs)`);
}

main().catch((err) => {
  console.error("[sitemap] fatal:", err);
  process.exit(1);
});
