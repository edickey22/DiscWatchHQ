/**
 * RetailerLinks — visually prominent "Search on X" buttons below every listing.
 *
 * Layout: 2×2 grid on cards, 2×2 grid on detail page (slightly larger).
 * Price data: when the API provides a real live price for a retailer, the
 * button shows "From $X.XX" in the accent color. Buttons with no confirmed
 * price show a neutral "Search →" label — never a fake price claim.
 * The lowest confirmed price is visually highlighted as the best option.
 */

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
  if (typeof prices?.ebay === "number")    confirmedPrices.ebay    = prices.ebay
  if (typeof prices?.amazon === "number")  confirmedPrices.amazon  = prices.amazon

  // Determine which retailer has the single lowest price (if any)
  let bestKey: typeof RETAILERS[number]["key"] | null = null
  if (Object.keys(confirmedPrices).length > 0) {
    bestKey = (Object.entries(confirmedPrices) as [typeof RETAILERS[number]["key"], number][])
      .reduce((a, b) => (b[1] < a[1] ? b : a))[0]
  }

  const isDetail = variant === "detail"

  return (
    <div className={isDetail ? "pt-4 border-t border-border/30" : "pt-2.5 border-t border-border/20"}>
      {/* Section label */}
      <p className="font-mono text-muted-foreground/50 mb-2 text-[9px] uppercase tracking-widest">
        Search on
      </p>

      {/* 2×2 button grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {RETAILERS.map(({ key, label }) => {
          const url        = urls[key]
          const price      = confirmedPrices[key] ?? null
          const isBest     = key === bestKey
          const hasOthers  = isBest && Object.keys(confirmedPrices).length > 1

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
                ${isDetail ? "py-2.5" : ""}
              `}
            >
              {/* Retailer name row */}
              <span className={`
                font-display font-semibold leading-none truncate
                ${isDetail ? "text-[11px]" : "text-[10px]"}
                ${isBest ? "text-primary" : "text-foreground/80"}
              `}>
                {label}
                {hasOthers && (
                  <span className="ml-1 text-primary/60 font-mono font-normal text-[8px]">
                    +{Object.keys(confirmedPrices).length - 1} more
                  </span>
                )}
              </span>

              {/* Price or search label */}
              {price !== null ? (
                <span className={`
                  font-mono font-bold leading-none
                  ${isDetail ? "text-[13px]" : "text-[11px]"}
                  ${isBest ? "text-primary" : "text-primary/80"}
                `}>
                  From ${price.toFixed(2)}
                </span>
              ) : (
                <span className={`
                  font-mono leading-none text-muted-foreground/60
                  group-hover:text-muted-foreground/80 transition-colors
                  ${isDetail ? "text-[10px]" : "text-[9px]"}
                `}>
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
