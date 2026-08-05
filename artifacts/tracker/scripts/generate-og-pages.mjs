/**
 * generate-og-pages.mjs
 *
 * Runs after `vite build` + `add-og-image-version.mjs` as the final build step.
 *
 * ── Problem ───────────────────────────────────────────────────────────────────
 * Social crawlers (Twitterbot, facebookexternalhit, Discordbot, etc.) do NOT
 * execute JavaScript. DiscWatchHQ is a client-rendered React SPA, so every
 * route — /games, /boutique, /consoles, /consoles/ps5, etc. — is served the
 * same root index.html, which only carries the global DiscWatchHQ og:image.
 * Crawlers therefore show the same preview card for every shared link,
 * regardless of which page is being promoted.
 *
 * ── Solution ──────────────────────────────────────────────────────────────────
 * Generate a per-route subdirectory index.html at build time, with route-
 * specific og:title / og:description / og:image / twitter:image meta tags.
 * Static servers try directory indexes before the SPA fallback:
 *   GET /consoles  →  dist/public/consoles/index.html  ← crawler sees this ✓
 *   GET /consoles/ps5  →  dist/public/consoles/ps5/index.html  ✓
 * Regular app navigation still works: the same HTML boots the React app, which
 * renders the correct page via client-side routing.
 *
 * Runs AFTER add-og-image-version.mjs so the base HTML already has the
 * content-hashed og-image.png URL (inherited by routes that keep the default
 * image, like /about).
 *
 * ── Image sources ─────────────────────────────────────────────────────────────
 *   /og-image.png              : DiscWatchHQ wordmark card (homepage + about)
 *   /consoles/{id}.jpg         : Per-console product photos
 *                                Source: Unsplash Standard License (free)
 *   /images/card-consoles.jpg  : Consoles hub + wii-u fallback
 *                                Source: Unsplash Standard License (free)
 *   /images/og-boutique.jpg    : Boutique Tracker page
 *                                Source: Unsplash photo-1553931122-eb3db723739f
 *                                License: Unsplash Standard License (free, not Unsplash+)
 *                                Content: physical game cases on a shelf —
 *                                no specific publisher box art or readable titles
 *   /images/og-games.jpg       : Browse Games page
 *                                Source: Unsplash photo-1550745165-9bc0b252726f
 *                                License: Unsplash Standard License (free, not Unsplash+)
 *                                Content: vintage game console + joystick —
 *                                no brand markings, logos, or copyrighted characters
 *
 * ── Copyright guardrails ──────────────────────────────────────────────────────
 *   • No platform-holder logos or trademarked artwork at hub/category level.
 *   • All Unsplash images use the standard free license (images.unsplash.com/
 *     photo-*) — no Unsplash+ premium images (plus.unsplash.com/premium_photo-).
 *   • No photos featuring recognizable copyrighted characters (Mario, Pikachu,
 *     etc.) used for hub-level og:image.
 *   • These rules apply to hub pages; individual game detail pages that display
 *     that game's own cover art are a separate, already-reviewed situation.
 */

import { createRequire } from "module";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir    = resolve(__dirname, "../dist/public");
const BASE_URL  = "https://discwatchhq.com";

// ── Console model data ────────────────────────────────────────────────────────
// Mirrors api-server/src/lib/consoleModels.ts — keep in sync when adding models.

const CONSOLE_MODELS = [
  { id: "switch-2",      name: "Nintendo Switch 2"     },
  { id: "ps5-pro",       name: "PlayStation 5 Pro"     },
  { id: "ps5",           name: "PlayStation 5"         },
  { id: "xbox-series-x", name: "Xbox Series X"         },
  { id: "xbox-series-s", name: "Xbox Series S"         },
  { id: "switch-oled",   name: "Nintendo Switch OLED"  },
  { id: "switch-lite",   name: "Nintendo Switch Lite"  },
  { id: "steam-deck",    name: "Steam Deck"            },
  { id: "ps4",           name: "PlayStation 4"         },
  { id: "xbox-one",      name: "Xbox One"              },
  { id: "switch",        name: "Nintendo Switch"       },
  { id: "n64",           name: "Nintendo 64"           },
  { id: "snes",          name: "Super Nintendo"        },
  { id: "genesis",       name: "Sega Genesis"          },
  { id: "dreamcast",     name: "Sega Dreamcast"        },
  { id: "gamecube",      name: "Nintendo GameCube"     },
  { id: "wii",           name: "Nintendo Wii"          },
  { id: "wii-u",         name: "Wii U"                 },  // no dedicated photo; falls back to hub image
  { id: "ps1",           name: "PlayStation"           },
  { id: "ps2",           name: "PlayStation 2"         },
  { id: "ps3",           name: "PlayStation 3"         },
  { id: "xbox-360",      name: "Xbox 360"              },
  { id: "xbox",          name: "Xbox"                  },
  { id: "gba",           name: "Game Boy Advance"      },
  { id: "3ds",           name: "Nintendo 3DS"          },
  { id: "ds",            name: "Nintendo DS"           },
];

