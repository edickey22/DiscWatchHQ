import { Badge } from "@/components/ui/badge"
import { ControllerIcon } from "@/components/ControllerIcon"
import { cn } from "@/lib/utils"
import { ExternalLink, Search } from "lucide-react"

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
  /** Static, always-functional eBay search link — used when `listing` is null. */
  searchUrl:  string
}

const GENERATION_LABELS: Record<ConsoleWithListing["generation"], string> = {
  current:  "Current-Gen",
  previous: "Previous-Gen",
  retro:    "Retro",
}

const CONDITION_STYLES: Record<ConsoleCondition, string> = {
  "New":                 "bg-primary/15 text-primary border-primary/30",
  "Used":                "bg-secondary text-foreground/80 border-border",
  "Seller Refurbished":  "bg-amber-500/15 text-amber-500 border-amber-500/30",
}

/**
 * ConsoleCard — renders a live eBay listing when one is available.
 *
 * When `listing` is null (Browse API credentials not configured, or this
 * particular model temporarily has zero qualifying results), this renders
 * a static fallback: themed placeholder icon, name, generation/era badge,
 * and a plain "Search on eBay" link built from the EPN-tagged `searchUrl`
 * (needs only EBAY_CAMPAIGN_ID, already set). No code changes are needed
 * to switch back to live listings later — once EBAY_APP_ID/EBAY_CLIENT_SECRET
 * are set and the Browse API returns a result for this model, `listing`
 * simply stops being null and this component renders the live variant.
 */
export function ConsoleCard({ console: item }: { console: ConsoleWithListing }) {
  const { name, generation, listing, searchUrl } = item

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
            <ControllerIcon size={40} strokeWidth={2.5} className="opacity-45" />
          </div>
        )}

        {/* Condition badge (live) or generation/era badge (fallback) — always visible, never ambiguous */}
        <div className="absolute top-2 right-2">
          {listing ? (
            <Badge
              variant="outline"
              className={cn("backdrop-blur-md font-semibold text-[10px] uppercase tracking-wide", CONDITION_STYLES[listing.condition])}
            >
              {listing.condition}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="backdrop-blur-md font-semibold text-[10px] uppercase tracking-wide bg-secondary/80 text-muted-foreground border-border"
            >
              {GENERATION_LABELS[generation]}
            </Badge>
          )}
        </div>
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
          <>
            <p className="text-xs text-muted-foreground font-mono pt-1">No live listing yet</p>
            <a
              href={searchUrl}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="mt-auto pt-2 inline-flex items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-secondary/40 text-foreground/80 text-xs font-semibold uppercase tracking-wider px-3 py-2 hover:border-primary/50 hover:bg-secondary/60 transition-colors"
            >
              Search on eBay
              <Search size={12} />
            </a>
          </>
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
