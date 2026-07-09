/**
 * RetailerLinks — compact "Search on X" row shown below every listing.
 *
 * Design intent: secondary, never competing with the primary publisher CTA.
 * All four retailers are always shown; affiliate params are injected server-side.
 * Labels read "Search on X" (not "Buy") because stock at these retailers is unconfirmed.
 */

interface RetailerSearchUrls {
  ebay: string
  amazon: string
  gamestop: string
  bestbuy: string
}

interface RetailerLinksProps {
  urls: RetailerSearchUrls
  /** "card" = ultra-compact inline row for grid cards; "detail" = slightly larger for detail page */
  variant?: "card" | "detail"
}

const RETAILERS = [
  { key: "gamestop" as const, label: "GameStop", color: "hover:text-[#f44336]" },
  { key: "ebay"     as const, label: "eBay",      color: "hover:text-[#e53238]" },
  { key: "amazon"   as const, label: "Amazon",    color: "hover:text-[#FF9900]" },
  { key: "bestbuy"  as const, label: "Best Buy",  color: "hover:text-[#003876]" },
] as const

export function RetailerLinks({ urls, variant = "card" }: RetailerLinksProps) {
  const isCard = variant === "card"

  return (
    <div className={isCard ? "pt-2 border-t border-border/20" : "pt-4 border-t border-border/30"}>
      <p className={`font-mono text-muted-foreground/50 mb-1.5 ${isCard ? "text-[9px]" : "text-[10px]"} uppercase tracking-widest`}>
        Search on
      </p>
      <div className="flex flex-wrap gap-x-2.5 gap-y-1">
        {RETAILERS.map(({ key, label, color }, i) => (
          <span key={key} className="flex items-center gap-2">
            {i > 0 && (
              <span className="text-border/50 select-none" aria-hidden>·</span>
            )}
            <a
              href={urls[key]}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={e => e.stopPropagation()}
              className={`
                text-muted-foreground/60 transition-colors duration-150
                ${color}
                ${isCard ? "text-[11px]" : "text-xs font-medium"}
              `}
            >
              {label}
            </a>
          </span>
        ))}
      </div>
    </div>
  )
}