// Console IDs that have dedicated product photos in /public/consoles/
// wii-u is intentionally absent — no dedicated photo; falls back to hub image.
const CONSOLE_PHOTO_IDS = new Set([
  "switch-2", "ps5-pro", "ps5", "ps4", "xbox-series-x", "xbox-series-s",
  "switch-oled", "switch-lite", "steam-deck", "xbox-one", "switch",
  "snes", "genesis", "gamecube", "wii", "ps1", "ps2", "xbox",
  "gba", "n64", "3ds", "ds", "ps3", "dreamcast", "xbox-360",
]);

const CONSOLES_HUB_IMAGE = `${BASE_URL}/images/card-consoles.jpg`;

// ── Route manifest ────────────────────────────────────────────────────────────
// path:      relative to dist/public/ — a directory index.html is written here
// url:       canonical absolute URL used for og:url and <link rel="canonical">
// title:     page <title> and og:title / twitter:title
// description: og:description / twitter:description / meta description
// image:     absolute og:image URL; null → keep the hashed og-image.png from base HTML
// imageAlt:  og:image:alt / twitter:image:alt

function buildRoutes() {
  return [
    // ── About ─────────────────────────────────────────────────────────────────
    {
      path: "about",
      url:  `${BASE_URL}/about`,
      title:       "About — DiscWatchHQ",
      description: "DiscWatchHQ tracks physical video game releases from Limited Run Games, Strictly Limited Games, iam8bit, Super Rare Games, and more — and lets you compare prices across GameStop, Amazon, eBay, and Best Buy.",
      image:    null, // inherit hashed og-image.png from base index.html
      imageAlt: null,
    },

    // ── Browse Games ──────────────────────────────────────────────────────────
    {
      path: "games",
      url:  `${BASE_URL}/games`,
      title:       "Browse Games — DiscWatchHQ",
      description: "Search 900,000+ physical video games across every platform. Compare prices on GameStop, Amazon, eBay, and Best Buy instantly.",
      image:    `${BASE_URL}/images/og-games.jpg`,
      imageAlt: "Retro video game console — Browse physical games on DiscWatchHQ",
    },

    // ── Boutique Tracker ──────────────────────────────────────────────────────
    {
      path: "boutique",
      url:  `${BASE_URL}/boutique`,
      title:       "Boutique Tracker — DiscWatchHQ",
      description: "Track limited-run physical game releases from boutique publishers: Limited Run Games, Strictly Limited Games, iam8bit, Super Rare Games, Fangamer, and more. Never miss a window.",
      image:    `${BASE_URL}/images/og-boutique.jpg`,
      imageAlt: "Physical game cases on a shelf — Boutique Tracker on DiscWatchHQ",
    },

    // ── Consoles hub ──────────────────────────────────────────────────────────
    {
      path: "consoles",
      url:  `${BASE_URL}/consoles`,
      title:       "Console Listings — DiscWatchHQ",
      description: "Shop live eBay listings for current and retro gaming consoles — PS5, Xbox Series X, Nintendo Switch, Nintendo 64, Sega Dreamcast, and more. Filtered for condition, sorted by price.",
      image:    CONSOLES_HUB_IMAGE,
      imageAlt: "Gaming consoles on display — DiscWatchHQ Console Listings",
    },

    // ── Privacy Policy ────────────────────────────────────────────────────────
    {
      path: "privacy",
      url:  `${BASE_URL}/privacy`,
      title:       "Privacy Policy — DiscWatchHQ",
      description: "How DiscWatchHQ collects and uses data: account email, tracked items, session cookies, Google AdSense, and affiliate links to GameStop, Amazon, eBay, and Best Buy.",
      image:    null,
      imageAlt: null,
    },

    // ── Terms of Service ──────────────────────────────────────────────────────
    {
      path: "terms",
      url:  `${BASE_URL}/terms`,
      title:       "Terms of Service — DiscWatchHQ",
      description: "Terms of Service for DiscWatchHQ: what the site does, affiliate disclosures, accounts, accuracy disclaimers, trademark notices, and how to contact us.",
      image:    null,
      imageAlt: null,
    },

    // ── Tracking / Watchlist ──────────────────────────────────────────────────
    {
      path: "tracking",
      url:  `${BASE_URL}/tracking`,
      title:       "My Watchlist — DiscWatchHQ",
      description: "Your tracked games, releases, and consoles on DiscWatchHQ. Get notified when limited-run releases change status.",
      image:    null,
      imageAlt: null,
    },

    // ── Profile ───────────────────────────────────────────────────────────────
    {
      path: "profile",
      url:  `${BASE_URL}/profile`,
      title:       "My Profile — DiscWatchHQ",
      description: "Manage your DiscWatchHQ account, alert preferences, and tracked items.",
      image:    null,
      imageAlt: null,
    },

    // ── Individual console detail pages ───────────────────────────────────────
    ...CONSOLE_MODELS.map(({ id, name }) => ({
      path: `consoles/${id}`,
      url:  `${BASE_URL}/consoles/${id}`,
      title:       `${name} Listings — DiscWatchHQ`,
      description: `Shop live eBay listings for the ${name}. Sorted by price, filtered by condition. Find the best deal on a ${name} console today.`,
      image:    CONSOLE_PHOTO_IDS.has(id)
        ? `${BASE_URL}/consoles/${id}.jpg`
        : CONSOLES_HUB_IMAGE,
      imageAlt: `${name} console — DiscWatchHQ`,
    })),
  ];
}

