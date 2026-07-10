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

import { createRequire } from "module";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../dist/public");

// ── Base URL ──────────────────────────────────────────────────────────────────

function getBaseUrl() {
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) {
    const primary = domains.split(",")[0].trim();
    return `https://${primary}`;
  }
  // Fallback: won't be correct but lets the build succeed locally
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

  // Dynamic release pages — query DB if DATABASE_URL is available
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      // pg is a dependency of @workspace/db — resolve it from there so pnpm
      // hoisting doesn't matter and the path is always correct.
      const dbPkgDir = resolve(__dirname, "../../../lib/db");
      const require = createRequire(resolve(dbPkgDir, "package.json"));
      const { Client } = require("pg");
      const client = new Client({ connectionString: dbUrl });
      await client.connect();

      const { rows } = await client.query(
        `SELECT id, status, updated_at FROM releases ORDER BY updated_at DESC`
      );
      await client.end();

      for (const r of rows) {
        const priority =
          r.status === "available"   ? "0.9" :
          r.status === "coming_soon" ? "0.8" : "0.5";
        const changefreq =
          r.status === "sold_out" ? "monthly" : "daily";
        const lastmod =
          r.updated_at instanceof Date
            ? r.updated_at.toISOString().slice(0, 10)
            : String(r.updated_at).slice(0, 10);

        entries.push(urlEntry({
          loc: `${baseUrl}/releases/${r.id}`,
          lastmod,
          changefreq,
          priority,
        }));
      }

      console.log(`[sitemap] added ${rows.length} release pages`);
    } catch (err) {
      // Non-fatal: static pages still get indexed; releases discovered via crawl
      console.warn(`[sitemap] DB query failed (release pages skipped): ${err.message}`);
    }
  } else {
    console.warn("[sitemap] DATABASE_URL not set — skipping release pages");
  }

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
