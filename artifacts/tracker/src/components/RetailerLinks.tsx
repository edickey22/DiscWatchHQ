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
    return (
      <div className="pt-5 mt-1 border-t border-border/30">
        <p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest mb-3">
          Find a copy
        </p>

        <div className="grid grid-cols-2 gap-2">
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
                  group flex items-center justify-between gap-2
                  rounded-lg border px-4 py-3.5
                  transition-all duration-150
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                  ${isBest
                    ? "border-primary/50 bg-primary/10 hover:border-primary hover:bg-primary/15 shadow-[0_0_12px_-4px_hsl(var(--primary)/0.3)]"
                    : "border-border/50 bg-card hover:border-primary/40 hover:bg-secondary"
                  }
                `}
              >
                {/* Left: retailer name + price */}
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className={`
                    font-display font-bold text-[13px] leading-none truncate
                    ${isBest ? "text-primary" : "text-foreground"}
                  `}>
                    {label}
                  </span>
                  {price !== null ? (
                    <span className={`
                      font-display tabular-nums font-bold text-[12px] leading-none
                      ${isBest ? "text-primary" : "text-primary/70"}
                    `}>
                      From ${price.toFixed(2)}
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] leading-none text-muted-foreground/50 group-hover:text-muted-foreground/70 transition-colors">
                      Search
                    </span>
                  )}
                </div>

                {/* Right: arrow icon */}
                <ArrowUpRight
                  size={15}
                  className={`
                    shrink-0 transition-transform duration-150
                    group-hover:translate-x-0.5 group-hover:-translate-y-0.5
                    ${isBest ? "text-primary/70" : "text-muted-foreground/40 group-hover:text-muted-foreground/70"}
                  `}
                />
              </a>
            )
          })}
        </div>
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
