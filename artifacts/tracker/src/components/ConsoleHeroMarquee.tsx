import { CONSOLE_HERO_IMAGES } from "@/lib/consoleImages"
import { HeroMarquee } from "@/components/HeroMarquee"

/**
 * Consoles-page hero — self-hosted console photos scrolling behind the
 * page title. Thin wrapper around the generic `HeroMarquee` so this file
 * (and its existing imports elsewhere) keep working unchanged.
 */
export function ConsoleHeroMarquee({
  className,
  speedSeconds = 70,
}: {
  className?: string
  speedSeconds?: number
}) {
  return <HeroMarquee images={CONSOLE_HERO_IMAGES} className={className} speedSeconds={speedSeconds} />
}
