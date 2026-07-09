/**
 * DiscWatchHQ icon mark.
 *
 * Geometry (viewBox 0 0 28 28):
 *   Disc  — dark filled circle, center (12,16) r=11
 *   Rim   — thin lighter reflective arc along upper-left disc edge (~210°→260°)
 *   Hole  — spindle ring + dot in accent color, center (12,16)
 *   Radar — three quarter-circle arcs (NE direction) emanating from the
 *            upper-right disc edge (~315°), decreasing opacity outward
 *
 * All accent-colored elements use `stroke="hsl(var(--primary))"` /
 * `fill="hsl(var(--primary))"` so they inherit the red ↔ green theme toggle.
 */
export function DiscWatchIcon({
  size = 28,
  className,
}: {
  size?: number
  className?: string
}) {
  // Accent colour via CSS variable — inherits the site's theme toggle
  const accent = "hsl(var(--primary))"

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
      {/* ── Disc body ─────────────────────────────────────────────────── */}
      <circle cx="12" cy="16" r="11" fill="#16161f" />

      {/*
        ── Reflective arc (upper-left rim highlight) ───────────────────
        Arc from 210° → 260° on the disc edge.
          210°: (2.47, 10.5)   260°: (10.09, 5.16)
        large-arc=0, sweep=1 traces the short CW path through ~235°.
      */}
      <path
        d="M 2.47 10.5 A 11 11 0 0 1 10.09 5.16"
        stroke="rgba(255,255,255,0.20)"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />

      {/* ── Spindle ring (accent) ──────────────────────────────────────── */}
      <circle
        cx="12"
        cy="16"
        r="3"
        stroke={accent}
        strokeWidth="1.25"
        fill="none"
        opacity="0.9"
      />

      {/* ── Spindle dot (accent) ──────────────────────────────────────── */}
      <circle cx="12" cy="16" r="1.3" fill={accent} />

      {/*
        ── Radar arcs ────────────────────────────────────────────────────
        Origin ≈ disc edge at 315°: (19.78, 8.22) → rounded to (20, 8).
        Each arc is a quarter-circle sweeping CW from 12-o'clock to 3-o'clock
        relative to its centre (20, 8):
          Start  (top)   : (20, 8 − r)
          End    (right) : (20 + r, 8)
          A rx ry 0 0 1  → large-arc=0, sweep=1 (clockwise on screen)
      */}
      {/* Arc 1 — r 2, full opacity */}
      <path
        d="M 20 6 A 2 2 0 0 1 22 8"
        stroke={accent}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="1"
      />
      {/* Arc 2 — r 4.5, medium */}
      <path
        d="M 20 3.5 A 4.5 4.5 0 0 1 24.5 8"
        stroke={accent}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.55"
      />
      {/* Arc 3 — r 7, faint */}
      <path
        d="M 20 1 A 7 7 0 0 1 27 8"
        stroke={accent}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.25"
      />
    </svg>
  )
}
