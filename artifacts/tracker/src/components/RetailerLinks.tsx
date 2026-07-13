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

import { ArrowUpRight, BookOpen, ShoppingBag } from "lucide-react"

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

// Per-retailer icon-badge accent (detail variant only) — gives each button
// a distinct identity so the grid isn't a wall of identical green tiles.
// eBay keeps the solid primary-green treatment as the one clear "main" CTA;
// these three read as secondary, equally legitimate options via border +
// icon-color contrast rather than competing for the same green.
const RETAILER_ICON_STYLE: Record<typeof OTHER_RETAILERS[number]["key"], string> = {
  gamestop: "bg-red-500/15 text-red-400",
  amazon:   "bg-orange-500/15 text-orange-400",
  bestbuy:  "bg-blue-500/15 text-blue-400",
}

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

        {/* ── eBay — its own isolated slot, styled with the same solid-fill
            weight as the GameStop/Amazon/Best Buy buttons below so it reads
            as an intentional, equally prominent option — while staying in
            its own row, outside the comparison grid and its "BEST" ranking
            logic (eBay API license compliance, see note above). Shows
            eBay's own live price (permitted) but is never ranked/badged
            against other retailers' prices. ── */}
        <a
          href={ebayUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={e => e.stopPropagation()}
          className="group relative flex items-center justify-between gap-3 rounded-lg px-4 py-3.5 mb-2.5 bg-primary hover:bg-primary/90 active:bg-primary/80 shadow-md transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
              <ShoppingBag size={15} className="text-primary-foreground" />
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="font-display font-bold text-[14px] leading-none text-primary-foreground">
                eBay
              </span>
              {ebayPrice !== null ? (
                <span className="font-display tabular-nums font-bold text-[15px] leading-none text-primary-foreground mt-1">
                  ${ebayPrice.toFixed(2)}
                </span>
              ) : (
                <span className="font-mono text-[10px] leading-none text-primary-foreground/70 mt-1">
                  {retro ? "Best source for retro →" : "Search →"}
                </span>
              )}
            </div>
          </div>
          <ArrowUpRight
            size={16}
            className="shrink-0 text-primary-foreground/70 group-hover:text-primary-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-150"
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
                  group relative flex flex-col gap-2
                  rounded-lg px-4 py-4
                  bg-card border-2
                  transition-all duration-150
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
                  ${isBest && price !== null
                    ? "border-primary/70 shadow-[0_0_16px_-4px_hsl(var(--primary)/0.45)]"
                    : "border-border/70 hover:border-foreground/40 shadow-sm"
                  }
                `}
              >
                {isBest && price !== null && (
                  <span className="absolute top-2.5 right-3 text-[8px] font-mono font-bold tracking-[0.12em] uppercase text-primary">
                    BEST
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${RETAILER_ICON_STYLE[key]}`}>
                    <ShoppingBag size={13} />
                  </span>
                  <span className="font-display font-bold text-[14px] leading-none text-foreground">
                    {label}
                  </span>
                  <ArrowUpRight
                    size={14}
                    className="ml-auto shrink-0 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-150"
                  />
                </div>
                {price !== null ? (
                  <span className="font-display tabular-nums font-bold text-[15px] leading-none text-primary">
                    From ${price.toFixed(2)}
                  </span>
                ) : (
                  <span className="font-mono text-[10px] leading-none text-muted-foreground group-hover:text-foreground/70 transition-colors">
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
      {/* ── eBay — its own isolated slot, styled as a solid-fill button on
          par with the retailer grid below, but kept in its own row outside
          the grid/BEST ranking (eBay API license compliance, see note
          above). Its own live price (when available) is still shown —
          that part is permitted. ── */}
      <a
        href={ebayUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={e => e.stopPropagation()}
        className="group flex items-center justify-between gap-2 rounded bg-primary hover:bg-primary/90 active:bg-primary/80 px-2.5 py-2 mb-1.5 shadow-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <ShoppingBag size={11} className="shrink-0 text-primary-foreground/85" />
          <span className="font-display font-semibold leading-none truncate text-[10px] text-primary-foreground">
            eBay
          </span>
        </span>
        {ebayPrice !== null ? (
          <span className="font-mono font-bold leading-none text-[11px] text-primary-foreground">
            ${ebayPrice.toFixed(2)}
          </span>
        ) : (
          <span className="font-mono leading-none text-primary-foreground/75 group-hover:text-primary-foreground transition-colors text-[9px]">
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

      {/* ── Strategy guides — same button weight as the retailer grid above,
          not plain text, so they don't get missed next to it. ── */}
      {guideUrls && (
        <div className="mt-1.5 pt-1.5 border-t border-border/20">
          <p className="flex items-center gap-1 text-[8px] font-mono text-muted-foreground/70 uppercase tracking-widest mb-1">
            <BookOpen size={8} className="opacity-70 shrink-0" />
            Strategy Guides
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <a
              href={guideUrls.ebay}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={e => e.stopPropagation()}
              className="group flex items-center justify-center gap-1 rounded border border-border/40 bg-secondary/50 hover:border-border/70 hover:bg-secondary px-2 py-1.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <span className="font-display font-semibold leading-none truncate text-[10px] text-foreground/80 group-hover:text-foreground transition-colors">
                Guide · eBay
              </span>
            </a>
            <a
              href={guideUrls.amazon}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={e => e.stopPropagation()}
              className="group flex items-center justify-center gap-1 rounded border border-border/40 bg-secondary/50 hover:border-border/70 hover:bg-secondary px-2 py-1.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <span className="font-display font-semibold leading-none truncate text-[10px] text-foreground/80 group-hover:text-foreground transition-colors">
                Guide · Amazon
              </span>
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
