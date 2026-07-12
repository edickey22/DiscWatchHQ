/**
 * Self-hosted console photos — downloaded from unsplash.com under the
 * Unsplash Standard License (free commercial use, no attribution required
 * for downloaded files; served from our own /consoles static assets rather
 * than hotlinked from Unsplash's CDN).
 *
 * Each entry maps a `ConsoleModel.id` (see api-server's consoleModels.ts)
 * to a real photo that clearly depicts that specific console body. Models
 * without a clean, unambiguous match are intentionally omitted here — the
 * UI falls back to the themed ControllerIcon placeholder for those.
 */
export const CONSOLE_IMAGES: Record<string, string> = {
  "switch-2":    "/consoles/switch-2.jpg",
  "ps5":         "/consoles/ps5.jpg",
  "ps4":         "/consoles/ps4.jpg",
  "xbox-one":    "/consoles/xbox-one.jpg",
  "switch":      "/consoles/switch.jpg",
  "snes":        "/consoles/snes.jpg",
  "genesis":     "/consoles/genesis.jpg",
  "gamecube":    "/consoles/gamecube.jpg",
  "wii":         "/consoles/wii.jpg",
  "ps1":         "/consoles/ps1.jpg",
  "ps2":         "/consoles/ps2.jpg",
  "xbox":        "/consoles/xbox.jpg",
  "gba":         "/consoles/gba.jpg",
}

/** Every self-hosted console photo, for the auto-scrolling hero marquee. */
export const CONSOLE_HERO_IMAGES: string[] = Object.values(CONSOLE_IMAGES)
