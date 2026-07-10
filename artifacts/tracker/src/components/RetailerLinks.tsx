/**
 * RetailerLinks
 *
 * card   — compact 2×2 grid used on RAWG game search results.
 *           No "Search on" label; buttons are the primary action.
 *
 * detail — full-height buy buttons used on individual listing pages.
 *           Designed to drive clicks: each button is a prominent CTA
 *           with the retailer name, an optional live price, and a
 *           clear directional arrow. The lowest confirmed price is
 *           highlighted in primary green.
 */

import { ArrowUpRight } from "lucide-react"

// Mirrors the OpenAPI RetailerPrices schema — updated after codegen.
interface RetailerPrices {
  ebay?: number | null
  amazon?: number | null
}

interface RetailerSearchUrls {
  ebay: string
  amazon: string
  gamestop: string
  bestbuy: string
}

interface RetailerLinksProps {
  urls: RetailerSearchUrls
  prices?: RetailerPrices | null
  variant?: "card" | "detail"
}

const RETAILERS = [
  { key: "gamestop" as const, label: "GameStop" },
  { key: "ebay"     as const, label: "eBay"     },
  { key: "amazon"   as const, label: "Amazon"   },
  { key: "bestbuy"  as const, label: "Best Buy" },
] as const

export function RetailerLinks({ urls, prices, variant = "card" }: RetailerLinksProps) {
  // Collect confirmed prices (number only, skip null/undefined)
  const confirmedPrices: Partial<Record<typeof RETAILERS[number]["key"], number>> = {}
  if (typeof prices?.ebay === "number")   confirmedPrices.ebay   = prices.ebay
  if (typeof prices?.amazon === "number") confirmedPrices.amazon = prices.amazon

  // Which retailer has the single lowest confirmed price?
  let bestKey: typeof RETAILERS[number]["key"] | null = null
  if (Object.keys(confirmedPrices).length > 0) {
    bestKey = (Object.entries(confirmedPrices) as [typeof RETAILERS[number]["key"], number][])
      .reduce((a, b) => (b[1] < a[1] ? b : a))[0]
  }

  if (variant === "detail") {
    // Sort so lowest-priced retailer appears first (top-left) in the grid.
    // Retailers without a confirmed price stay in their original order at the end.
    const sortedRetailers = [...RETAILERS].sort((a, b) => {
      const pa = confirmedPrices[a.key] ?? Infinity
      const pb = confirmedPrices[b.key] ?? Infinity
      return pa - pb
    })

    return (
      <div className="grid grid-cols-2 gap-2.5">
        {sortedRetailers.map(({ key, label }) => {
          const url    = urls[key]
          const price  = confirmedPrices[key] ?? null
          const isBest = key === bestKey

          return (
            <a
              key={key}
              href={url}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={e => e.stopPropagation()}
              className={`
                group relative flex flex-col gap-1.5
                rounded-lg px-4 py-4
                bg-primary hover:bg-primary/90 active:bg-primary/80
                transition-all duration-150
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
                ${isBest && price !== null
                  ? "shadow-[0_0_20px_-4px_hsl(var(--primary)/0.6)] ring-1 ring-primary/40"
                  : "shadow-md"
                }
              `}
            >
              {/* "BEST" pill — only when there's an actual price to compare */}
              {isBest && price !== null && (
                <span className="absolute top-2.5 right-3 text-[8px] font-mono font-bold tracking-[0.12em] uppercase text-primary-foreground/50">
                  BEST
                </span>
              )}

              {/* Retailer name row */}
              <div className="flex items-center justify-between gap-1">
                <span className="font-display font-bold text-[14px] leading-none text-primary-foreground">
                  {label}
                </span>
                <ArrowUpRight
                  size={14}
                  className="shrink-0 text-primary-foreground/60 group-hover:text-primary-foreground
                             group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-150"
                />
              </div>

              {/* Price or search hint */}
              {price !== null ? (
                <span className="font-display tabular-nums font-bold text-[15px] leading-none text-primary-foreground">
                  From ${price.toFixed(2)}
                </span>
              ) : (
                <span className="font-mono text-[10px] leading-none text-primary-foreground/50 group-hover:text-primary-foreground/70 transition-colors">
                  Search →
                </span>
              )}
            </a>
          )
        })}
      </div>
    )
  }

  // ── card variant (RAWG game search results) ────────────────────────────────
  return (
    <div className="pt-2.5 border-t border-border/20">
      <div className="grid grid-cols-2 gap-1.5">
        {RETAILERS.map(({ key, label }) => {
          const url    = urls[key]
          const price  = confirmedPrices[key] ?? null
          const isBest = key === bestKey

          return (
            <a
              key={key}
              href={url}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={e => e.stopPropagation()}
              className={`
                group flex flex-col gap-0.5
                rounded border px-2.5 py-2
                transition-all duration-150
                focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
                ${isBest
                  ? "border-primary/40 bg-primary/10 hover:border-primary/60 hover:bg-primary/15"
                  : "border-border/40 bg-secondary/50 hover:border-border/70 hover:bg-secondary"
                }
              `}
            >
              <span className={`
                font-display font-semibold leading-none truncate text-[10px]
                ${isBest ? "text-primary" : "text-foreground/80"}
              `}>
                {label}
              </span>

              {price !== null ? (
                <span className={`
                  font-mono font-bold leading-none text-[11px]
                  ${isBest ? "text-primary" : "text-primary/80"}
                `}>
                  From ${price.toFixed(2)}
                </span>
              ) : (
                <span className="font-mono leading-none text-muted-foreground/60 group-hover:text-muted-foreground/80 transition-colors text-[9px]">
                  Search →
                </span>
              )}
            </a>
          )
        })}
      </div>
    </div>
  )
}
