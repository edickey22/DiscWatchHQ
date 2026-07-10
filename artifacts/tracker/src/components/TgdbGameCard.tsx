/**
 * TgdbGameCard — compact game card for TheGamesDB-sourced search results.
 *
 * Shows cover boxart, title, release year, platform chip, ESRB rating badge,
 * and the standard 4-retailer affiliate search button grid.
 *
 * NOTE: These are catalog search results, not tracked releases. There is
 * intentionally no availability status or scarcity information — those stay
 * scoped to the boutique-publisher scraper catalog.
 */
import { RetailerLinks } from "@/components/RetailerLinks"

export interface TgdbGame {
  id: number
  title: string
  releaseDate: string | null
  platform: string | null
  coverImageUrl: string | null
  rating: string | null        // ESRB: "E", "E10+", "T", "M", "AO", "RP"
  retailerSearchUrls: {
    ebay: string
    amazon: string
    gamestop: string
    bestbuy: string
  }
}

/** ESRB content rating badge — colour-coded by audience. */
function EsrbBadge({ rating }: { rating: string }) {
  // Normalise — TGDB sometimes returns values like "Everyone", "Teen", etc.
  const label = rating.length <= 3 ? rating : rating.charAt(0).toUpperCase()
  const colour =
    rating.startsWith("E")  ? "bg-primary/80 text-primary-foreground"
    : rating === "T"        ? "bg-yellow-500/80 text-black"
    : rating.startsWith("M") ? "bg-orange-600/80 text-white"
    : rating === "AO"       ? "bg-red-600/80 text-white"
    : "bg-secondary text-muted-foreground"
  return (
    <span
      title={`ESRB Rating: ${rating}`}
      className={`absolute top-2 right-2 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${colour}`}
    >
      {label}
    </span>
  )
}

/** Fallback cover placeholder — faint controller silhouette. */
function CoverPlaceholder() {
  return (
    <div className="w-full h-full flex items-center justify-center text-muted-foreground/15">
      <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" aria-hidden>
        <rect x="2" y="6" width="20" height="9" rx="4" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3" y="12" width="8" height="7" rx="3.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="13" y="12" width="8" height="7" rx="3.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  )
}

export function TgdbGameCard({ game }: { game: TgdbGame }) {
  const year = game.releaseDate
    ? new Date(game.releaseDate.replace(/-/g, "/")).getFullYear()
    : null

  return (
    <article className="group bg-card border border-card-border rounded-lg overflow-hidden flex flex-col hover:border-primary/30 transition-colors duration-150">

      {/* ── Cover image (3:4 portrait aspect for boxart) ── */}
      <div className="relative aspect-[3/4] bg-secondary overflow-hidden flex-shrink-0">
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
        {game.rating && <EsrbBadge rating={game.rating} />}
      </div>

      {/* ── Body ── */}
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

        {/* Platform chip */}
        {game.platform && (
          <div>
            <span className="text-[8px] font-mono uppercase tracking-wide bg-secondary border border-border/50 text-muted-foreground px-1 py-0.5 rounded">
              {game.platform}
            </span>
          </div>
        )}

        {/* Retailer buttons — pushed to bottom of card */}
        <div className="mt-auto">
          <RetailerLinks urls={game.retailerSearchUrls} />
        </div>
      </div>
    </article>
  )
}
