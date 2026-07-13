/**
 * Shared generation labels/colors for console tags — used by the grid card
 * badge (ConsoleCard), the detail page hero label (ConsoleDetail), and
 * anywhere else a console's generation needs a consistent color treatment.
 *
 * Current-Gen keeps the primary brand green so it stands out as the newest
 * hardware. Previous-Gen uses blue and Retro uses red so all three
 * generations are visually distinct at a glance, on both the grid and every
 * console's own listing page.
 */
export type ConsoleGeneration = "current" | "previous" | "retro"

export const GENERATION_LABELS: Record<ConsoleGeneration, string> = {
  current:  "Current-Gen",
  previous: "Previous-Gen",
  retro:    "Retro",
}

/** Badge classes (background + text + border) for the grid card's generation tag. */
export const GENERATION_BADGE_STYLES: Record<ConsoleGeneration, string> = {
  current:  "bg-primary text-primary-foreground border-primary/60",
  previous: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  retro:    "bg-destructive/15 text-destructive border-destructive/30",
}

/** Plain text color (no background) for the detail page's generation label. */
export const GENERATION_TEXT_STYLES: Record<ConsoleGeneration, string> = {
  current:  "text-primary",
  previous: "text-blue-400",
  retro:    "text-destructive",
}
