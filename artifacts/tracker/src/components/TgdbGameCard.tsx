/**
 * CatalogGameCard — card for combined TheGamesDB + RAWG catalog results.
 *
 * Handles both data shapes through the unified CatalogGame interface:
 *   - RAWG results:   landscape cover art, Metacritic score badge
 *   - TGDB results:   portrait boxart, ESRB rating badge, publisher name
 *   - Merged results: RAWG art + TGDB ESRB (when both sources matched)
 *
 * Exports as both `CatalogGameCard` (canonical name) and the legacy
 * `RawgGameCard` alias so any stale imports don't break.
 */
import { useState } from "react"
import { RetailerLinks } from "@/components/RetailerLinks"

export interface CatalogGame {
  id:            string     // "rawg:123" | "tgdb:456"
  source:        "rawg" | "tgdb"
  title:         string
  releaseDate:   string | null
  platforms:     string[]
  genres?:       string[]   // RAWG only; absent for TGDB entries
  coverImageUrl: string | null
  metacritic:    number | null   // RAWG; null for TGDB
  esrbRating:    string | null   // TGDB; null for RAWG
  /** Publisher name resolved from TGDB publisher cache; null for RAWG or unknown */
  publisherName?: string | null
  retailerSearchUrls: {
    ebay: string; amazon: string; gamestop: string; bestbuy: string
  }
  /**
   * Per-platform-qualified search URLs, keyed by platform name (e.g. "Switch").
   * Populated server-side (affiliate IDs never touch the client) so selecting
   * a platform tag can thread it into the outbound search — "Stardew Valley
   * Switch" instead of just "Stardew Valley" — for a more precise result.
   */
  retailerSearchUrlsByPlatform?: Record<string, {
    ebay: string; amazon: string; gamestop: string; bestbuy: string
  }>
  guideSearchUrls?: {
    ebay: string; amazon: string
  }
}

// ── Badges ────────────────────────────────────────────────────────────────────

/** Numeric Metacritic score badge (RAWG source). */
function MetacriticBadge({ score }: { score: number }) {
  const colour =
    score >= 75 ? "bg-primary text-primary-foreground"
    : score >= 50 ? "bg-yellow-500 text-black"
    : "bg-red-500 text-white"
  return (
    <span
      title={`Metacritic: ${score}`}
      className={`absolute top-2 right-2 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${colour}`}
    >
      {score}
    </span>
  )
}

/**
 * ESRB content rating badge (TGDB source).
 * Collapses long strings like "E - Everyone" to their first letter.
 */
function EsrbBadge({ rating }: { rating: string }) {
  // Abbreviate "E - Everyone" → "E", "T - Teen" → "T", etc.
  const label = rating === "Not Rated" ? "NR"
    : rating.includes(" - ") ? rating.split(" - ")[0].trim()
    : rating.length <= 3 ? rating
    : rating.charAt(0).toUpperCase()

  const colour =
    rating.startsWith("E")              ? "bg-primary/80 text-primary-foreground"
    : rating.startsWith("T")           ? "bg-yellow-500/80 text-black"
    : rating.startsWith("M")           ? "bg-orange-600/80 text-white"
    : rating === "AO"                  ? "bg-red-600/80 text-white"
    : "bg-secondary/80 text-muted-foreground"

  return (
    <span
      title={`ESRB Rating: ${rating}`}
      className={`absolute top-2 right-2 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${colour}`}
    >
      {label}
    </span>
  )
}

// ── Placeholder ───────────────────────────────────────────────────────────────

