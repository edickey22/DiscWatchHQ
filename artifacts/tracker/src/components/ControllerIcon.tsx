/**
 * ControllerIcon — Lucide "gamepad-2" icon (exact path data, verbatim).
 *
 * Source: https://lucide.dev/icons/gamepad-2
 * viewBox: 0 0 24 24
 * Strokes default to hsl(var(--primary)) so they inherit the site's green
 * accent. Pass color="currentColor" when the icon sits inside an element
 * whose text color changes on hover/focus (e.g. an outline button that
 * swaps to a green hover background) so the icon follows suit instead of
 * staying a fixed green that can blend into a green hover state.
 */

const ACCENT = "hsl(var(--primary))"

export function ControllerIcon({
  size = 28,
  className,
  strokeWidth = 2,
  color = ACCENT,
}: {
  size?: number
  className?: string
  /** Defaults to 2 (Lucide standard). Bump for small/low-opacity placeholder uses. */
  strokeWidth?: number
  /** Stroke color. Defaults to the theme's green accent; pass "currentColor" to inherit text color instead. */
  color?: string
} = {}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <line
        x1="6" y1="11" x2="10" y2="11"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      />
      <line
        x1="8" y1="9" x2="8" y2="13"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      />
      <line
        x1="15" y1="12" x2="15.01" y2="12"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      />
      <line
        x1="18" y1="10" x2="18.01" y2="10"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}
