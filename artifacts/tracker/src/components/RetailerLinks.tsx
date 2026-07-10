/**
 * RetailerLinks
 *
 * card   — compact 2×2 grid on catalog game cards.
 * detail — large solid-green buy buttons on listing detail pages.
 *          The four affiliate buttons are the primary CTA; the publisher's
 *          own link is rendered separately as a secondary text link.
 *
 * Platform-aware retro mode:
 *   When ALL of a game's platforms are in the RETRO_PLATFORMS set
 *   (pre-2010 discontinued hardware), Amazon and Best Buy are hidden —
 *   they realistically carry no stock for these titles. eBay leads (best
 *   source for retro), followed by GameStop (used/trade-in stock).
 *
 * Strategy guide links (optional):
 *   When guideUrls is provided, a visually secondary "Strategy Guides"
 *   section appears below the main buttons — eBay (used/OOP) and Amazon
 *   (new releases from Prima / Future Press). Styled as ghost buttons in
 *   the detail variant and compact text links in the card variant.
 */

import { ArrowUpRight, BookOpen } from "lucide-react"

// ── Retro platform detection ──────────────────────────────────────────────────

/**
 * Platforms that are out-of-production and realistically absent from
 * Amazon/Best Buy new/used inventory. eBay and GameStop are kept.
 */
const RETRO_PLATFORMS = new Set([
  // Nintendo legacy
  "NES", "SNES", "N64", "GameCube", "Game Boy", "GBC", "GBA",
  "Wii", "Wii U", "DS", "3DS",
  // Sony legacy
  "PS1", "PS2", "PS3", "PSP", "PS Vita",
  // Microsoft legacy
  "Xbox", "Xbox 360",
  // Sega
  "Genesis", "Saturn", "Dreamcast", "Game Gear", "Sega CD", "32X",
])

