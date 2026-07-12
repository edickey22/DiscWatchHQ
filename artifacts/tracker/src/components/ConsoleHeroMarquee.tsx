import { CONSOLE_HERO_IMAGES } from "@/lib/consoleImages"
import { cn } from "@/lib/utils"

/**
 * Auto-scrolling strip of self-hosted console photos, meant to sit behind
 * a page header. Two copies of the image list are rendered back-to-back
 * and the whole strip translates by exactly -50%, so the loop is seamless
 * regardless of how many images are in the list.
 *
 * `speedSeconds` controls a full loop of the doubled strip — pick something
 * slow (60s+) so it reads as ambient motion, not a "look at me" carousel.
 */
export function ConsoleHeroMarquee({
  className,
  speedSeconds = 70,
}: {
  className?: string
  speedSeconds?: number
}) {
  if (CONSOLE_HERO_IMAGES.length === 0) return null

  const track = [...CONSOLE_HERO_IMAGES, ...CONSOLE_HERO_IMAGES]

  return (
    <div className={cn("absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      <div
        className="animate-marquee-scroll flex h-full w-max items-center gap-3 will-change-transform"
        style={{ animationDuration: `${speedSeconds}s` }}
      >
        {track.map((src, i) => (
          <div
            key={`${src}-${i}`}
            className="h-full w-[220px] flex-shrink-0 overflow-hidden rounded-md sm:w-[260px]"
          >
            <img
              src={src}
              alt=""
              className="h-full w-full object-cover grayscale-[15%]"
              loading={i < CONSOLE_HERO_IMAGES.length ? "eager" : "lazy"}
            />
          </div>
        ))}
      </div>

      {/* Dark gradient overlay — keeps header title/text readable at AA contrast */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/85 to-background" />
      <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-background" />
    </div>
  )
}
