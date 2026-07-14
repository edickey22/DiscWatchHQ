import { Link } from "wouter"
import { Badge } from "@/components/ui/badge"
import { ControllerIcon } from "@/components/ControllerIcon"
import { CONSOLE_IMAGES } from "@/lib/consoleImages"
import { GENERATION_LABELS, GENERATION_BADGE_STYLES, type ConsoleGeneration } from "@/lib/consoleGenerations"
import { ListChecks } from "lucide-react"

export interface ConsoleSummary {
  id:           string
  name:         string
  generation:   ConsoleGeneration
  hasFetched:   boolean
  listingCount: number
}

/**
 * Fills the tile edge-to-edge (object-cover). Starts slightly zoomed in so
 * the crop reads intentional, then zooms back out to reveal more of the
 * frame on hover.
 */
function FramedImage({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="h-full w-full object-cover scale-110 transition-transform duration-500 group-hover:scale-100"
    />
  )
}

/**
 * ConsoleCard — grid-page card. Always shows the curated stock photo (never
 * a live eBay listing image, which could depict the wrong item or a stock
 * photo mismatched to what's actually for sale). Live listings only appear
 * on the console's own detail page, reached via "View Listings" — this
 * keeps the grid fast, junk-proof, and free of any per-card eBay data.
 */
export function ConsoleCard({ console: item }: { console: ConsoleSummary }) {
  const { id, name, generation } = item
  const stockPhoto = CONSOLE_IMAGES[id]

  return (
    <Link
      href={`/consoles/${id}`}
      className="group relative flex flex-col space-y-3 rounded-lg p-3 bg-card/40 border border-border/60 transition-all hover:bg-card/70 hover:border-primary"
    >
      {/* Image */}
      <div className="relative aspect-[5/4] w-full overflow-hidden rounded-md bg-muted shadow-sm">
        {stockPhoto ? (
          <FramedImage src={stockPhoto} alt={name} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary">
            <ControllerIcon size={46} strokeWidth={2.5} className="opacity-45" />
          </div>
        )}

        <div className="absolute top-2 right-2">
          <Badge
            variant="outline"
            className={`backdrop-blur-md font-semibold text-[10px] uppercase tracking-wide shadow-sm ${GENERATION_BADGE_STYLES[generation]}`}
          >
            {GENERATION_LABELS[generation]}
          </Badge>
        </div>
      </div>

      {/* Details */}
      <div className="flex flex-col flex-1 space-y-1.5">
        <h3 className="font-display font-bold leading-tight text-foreground group-hover:text-primary transition-colors">
          {name}
        </h3>

        <span className="mt-auto pt-2 inline-flex items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-wider px-3 py-2 group-hover:bg-primary/90 transition-colors">
          View Listings
          <ListChecks size={12} />
        </span>
      </div>
    </Link>
  )
}

export function ConsoleCardSkeleton() {
  return (
    <div className="flex flex-col space-y-3 p-3">
      <div className="aspect-[5/4] w-full animate-pulse rounded-md bg-muted/60" />
      <div className="space-y-2">
        <div className="h-5 w-3/4 animate-pulse rounded bg-muted/60" />
        <div className="h-8 w-full animate-pulse rounded bg-muted/60 mt-2" />
      </div>
    </div>
  )
}
