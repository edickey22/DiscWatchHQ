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
 *   they realistically carry no stock for these titles. GameStop
 *   (used/trade-in stock) is the remaining grid retailer; eBay is always
 *   rendered separately (see below) and calls out as the best retro source.
 *
 * eBay Developer Program API License compliance:
 *   eBay Content may not be combined with third-party information to
 *   suggest/model a cross-retailer price comparison. eBay's own live price
 *   is still shown when available (that's just eBay's own real listing
 *   price, which is permitted) — but it is never included in the
 *   GameStop/Amazon/Best Buy "BEST" ranking grid, and it renders in its own
 *   visually distinct block rather than inside the shared comparison grid.
 *   Do not add eBay back into `OTHER_RETAILERS` / the bestKey computation.
 *
 * Strategy guide links (optional):
 *   When guideUrls is provided, a visually secondary "Strategy Guides"
 *   section appears below the main buttons — eBay (used/OOP) and Amazon
 *   (new releases from Prima / Future Press). Styled as ghost buttons in
 *   the detail variant and compact text links in the card variant. These
 *   are plain search links (no eBay price data), so they're unaffected by
 *   the compliance restriction above.
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
  ebay?:     number | null
  amazon?:   number | null
  bestbuy?:  number | null
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

// Non-eBay retailers — the only ones eligible for cross-retailer "BEST"
// comparison. eBay is rendered separately below (see eBaySlot) and is never
// part of this list or its ranking — see the compliance note above.
const OTHER_RETAILERS = [
  { key: "gamestop" as const, label: "GameStop" },
  { key: "amazon"   as const, label: "Amazon"   },
  { key: "bestbuy"  as const, label: "Best Buy" },
] as const

// Retro mode: Amazon/Best Buy realistically carry no stock, so only
// GameStop remains in the comparison grid.
const RETRO_OTHER_RETAILERS = [
  { key: "gamestop" as const, label: "GameStop" },
] as const

// ── Component ─────────────────────────────────────────────────────────────────

export function RetailerLinks({ urls, prices, variant = "card", platforms, guideUrls }: RetailerLinksProps) {
  const retro     = isRetroGame(platforms ?? [])
  const RETAILERS = retro ? RETRO_OTHER_RETAILERS : OTHER_RETAILERS

  const ebayUrl   = urls.ebay
  const ebayPrice = typeof prices?.ebay === "number" ? prices.ebay : null

  // Collect confirmed prices for the non-eBay comparison group only.
  // eBay is intentionally excluded — its price must never be ranked or
  // badged against another retailer's price (eBay API license compliance).
  const confirmedPrices: Partial<Record<typeof OTHER_RETAILERS[number]["key"], number>> = {}
  if (typeof prices?.amazon   === "number") confirmedPrices.amazon   = prices.amazon
  if (typeof prices?.bestbuy  === "number") confirmedPrices.bestbuy  = prices.bestbuy

  // Lowest confirmed price among non-eBay retailers wins the "BEST" badge
  let bestKey: typeof OTHER_RETAILERS[number]["key"] | null = null
  if (Object.keys(confirmedPrices).length > 0) {
    bestKey = (Object.entries(confirmedPrices) as [typeof OTHER_RETAILERS[number]["key"], number][])
      .reduce((a, b) => (b[1] < a[1] ? b : a))[0]
  }

  // ── detail variant ──────────────────────────────────────────────────────────
  if (variant === "detail") {
    // Sort cheapest-priced retailer to the front (eBay excluded — fixed slot)
    const sorted = [...RETAILERS].sort((a, b) => {
      const pa = confirmedPrices[a.key] ?? Infinity
      const pb = confirmedPrices[b.key] ?? Infinity
      return pa - pb
    })

    return (
      <>
        {retro && (
          <p className="text-[10px] font-mono text-primary/95 uppercase tracking-widest mb-2.5">
            Best bets for retro
          </p>
        )}

        {/* ── eBay — its own isolated slot. Shows eBay's own live price
            (permitted) but is never ranked/badged against other retailers'
            prices (eBay API license compliance). ── */}
        <a
          href={ebayUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={e => e.stopPropagation()}
          className="group relative flex items-center justify-between gap-3 rounded-lg px-4 py-3.5 mb-2.5 border border-dashed border-primary/30 bg-secondary/30 hover:bg-secondary/50 hover:border-primary/50 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-display font-bold text-[14px] leading-none text-foreground">
              eBay
            </span>
            {ebayPrice !== null ? (
              <span className="font-display tabular-nums font-bold text-[15px] leading-none text-primary mt-1">
                ${ebayPrice.toFixed(2)}
              </span>
            ) : (
              <span className="font-mono text-[10px] leading-none text-muted-foreground/90 group-hover:text-muted-foreground transition-colors mt-1">
                {retro ? "Best source for retro →" : "Search →"}
              </span>
            )}
          </div>
          <ArrowUpRight
            size={16}
            className="shrink-0 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-150"
          />
        </a>

        <div className="grid gap-2.5 grid-cols-2">
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
                    Search →
                  </span>
                )}
              </a>
            )
          })}
        </div>

        {/* ── Strategy guides — secondary discovery, not a primary CTA ── */}
        {guideUrls && (
          <div className="mt-3 pt-2.5 border-t border-border/15">
            <p className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/90 uppercase tracking-widest mb-2">
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
                <span className="font-mono text-[9px] leading-none text-muted-foreground/90 group-hover:text-muted-foreground transition-colors">
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
                <span className="font-mono text-[9px] leading-none text-muted-foreground/90 group-hover:text-muted-foreground transition-colors">
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
      {/* ── eBay — its own isolated slot, never ranked/badged against other
          retailers (eBay API license compliance). Its own live price
          (when available) is still shown — that part is permitted. ── */}
      <a
        href={ebayUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={e => e.stopPropagation()}
        className="group flex items-center justify-between gap-2 rounded border border-dashed border-primary/25 bg-secondary/20 px-2.5 py-2 mb-1.5 hover:border-primary/40 hover:bg-secondary/40 transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className="font-display font-semibold leading-none truncate text-[10px] text-foreground/80">
          eBay
        </span>
        {ebayPrice !== null ? (
          <span className="font-mono font-bold leading-none text-[11px] text-primary">
            ${ebayPrice.toFixed(2)}
          </span>
        ) : (
          <span className="font-mono leading-none text-muted-foreground/90 group-hover:text-muted-foreground transition-colors text-[9px]">
            {retro ? "Best →" : "Search →"}
          </span>
        )}
      </a>

      <div className="grid gap-1.5 grid-cols-2">
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
                <span className="font-mono leading-none text-muted-foreground/90 group-hover:text-muted-foreground transition-colors text-[9px]">
                  Search →
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
