/**
 * ControllerIcon — generic modern gamepad silhouette.
 *
 * Geometry (viewBox 0 0 28 28):
 *   Body   — wide rounded rect, x=2 y=7 w=24 h=10 rx=5
 *   Grips  — two rounded rect extensions below body corners (y=14–25)
 *   D-pad  — cross cutout left of centre (dark fill, appears punched out)
 *   Dots   — two face-button circles right of centre (dark fill)
 *
 * All accent shapes use hsl(var(--primary)) so they inherit
 * the site's CSS-variable colour scheme automatically.
 */

const ACCENT = "hsl(var(--primary))"
// Near-black cutout that matches the dark background (0 0% 5%)
const CUTOUT = "#0a0c0a"

export function ControllerIcon({
  size = 28,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* ── Body ─────────────────────────────────────────────────────── */}
      <rect x="2" y="7" width="24" height="10" rx="5" fill={ACCENT} />

      {/* ── Left grip ────────────────────────────────────────────────── */}
      <rect x="3" y="14" width="9" height="11" rx="4.5" fill={ACCENT} />

      {/* ── Right grip ───────────────────────────────────────────────── */}
      <rect x="16" y="14" width="9" height="11" rx="4.5" fill={ACCENT} />

      {/* ── D-pad (cross cutout) — left half of body ─────────────────── */}
      {/* Horizontal bar */}
      <rect x="6" y="11.3" width="5.5" height="1.8" rx="0.5" fill={CUTOUT} />
      {/* Vertical bar */}
      <rect x="8.5" y="9.5" width="1.8" height="5.5" rx="0.5" fill={CUTOUT} />

      {/* ── Face buttons (two dots) — right half of body ─────────────── */}
      <circle cx="18.5" cy="11" r="1.25" fill={CUTOUT} />
      <circle cx="21.2" cy="12.8" r="1.25" fill={CUTOUT} />
    </svg>
  )
}
