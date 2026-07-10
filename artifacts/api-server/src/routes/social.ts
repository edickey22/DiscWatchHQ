/**
 * Social preview asset routes
 * ──────────────────────────────────────────────────────────────────────────────
 * Replit's static file hosting layer injects `cache-control: private` and a
 * `Set-Cookie: GAESA` (GCP session-affinity) header on every response,
 * including static assets. Social-media link-preview crawlers (Twitterbot,
 * facebookexternalhit, Discordbot, etc.) treat `cache-control: private` as
 * "user-specific content" and refuse to display the image in a preview card.
 *
 * Serving the OG image through Express lets us set `cache-control: public`
 * explicitly — Express response headers are not overridden by the platform
 * layer. The crawler sees a clean, publicly-cacheable image response with no
 * session cookie, which is what it needs to generate the preview card.
 *
 * og:image / twitter:image in the HTML shell point to /api/og-image.png so
 * all crawler fetches hit this route.
 */

import { Router } from "express";
import path from "path";
import fs from "fs";

const router = Router();

// Resolve the og-image.png from the tracker's public directory.
// CWD varies by context:
//   production  → project root  (node runs as: node artifacts/api-server/dist/index.mjs)
//   dev         → artifacts/api-server  (pnpm --filter runs from the package dir)
// We probe four candidates in priority order and use the first one that exists.
function resolveOgImagePath(): string {
  const candidates = [
    // Production: built static output, CWD = project root
    path.resolve(process.cwd(), "artifacts/tracker/dist/public/og-image.png"),
    // Dev: source public dir, CWD = project root
    path.resolve(process.cwd(), "artifacts/tracker/public/og-image.png"),
    // Dev: pnpm runs from artifacts/api-server/, so go up one level
    path.resolve(process.cwd(), "../tracker/dist/public/og-image.png"),
    path.resolve(process.cwd(), "../tracker/public/og-image.png"),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[1];
}

const OG_IMAGE_PATH = resolveOgImagePath();

/**
 * GET /api/og-image.png
 *
 * Serves the OG image with public caching headers so social-media crawlers
 * can fetch and cache it for link preview cards.
 */
router.get("/og-image.png", (req, res): void => {
  if (!fs.existsSync(OG_IMAGE_PATH)) {
    res.status(404).json({ error: "og-image not found" });
    return;
  }

  res.set({
    "Content-Type": "image/png",
    // Public + 24-hour TTL. Crawlers respect this and won't reject the image
    // as private/session-specific.
    "Cache-Control": "public, max-age=86400, immutable",
    // Explicit Vary: none so the response is not keyed on request headers
    "Vary": "Accept-Encoding",
  });

  res.sendFile(OG_IMAGE_PATH);
});

export default router;
