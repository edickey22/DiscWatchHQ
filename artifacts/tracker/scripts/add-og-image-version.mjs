/**
 * add-og-image-version.mjs
 *
 * Runs after `vite build`. Appends a content-hash query param (?v=<hash>)
 * to the og:image / twitter:image URLs in the built index.html so the
 * OG image URL changes whenever og-image.png itself changes.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Social crawlers (Twitterbot, facebookexternalhit, Discordbot, etc.) cache
 * a link-preview image per exact URL, separately from — and often much
 * longer-lived than — their page-text cache. Because /api/og-image.png was
 * always the same URL, a crawler that ever saw a bad/failed fetch for it
 * (e.g. during a bad deploy) could keep serving that failure indefinitely,
 * even after the page's title/description cache was busted (e.g. via a
 * manual ?ref= query trick). A stable URL has no way to signal "this is a
 * new image" to the crawler.
 *
 * Hashing the actual file content means the URL only changes when the
 * image itself changes — no manual busting required, and repeated builds
 * with an unchanged image keep the same URL (good for crawler-side caching
 * of the *correct* image).
 *
 * Writes: rewrites dist/public/index.html in place.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { createHash } from "crypto";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../dist/public");
const imagePath = resolve(outDir, "og-image.png");
const htmlPath = resolve(outDir, "index.html");

function main() {
  if (!existsSync(imagePath)) {
    console.warn(`[og-image-version] ${imagePath} not found — skipping`);
    return;
  }
  if (!existsSync(htmlPath)) {
    console.warn(`[og-image-version] ${htmlPath} not found — skipping`);
    return;
  }

  const bytes = readFileSync(imagePath);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);

  let html = readFileSync(htmlPath, "utf-8");

  // Match both og:image and twitter:image meta tags pointing at og-image.png,
  // regardless of attribute order, and (re)write their query string to ?v=<hash>.
  const before = html;
  html = html.replace(
    /(<meta\s+(?:property|name)="(?:og:image|twitter:image)"\s+content=")([^"]*?og-image\.png)(?:\?[^"]*)?(")/g,
    (_match, pre, urlBase, post) => `${pre}${urlBase}?v=${hash}${post}`,
  );

  if (html === before) {
    console.warn("[og-image-version] no og:image/twitter:image meta tags matched — index.html unchanged");
    return;
  }

  writeFileSync(htmlPath, html, "utf-8");
  console.log(`[og-image-version] og-image.png hash ${hash} → index.html updated`);
}

main();
