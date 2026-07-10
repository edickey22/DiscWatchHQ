/**
 * CatalogGameCard — card for combined TheGamesDB + RAWG catalog results.
 *
 * Handles both data shapes through the unified CatalogGame interface:
 *   - RAWG results: landscape cover art, Metacritic score badge
 *   - TGDB results: portrait boxart, ESRB rating badge
 *   - Merged results: RAWG art + TGDB ESRB (when both sources matched)
 *
 * Exports as both `CatalogGameCard` (canonical name) and the legacy
 * `RawgGameCard` alias so any stale imports don't break.
 */
import { RetailerLinks } from "@/components/RetailerLinks"

export interface CatalogGame {
  id:            string     // "rawg:123" | "tgdb:456"
  source:        "rawg" | "tgdb"
  title:         string
  releaseDate:   string | null
  platforms:     string[]
  coverImageUrl: string | null
  metacritic:    number | null   // RAWG; null for TGDB
  esrbRating:    string | null   // TGDB; null for RAWG
  retailerSearchUrls: {
    ebay: string; amazon: string; gamestop: string; bestbuy: string
  }
}

/** Numeric Metacritic score badge (RAWG source). */
function MetacriticBadge({ score }: { score: number }) {
  const colour =
    score >= 75 ? "bg-primary text-primary-foreground"
    : score >= 50 ? "bg-yellow-500 text-black"
    : "bg-red-500 text-white"
  return (
    <span className={`absolute top-2 right-2 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${colour}`}>
      {score}
    </span>
  )
}

/** ESRB content rating badge (TGDB source). */
function EsrbBadge({ rating }: { rating: string }) {
  const label  = rating.length <= 4 ? rating : rating.charAt(0).toUpperCase()
  const colour =
    rating.startsWith("E")   ? "bg-primary/80 text-primary-foreground"
    : rating === "T"         ? "bg-yellow-500/80 text-black"
    : rating.startsWith("M") ? "bg-orange-600/80 text-white"
    : rating === "AO"        ? "bg-red-600/80 text-white"
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

export function CatalogGameCard({ game }: { game: CatalogGame }) {
  const year = game.releaseDate
    ? new Date(game.releaseDate.replace(/-/g, "/")).getFullYear()
    : null

  return (
    <article className="group bg-card border border-card-border rounded-lg overflow-hidden flex flex-col hover:border-primary/30 transition-colors duration-150">

      {/* Cover image — aspect-video works for both RAWG screenshots and TGDB boxart */}
      <div className="relative aspect-video bg-secondary overflow-hidden flex-shrink-0">
        {game.coverImageUrl ? (
          <img
            src={game.coverImageUrl}
            alt={game.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <CoverPlaceholder />
        )}

        {/* Show Metacritic if available; fall back to ESRB */}
        {game.metacritic !== null
          ? <MetacriticBadge score={game.metacritic} />
          : game.esrbRating !== null
            ? <EsrbBadge rating={game.esrbRating} />
            : null}
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col gap-2 flex-1 min-h-0">

        {/* Title + year */}
        <div>
          <h3 className="font-display font-bold text-[0.82rem] leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors">
            {game.title}
          </h3>
          {year && (
            <span className="text-[10px] font-mono text-muted-foreground/50">{year}</span>
          )}
        </div>

        {/* Platform chips — cap at 4 */}
        {game.platforms.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {game.platforms.slice(0, 4).map(p => (
              <span key={p} className="text-[8px] font-mono uppercase tracking-wide bg-secondary border border-border/50 text-muted-foreground px-1 py-0.5 rounded">
                {p}
              </span>
            ))}
            {game.platforms.length > 4 && (
              <span className="text-[8px] font-mono text-muted-foreground/40 leading-tight py-0.5">
                +{game.platforms.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Retailer buttons — platform-aware (retro = eBay+GameStop only) */}
        <div className="mt-auto">
          <RetailerLinks urls={game.retailerSearchUrls} platforms={game.platforms} />
        </div>
      </div>
    </article>
  )
}

// Legacy alias — keeps any stale RawgGameCard imports from breaking at runtime
export { CatalogGameCard as RawgGameCard }

// Legacy type alias
export type { CatalogGame as RawgGame, CatalogGame as TgdbGame }
