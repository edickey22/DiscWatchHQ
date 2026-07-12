import { Badge } from "@/components/ui/badge"
import { ControllerIcon } from "@/components/ControllerIcon"
import { cn } from "@/lib/utils"
import { ExternalLink } from "lucide-react"

export type ConsoleCondition = "New" | "Used" | "Seller Refurbished"

export interface ConsoleListing {
  title:     string
  price:     number
  url:       string
  imageUrl:  string | null
  condition: ConsoleCondition
}

export interface ConsoleWithListing {
  id:         string
  name:       string
  generation: "current" | "previous" | "retro"
  listing:    ConsoleListing | null
}

const CONDITION_STYLES: Record<ConsoleCondition, string> = {
  "New":                 "bg-primary/15 text-primary border-primary/30",
  "Used":                "bg-secondary text-foreground/80 border-border",
  "Seller Refurbished":  "bg-amber-500/15 text-amber-500 border-amber-500/30",
}

export function ConsoleCard({ console: item }: { console: ConsoleWithListing }) {
  const { name, listing } = item

  return (
    <div className="group relative flex flex-col space-y-3 rounded-lg p-3 bg-card/40 border border-border/40 transition-all hover:bg-card/70 hover:border-border">
      {/* Image */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-muted shadow-sm">
        {listing?.imageUrl ? (
          <img
            src={listing.imageUrl}
            alt={`${name} — ${listing.condition}`}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary">
            <ControllerIcon size={40} className="opacity-20" />
          </div>
        )}

        {/* Condition badge — always visible, never ambiguous */}
        {listing && (
          <div className="absolute top-2 right-2">
            <Badge
              variant="outline"
              className={cn("backdrop-blur-md font-semibold text-[10px] uppercase tracking-wide", CONDITION_STYLES[listing.condition])}
            >
              {listing.condition}
            </Badge>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex flex-col flex-1 space-y-1.5">
        <h3 className="font-display font-bold leading-tight text-foreground group-hover:text-primary transition-colors">
          {name}
        </h3>

        {listing ? (
          <>
            <span className="font-display tabular-nums text-lg font-semibold text-foreground/90">
              ${listing.price.toFixed(2)}
            </span>
            <a
              href={listing.url}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="mt-auto pt-2 inline-flex items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-wider px-3 py-2 hover:bg-primary/90 transition-colors"
            >
              Buy on eBay
              <ExternalLink size={12} />
            </a>
          </>
        ) : (
          <p className="text-xs text-muted-foreground font-mono pt-1">No live listings right now</p>
        )}
      </div>
    </div>
  )
}

export function ConsoleCardSkeleton() {
  return (
    <div className="flex flex-col space-y-3 p-3">
      <div className="aspect-[4/3] w-full animate-pulse rounded-md bg-muted/60" />
      <div className="space-y-2">
        <div className="h-5 w-3/4 animate-pulse rounded bg-muted/60" />
        <div className="h-6 w-1/3 animate-pulse rounded bg-muted/60" />
        <div className="h-8 w-full animate-pulse rounded bg-muted/60 mt-2" />
      </div>
    </div>
  )
}
