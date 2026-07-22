/**
 * generate-og-image.mjs
 *
 * Regenerates public/og-image.png — the default social share card for the
 * DiscWatchHQ homepage (and About page, which inherits it).
 *
 * Design system:
 *   - 1200×630 px (exact — required by og:image:width/height meta tags)
 *   - Background: near-black #080e09 with a green radial glow
 *   - Controller: Lucide gamepad-2 outline, green #21b557
 *   - Wordmark: "DiscWatch" in white + "HQ" in a green rounded badge
 *   - Tagline: in green, Space Grotesk Bold
 *   - Subtext: retailer list, muted
 *
 * Requires: ImageMagick 7 (magick), librsvg (SVG renderer, rsvg-convert)
 * Fonts: Space Grotesk Bold 700 TTF downloaded from Google Fonts / fontsource
 *
 * Usage:
 *   node scripts/generate-og-image.mjs
 *
 * Called during initial setup or whenever branding/tagline changes.
 * NOT part of the normal `pnpm build` pipeline — run manually when needed.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outFile   = resolve(__dirname, "../public/og-image.png");
const tmpDir    = "/tmp/og-gen";

// ── Colours ───────────────────────────────────────────────────────────────────
const BG_COLOR    = "#080e09";
const GREEN       = "#21b557";
const WHITE       = "#ffffff";
const MUTED       = "#4d5e4f";

// ── Font setup ────────────────────────────────────────────────────────────────
// Download Space Grotesk Bold 700 TTF (31 KB) if not already cached.
const FONT_PATH = `${tmpDir}/SpaceGrotesk-Bold.ttf`;

function ensureFont() {
  if (existsSync(FONT_PATH)) return;
  console.log("[og-image] downloading Space Grotesk Bold TTF…");
  execSync(
    `curl -sL "https://gwfh.mranftl.com/api/fonts/space-grotesk?download=zip&subsets=latin&variants=700&formats=ttf" -o "${tmpDir}/sg.zip"`,
  );
  execSync(`unzip -o "${tmpDir}/sg.zip" -d "${tmpDir}/sg-unzipped"`);
  const ttf = execSync(`find "${tmpDir}/sg-unzipped" -name "*.ttf"`).toString().trim();
  if (!ttf) throw new Error("Space Grotesk TTF not found in zip");
  execSync(`cp "${ttf}" "${FONT_PATH}"`);
  console.log("[og-image] font ready →", FONT_PATH);
}

// ── SVG template ──────────────────────────────────────────────────────────────
/**
 * All measurements in pixels at the final 1200×630 canvas.
 *
 * Layout (vertical):
 *   y=50   controller icon top (200×200)
 *   y=250  controller icon bottom
 *   y=295  "DiscWatch HQ" baseline
 *   y=355  tagline baseline
 *   y=400  subtext baseline
 */