function CoverPlaceholder() {
  return (
    <div className="w-full h-full flex items-center justify-center text-muted-foreground/15">
      <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" aria-hidden>
        <rect x="2" y="6" width="20" height="9" rx="4" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3" y="12" width="8"  height="7" rx="3.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="13" y="12" width="8" height="7" rx="3.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function CatalogGameCard({
  game,
  onClick,
  priority = false,
}: {
  game:    CatalogGame
  onClick?: (game: CatalogGame) => void
  /**
   * Set true for cards in the first visible row of a grid (above the fold on
   * load) so the cover loads eagerly instead of deferring via loading="lazy"
   * + decoding="async". Those two attributes are correct for below-the-fold
   * cards, but on first-row cards they defer paint until well after the rest
   * of the card (title/price/buttons) has already rendered, producing a
   * multi-second blank-box flicker even though the image data is fully
   * downloaded — confirmed via naturalWidth/complete being true while the
   * frame stays unpainted. Eager + sync decode fixes that for the cards
   * visitors see immediately; lazy/async stays the default further down.
   */
  priority?: boolean
}) {
  const year = game.releaseDate
    ? new Date(game.releaseDate.replace(/-/g, "/")).getFullYear()
    : null
  const [imgFailed, setImgFailed] = useState(false)

  // Selected platform tag, if any — threads into the retailer search URLs
  // below so outbound searches are platform-qualified (e.g. "... Switch").
  // No selection = today's default behaviour (unqualified title search).
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null)

  const platformUrls = selectedPlatform
    ? game.retailerSearchUrlsByPlatform?.[selectedPlatform]
    : undefined
  const effectiveRetailerUrls = platformUrls ?? game.retailerSearchUrls

  return (
    <article
      className="group bg-card border border-card-border rounded-lg overflow-hidden flex flex-col hover:border-primary/30 transition-colors duration-150 cursor-pointer"
      onClick={() => onClick?.(game)}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={e => { if (onClick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick(game) } }}
    >

      {/* Cover image */}
      <div className="relative aspect-video bg-secondary overflow-hidden flex-shrink-0">
        {game.coverImageUrl && !imgFailed ? (
          <img
            src={game.coverImageUrl}
            alt={game.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading={priority ? "eager" : "lazy"}
            decoding={priority ? "sync" : "async"}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <CoverPlaceholder />
        )}

        {/* Score/rating badge — Metacritic takes priority over ESRB */}
        {game.metacritic !== null
          ? <MetacriticBadge score={game.metacritic} />
          : game.esrbRating !== null && game.esrbRating !== "Not Rated"
            ? <EsrbBadge rating={game.esrbRating} />
            : null
        }
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col gap-1.5 flex-1 min-h-0">

        {/* Title */}
        <h3 className="font-display font-bold text-[0.82rem] leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors">
          {game.title}
        </h3>

        {/* Publisher + year on the same line */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {game.publisherName && (
            <span className="text-[9px] font-mono text-primary/95 truncate max-w-[120px]">
              {game.publisherName}
            </span>
          )}
          {game.publisherName && year && (
            <span className="text-[9px] text-muted-foreground/30">·</span>
          )}
          {year && (
            <span className="text-[10px] font-mono text-muted-foreground/90">{year}</span>
          )}
        </div>

        {/* Platform chips — cap at 4. Clickable: selecting one narrows the
            retailer searches below to that platform (e.g. "... Switch"). */}
        {game.platforms.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {game.platforms.slice(0, 4).map(p => {
              const isSelected = selectedPlatform === p
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={isSelected}
                  title={isSelected ? `Clear ${p} filter` : `Search retailers for ${game.title} on ${p}`}
                  onClick={e => {
                    e.stopPropagation()
                    setSelectedPlatform(cur => (cur === p ? null : p))
                  }}
                  className={`text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded border transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {p}
                </button>
              )
            })}
            {game.platforms.length > 4 && (
              <span className="text-[10px] font-mono text-muted-foreground/90 leading-tight py-0.5">
                +{game.platforms.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Retailer buttons — platform-aware (retro = eBay + GameStop only).
            Uses the platform-qualified search URLs when a tag above is selected. */}
        <div className="mt-auto pt-1">
          <RetailerLinks urls={effectiveRetailerUrls} platforms={game.platforms} guideUrls={game.guideSearchUrls} />
        </div>
      </div>
    </article>
  )
}

// ── Legacy aliases ────────────────────────────────────────────────────────────

// Keeps any stale imports from breaking at runtime
export { CatalogGameCard as RawgGameCard }
export type { CatalogGame as RawgGame, CatalogGame as TgdbGame }