/** True when the game only targets discontinued platforms (hide Amazon/Best Buy). */
function isRetroGame(platforms: string[]): boolean {
  return platforms.length > 0 && platforms.every(p => RETRO_PLATFORMS.has(p))
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RetailerPrices {
  ebay?:   number | null
  amazon?: number | null
}

interface RetailerSearchUrls {
  ebay: string; amazon: string; gamestop: string; bestbuy: string
}

interface GuideSearchUrls {
  ebay: string; amazon: string
}

interface RetailerLinksProps {
  urls:        RetailerSearchUrls
  prices?:     RetailerPrices | null
  variant?:    "card" | "detail"
  /** Game's platform list — used for retro detection. Pass whenever known. */
  platforms?:  string[]
  /** Optional strategy guide search links (eBay + Amazon). */
  guideUrls?:  GuideSearchUrls
}

// All four retailers in default display order
const ALL_RETAILERS = [
  { key: "gamestop" as const, label: "GameStop" },
  { key: "ebay"     as const, label: "eBay"     },
  { key: "amazon"   as const, label: "Amazon"   },
  { key: "bestbuy"  as const, label: "Best Buy" },
] as const

// Retro mode: eBay first (best for retro), then GameStop
const RETRO_RETAILERS = [
  { key: "ebay"     as const, label: "eBay"     },
  { key: "gamestop" as const, label: "GameStop" },
] as const

// ── Component ─────────────────────────────────────────────────────────────────

export function RetailerLinks({ urls, prices, variant = "card", platforms, guideUrls }: RetailerLinksProps) {
  const retro    = isRetroGame(platforms ?? [])
  const RETAILERS = retro ? RETRO_RETAILERS : ALL_RETAILERS

  // Collect confirmed prices (skip null/undefined)
  const confirmedPrices: Partial<Record<typeof ALL_RETAILERS[number]["key"], number>> = {}
  if (typeof prices?.ebay   === "number") confirmedPrices.ebay   = prices.ebay
  if (typeof prices?.amazon === "number") confirmedPrices.amazon = prices.amazon

  // Lowest confirmed price wins the "BEST" badge
  let bestKey: typeof ALL_RETAILERS[number]["key"] | null = null
  if (Object.keys(confirmedPrices).length > 0) {
    bestKey = (Object.entries(confirmedPrices) as [typeof ALL_RETAILERS[number]["key"], number][])
      .reduce((a, b) => (b[1] < a[1] ? b : a))[0]
  }

  // ── detail variant ──────────────────────────────────────────────────────────
  if (variant === "detail") {
    // Sort cheapest-priced retailer to the front
    const sorted = [...RETAILERS].sort((a, b) => {
      const pa = confirmedPrices[a.key] ?? Infinity
      const pb = confirmedPrices[b.key] ?? Infinity
      return pa - pb
    })

    return (
      <>
        {retro && (
          <p className="text-[10px] font-mono text-primary/60 uppercase tracking-widest mb-2.5">
            Best bets for retro
          </p>
        )}
        <div className={`grid gap-2.5 ${retro ? "grid-cols-2" : "grid-cols-2"}`}>
          {sorted.map(({ key, label }) => {
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
                {isBest && price !== null && (
                  <span className="absolute top-2.5 right-3 text-[8px] font-mono font-bold tracking-[0.12em] uppercase text-primary-foreground/50">
                    BEST
                  </span>
                )}
                <div className="flex items-center justify-between gap-1">
                  <span className="font-display font-bold text-[14px] leading-none text-primary-foreground">
                    {label}
                  </span>
                  <ArrowUpRight
                    size={14}
                    className="shrink-0 text-primary-foreground/60 group-hover:text-primary-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-150"
                  />
                </div>
                {price !== null ? (
                  <span className="font-display tabular-nums font-bold text-[15px] leading-none text-primary-foreground">
                    From ${price.toFixed(2)}
                  </span>
                ) : (
                  <span className="font-mono text-[10px] leading-none text-primary-foreground/50 group-hover:text-primary-foreground/70 transition-colors">
                    {retro && key === "ebay" ? "Best source →" : "Search →"}
                  </span>
                )}
              </a>
            )
          })}
        </div>

        {/* ── Strategy guides — secondary discovery, not a primary CTA ── */}
        {guideUrls && (
          <div className="mt-3 pt-2.5 border-t border-border/15">
            <p className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest mb-2">
              <BookOpen size={10} className="opacity-70 shrink-0" />
              Strategy Guides
            </p>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={guideUrls.ebay}
                target="_blank"
                rel="noopener noreferrer sponsored"
                onClick={e => e.stopPropagation()}
                className="group flex flex-col gap-1 rounded border border-border/25 bg-secondary/20 px-3 py-2.5 hover:border-border/50 hover:bg-secondary/40 transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <span className="font-display font-semibold text-[12px] leading-none text-foreground/55 group-hover:text-foreground/80 transition-colors">
                  eBay
                </span>
                <span className="font-mono text-[9px] leading-none text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors">
                  Used / out-of-print →
                </span>
              </a>
              <a
                href={guideUrls.amazon}
                target="_blank"
                rel="noopener noreferrer sponsored"
                onClick={e => e.stopPropagation()}
                className="group flex flex-col gap-1 rounded border border-border/25 bg-secondary/20 px-3 py-2.5 hover:border-border/50 hover:bg-secondary/40 transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <span className="font-display font-semibold text-[12px] leading-none text-foreground/55 group-hover:text-foreground/80 transition-colors">
                  Amazon
                </span>
                <span className="font-mono text-[9px] leading-none text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors">
                  New releases →
                </span>
              </a>
            </div>
          </div>
        )}
      </>
    )
  }

  // ── card variant ────────────────────────────────────────────────────────────
  return (
    <div className="pt-2.5 border-t border-border/20">
      <div className={`grid gap-1.5 ${retro ? "grid-cols-2" : "grid-cols-2"}`}>
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
              <span className={`font-display font-semibold leading-none truncate text-[10px] ${isBest ? "text-primary" : "text-foreground/80"}`}>
                {label}
              </span>
              {price !== null ? (
                <span className={`font-mono font-bold leading-none text-[11px] ${isBest ? "text-primary" : "text-primary/80"}`}>
                  From ${price.toFixed(2)}
                </span>
              ) : (
                <span className="font-mono leading-none text-muted-foreground/60 group-hover:text-muted-foreground/80 transition-colors text-[9px]">
                  {retro && key === "ebay" ? "Best →" : "Search →"}
                </span>
              )}
            </a>
          )
        })}
      </div>

      {/* ── Strategy guides — compact text links, clearly secondary ── */}
      {guideUrls && (
        <div className="mt-1.5 pt-1.5 border-t border-border/15 flex items-center gap-1.5">
          <BookOpen size={8} className="text-muted-foreground/30 shrink-0" />
          <div className="flex items-center gap-1.5 min-w-0">
            <a
              href={guideUrls.ebay}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={e => e.stopPropagation()}
              className="text-[9px] font-mono text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors underline underline-offset-2 decoration-muted-foreground/20 truncate"
            >
              Guide · eBay
            </a>
            <span className="text-muted-foreground/20 text-[8px] shrink-0">·</span>
            <a
              href={guideUrls.amazon}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={e => e.stopPropagation()}
              className="text-[9px] font-mono text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors underline underline-offset-2 decoration-muted-foreground/20 truncate"
            >
              Amazon
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
