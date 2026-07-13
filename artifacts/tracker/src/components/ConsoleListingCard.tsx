import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ExternalLink, Gavel } from "lucide-react"

export type ConsoleCondition = "New" | "Used" | "Seller Refurbished"

export interface ConsoleListing {
  title:      string
  price:      number
  url:        string
  imageUrl:   string | null
  condition:  ConsoleCondition
  isAuction:  boolean
  bidCount?:  number
  endsAt?:    number | null
}

function formatTimeLeft(endsAt: number): string | null {
  const ms = endsAt - Date.now()
  if (ms <= 0) return null
  const hours = ms / 3_600_000
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))}m left`
  if (hours < 24) return `${Math.round(hours)}h left`
  return `${Math.round(hours / 24)}d left`
}

// Solid (opaque) fills to match the generation tag bubbles elsewhere on the
// site — translucent badges over busy listing photos were hard to read.
// Each condition/state gets its own distinct hue: New = brand green,
// Used = orange, Seller Refurbished = amber, Auction = violet.
const CONDITION_STYLES: Record<ConsoleCondition, string> = {
  "New":                "bg-primary text-primary-foreground border-primary/60",
  "Used":               "bg-orange-500 text-white border-orange-600/60",
  "Seller Refurbished": "bg-amber-500 text-white border-amber-600/60",
}

/**
 * One live eBay listing tile on a console's detail page. The `url` is
 * already EPN-tagged server-side (applyEbayEpnParams, applied when the
 * listing was fetched by the scheduler) — this component just renders it.
 */
export function ConsoleListingCard({ listing }: { listing: ConsoleListing }) {
  return (
    <div className="group flex flex-col space-y-3 rounded-lg p-3 bg-card/40 border border-border/40 transition-all hover:bg-card/70 hover:border-border">
      <a
        href={listing.url}
        target="_blank"
        rel="noopener noreferrer sponsored"
        aria-label={`View "${listing.title}" on eBay`}
        className="relative block aspect-[5/4] w-full overflow-hidden rounded-md bg-muted shadow-sm"
      >
        {listing.imageUrl ? (
          <img
            src={listing.imageUrl}
            alt={listing.title}
            loading="lazy"
            className="h-full w-full object-cover scale-110 transition-transform duration-500 group-hover:scale-100"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary text-muted-foreground text-xs font-mono">
            No image
          </div>
        )}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          <Badge
            variant="outline"
            className={cn("backdrop-blur-md font-semibold text-[10px] uppercase tracking-wide", CONDITION_STYLES[listing.condition])}
          >
            {listing.condition}
          </Badge>
          {listing.isAuction && (
            <Badge
              variant="outline"
              className="font-semibold text-[10px] uppercase tracking-wide bg-violet-600 text-white border-violet-400/50 shadow-sm gap-1"
            >
              <Gavel size={10} />
              Auction
            </Badge>
          )}
        </div>
      </a>

      <div className="flex flex-col flex-1 space-y-1.5">
        <p className="text-sm text-foreground/90 leading-snug line-clamp-2" title={listing.title}>
          {listing.title}
        </p>
        <span className="font-display tabular-nums text-lg font-semibold text-foreground/90">
          ${listing.price.toFixed(2)}
        </span>
        {listing.isAuction && (
          <span className="inline-flex w-fit items-center gap-1 text-sm font-semibold font-mono text-violet-300">
            <Gavel size={13} className="shrink-0" />
            {listing.bidCount ? `${listing.bidCount} bid${listing.bidCount === 1 ? "" : "s"}` : "No bids yet"}
            {listing.endsAt && formatTimeLeft(listing.endsAt) ? ` · ${formatTimeLeft(listing.endsAt)}` : ""}
          </span>
        )}
        <a
          href={listing.url}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="mt-auto pt-2 inline-flex items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-wider px-3 py-2 hover:bg-primary/90 transition-colors"
        >
          {listing.isAuction ? "Current bid" : "Buy on eBay"}
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  )
}

export function ConsoleListingCardSkeleton() {
  return (
    <div className="flex flex-col space-y-3 p-3">
      <div className="aspect-[5/4] w-full animate-pulse rounded-md bg-muted/60" />
      <div className="space-y-2">
        <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
        <div className="h-6 w-1/3 animate-pulse rounded bg-muted/60" />
        <div className="h-8 w-full animate-pulse rounded bg-muted/60 mt-2" />
      </div>
    </div>
  )
}