// ── Meta injection ────────────────────────────────────────────────────────────

/** Escape special characters for use in a HTML attribute value. */
function escAttr(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Replace the `content` attribute of a single <meta> tag.
 * Handles both `property="…"` (og:*) and `name="…"` (twitter:*, description)
 * attribute forms, and tolerates any amount of whitespace between attributes.
 *
 * attrKey  : "property" | "name"
 * attrVal  : e.g. "og:title" | "twitter:image"
 * newContent: replacement string (will be HTML-escaped)
 */
function replaceMeta(html, attrKey, attrVal, newContent) {
  // Escape regex special chars in attrVal (handles ":" cleanly)
  const esc = attrVal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re  = new RegExp(
    `(<meta\\s+${attrKey}="${esc}"[^>]*?\\s+content=")[^"]*("(?:\\s*/?>)?)`,
    "g",
  );
  return html.replace(re, `$1${escAttr(newContent)}$2`);
}

/**
 * Inject route-specific meta values into a copy of the base index.html.
 * Fields with null values are left untouched (inheriting from base HTML).
 */
function injectMeta(baseHtml, meta) {
  let h = baseHtml;

  // <title>
  h = h.replace(/<title>[^<]*<\/title>/, `<title>${escAttr(meta.title)}</title>`);

  // <meta name="description">
  h = h.replace(
    /(<meta\s+name="description"\s+content=")[^"]*(")/,
    `$1${escAttr(meta.description)}$2`,
  );

  // og: tags
  h = replaceMeta(h, "property", "og:title",       meta.title);
  h = replaceMeta(h, "property", "og:description",  meta.description);
  h = replaceMeta(h, "property", "og:url",          meta.url);

  if (meta.image != null) {
    h = replaceMeta(h, "property", "og:image",      meta.image);
    h = replaceMeta(h, "property", "og:image:alt",  meta.imageAlt);
    h = replaceMeta(h, "name",     "twitter:image",     meta.image);
    h = replaceMeta(h, "name",     "twitter:image:alt", meta.imageAlt);
  }

  // twitter: tags (title + description always; image only when provided above)
  h = replaceMeta(h, "name", "twitter:title",       meta.title);
  h = replaceMeta(h, "name", "twitter:description",  meta.description);

  // <link rel="canonical">
  h = h.replace(
    /(<link\s+rel="canonical"\s+href=")[^"]*(")/,
    `$1${escAttr(meta.url)}$2`,
  );

  return h;
}

// ── Noindex injection ─────────────────────────────────────────────────────────

/**
 * Replace the robots meta tag content with "noindex, follow".
 * index.html ships with <meta name="robots" content="index, follow" />.
 * This swaps only that tag's content value so release pages are excluded
 * from Google's indexing pool — and from AdSense quality evaluation —
 * while remaining fully accessible to real visitors.
 */
function injectNoindex(html) {
  return html.replace(
    /(<meta\s+name="robots"\s+content=")[^"]*(")/,
    '$1noindex, follow$2',
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const htmlPath = resolve(outDir, "index.html");
  if (!existsSync(htmlPath)) {
    console.error(`[generate-og-pages] ERROR: ${htmlPath} not found — run vite build first`);
    process.exit(1);
  }

  const baseHtml = readFileSync(htmlPath, "utf-8");
  const routes   = buildRoutes();
  let generated  = 0;

  for (const route of routes) {
    const dir     = resolve(outDir, route.path);
    const outFile = resolve(dir, "index.html");

    mkdirSync(dir, { recursive: true });

    const html = injectMeta(baseHtml, route);
    writeFileSync(outFile, html, "utf-8");

    const imageLabel = route.image
      ? route.image.replace(BASE_URL, "")
      : "(inherited og-image.png)";
    console.log(`[generate-og-pages] /${route.path.padEnd(22)} → ${imageLabel}`);
    generated++;
  }

  // ── Release pages — noindex static shells ──────────────────────────────────
  // /releases/:id pages are database product records with no editorial writing.
  // They're thin by Google's definition and drag down the site's sitewide
  // content-quality score. We generate a static HTML shell for each release
  // with <meta name="robots" content="noindex, follow"> so Googlebot removes
  // them from its indexing pool and AdSense quality evaluation, while the
  // pages remain fully live and functional for real visitors.
  //
  // Uses the same DB query pattern as build-sitemap.mjs.
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const dbPkgDir = resolve(__dirname, "../../../lib/db");
      const require  = createRequire(resolve(dbPkgDir, "package.json"));
      const { Client } = require("pg");
      const client = new Client({ connectionString: dbUrl });
      await client.connect();

      let rows;
      try {
        ({ rows } = await client.query(
          `SELECT id FROM releases ORDER BY id`
        ));
      } finally {
        await client.end();
      }

      for (const r of rows) {
        const routePath = `releases/${r.id}`;
        const dir       = resolve(outDir, routePath);
        const outFile   = resolve(dir, "index.html");

        mkdirSync(dir, { recursive: true });

        // Start from the base HTML, inject canonical URL + noindex.
        // We deliberately do NOT inject release-specific og:title/description
        // here — that content is handled client-side by ReleaseDetail.tsx for
        // real visitors. The only goal of this file is the noindex signal.
        const canonicalUrl = `${BASE_URL}/releases/${r.id}`;
        let html = baseHtml.replace(
          /(<link\s+rel="canonical"\s+href=")[^"]*(")/,
          `$1${canonicalUrl}$2`,
        );
        html = injectNoindex(html);

        writeFileSync(outFile, html, "utf-8");
      }

      console.log(`[generate-og-pages] ✓ ${rows.length} release pages written with noindex`);
      generated += rows.length;
    } catch (err) {
      // Non-fatal: if DB is unavailable during build, skip release shells.
      // Release pages will still be served from the SPA fallback (index.html)
      // which carries "index, follow" — worse than noindex but not broken.
      console.warn(`[generate-og-pages] release noindex skipped (DB unavailable): ${err.message}`);
    }
  } else {
    console.warn("[generate-og-pages] DATABASE_URL not set — skipping release noindex pages");
  }

  console.log(`\n[generate-og-pages] ✓ ${generated} total HTML files written to ${outDir}`);
}

main().catch((err) => {
  console.error("[generate-og-pages] fatal:", err);
  process.exit(1);
});