function buildSvg(fontBase64) {
  // Lucide gamepad-2 (24×24 viewBox) — colour applied at group level.
  // Nested <svg> with explicit width/height lets viewBox units stay as-is;
  // stroke-width is in those units so must be scaled down proportionally:
  //   desired_px / (width_px / viewBox_w) = desired_px * viewBox_w / width_px
  //   3px stroke on 200px icon = 3 * 24 / 200 = 0.36
  const controllerSvg = `
    <svg x="500" y="50" width="200" height="200" viewBox="0 0 24 24"
         xmlns="http://www.w3.org/2000/svg">
      <g stroke="${GREEN}" stroke-width="0.38" stroke-linecap="round"
         stroke-linejoin="round" fill="none">
        <!-- D-pad -->
        <line x1="6" y1="11" x2="10" y2="11"/>
        <line x1="8" y1="9"  x2="8"  y2="13"/>
        <!-- Controller body -->
        <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152
                 C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1
                 l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586
                 L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3
                 c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151
                 A4 4 0 0 0 17.32 5z"/>
        <!-- Face buttons (filled circles) -->
        <circle cx="15" cy="12" r="0.65" fill="${GREEN}" stroke="none"/>
        <circle cx="18" cy="10" r="0.65" fill="${GREEN}" stroke="none"/>
      </g>
    </svg>`;

  // "DiscWatch" (white) + "HQ" badge (green rounded rect + white text).
  //
  // Font metrics at 80px Space Grotesk Bold (measured via ImageMagick):
  //   "DiscWatch"  = 401px wide
  //   badge         = 80px wide, 42px tall, rx=9
  //   gap           = 14px
  //   total group   = 401 + 14 + 80 = 495px
  //   left edge     = 600 - 495/2 = 353
  //
  // "DiscWatch" text-anchor="start" → x=353
  // badge rect → x = 353+401+14 = 768
  // "HQ" centred → x = 768+40 = 808
  const wordmarkGroup = `
    <g>
      <text x="353" y="298"
            font-family="SpaceGrotesk, 'Space Grotesk', sans-serif"
            font-weight="700" font-size="80" fill="${WHITE}"
            text-anchor="start" dominant-baseline="auto">DiscWatch</text>
      <rect x="768" y="260" width="80" height="42" rx="9" fill="${GREEN}"/>
      <text x="808" y="294"
            font-family="SpaceGrotesk, 'Space Grotesk', sans-serif"
            font-weight="700" font-size="24" fill="${WHITE}"
            text-anchor="middle" dominant-baseline="auto">HQ</text>
    </g>`;

  // Tagline — all caps, Space Grotesk Bold, green.
  // "EVERY GAME. EVERY DROP. BEST PRICE." ≈ 38px → check width fits 1200px.
  const tagline = `
    <text x="600" y="356"
          font-family="SpaceGrotesk, 'Space Grotesk', sans-serif"
          font-weight="700" font-size="38" fill="${GREEN}"
          text-anchor="middle" dominant-baseline="auto"
          letter-spacing="0.5">EVERY GAME. EVERY DROP. BEST PRICE.</text>`;

  // Subtext — muted, smaller.
  const subtext = `
    <text x="600" y="403"
          font-family="SpaceGrotesk, 'Space Grotesk', sans-serif"
          font-weight="400" font-size="20" fill="${MUTED}"
          text-anchor="middle" dominant-baseline="auto"
          letter-spacing="0.3">Physical game catalog · GameStop · Amazon · eBay · Best Buy</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630"
     xmlns="http://www.w3.org/2000/svg">

  <defs>
    <style>
      @font-face {
        font-family: 'SpaceGrotesk';
        src: url('data:font/truetype;base64,${fontBase64}') format('truetype');
        font-weight: 700;
        font-style: normal;
      }
    </style>

    <!-- Radial glow centred slightly above mid-height -->
    <radialGradient id="glow" cx="50%" cy="40%" r="52%"
                    gradientUnits="objectBoundingBox">
      <stop offset="0%"   stop-color="${GREEN}" stop-opacity="0.28"/>
      <stop offset="60%"  stop-color="${GREEN}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${GREEN}" stop-opacity="0"/>
    </radialGradient>

    <!-- Subtle vignette darkening the edges -->
    <radialGradient id="vignette" cx="50%" cy="50%" r="70%"
                    gradientUnits="objectBoundingBox">
      <stop offset="0%"   stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.45"/>
    </radialGradient>
  </defs>

  <!-- ── Background ─────────────────────────────────────────────────────── -->
  <rect width="1200" height="630" fill="${BG_COLOR}"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <!-- ── Controller icon ───────────────────────────────────────────────── -->
  ${controllerSvg}

  <!-- ── Wordmark ──────────────────────────────────────────────────────── -->
  ${wordmarkGroup}

  <!-- ── Tagline ───────────────────────────────────────────────────────── -->
  ${tagline}

  <!-- ── Subtext ───────────────────────────────────────────────────────── -->
  ${subtext}

  <!-- ── Vignette (on top of everything to unify edges) ────────────────── -->
  <rect width="1200" height="630" fill="url(#vignette)"/>
</svg>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
mkdirSync(tmpDir, { recursive: true });

// 1. Ensure font is available
ensureFont();

// 2. Base64-encode the font for embedding
const fontBase64 = readFileSync(FONT_PATH).toString("base64");

// 3. Build SVG
const svg = buildSvg(fontBase64);

// 4. Write SVG to temp file
const svgPath = `${tmpDir}/og-image.svg`;
writeFileSync(svgPath, svg, "utf-8");
console.log("[og-image] SVG written →", svgPath);

// 5. Rasterize with magick (uses librsvg) at exactly 1200×630
//    -density 96 matches screen DPI; -background none preserves transparency
//    before the final PNG flatten.
execSync(
  `magick -density 96 -background "${BG_COLOR}" "${svgPath}" ` +
  `-resize 1200x630! -depth 8 "${outFile}"`,
  { stdio: "inherit" },
);

// 6. Verify output dimensions
const dims = execSync(`identify -format "%wx%h" "${outFile}"`).toString().trim();
if (dims !== "1200x630") {
  throw new Error(`[og-image] DIMENSION MISMATCH — got ${dims}, expected 1200x630`);
}

console.log(`\n[og-image] ✓ ${outFile}`);
console.log(`[og-image] ✓ dimensions verified: ${dims}`);
