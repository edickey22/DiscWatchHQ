/**
 * RawgGameCard — compact game card for RAWG-sourced results.
 *
 * Shows cover art, title, release year, platforms, metacritic score, and
 * the standard 4-retailer affiliate search button grid.
 *
 * NOTE: These are search/browse results, not tracked releases. There is
 * intentionally no availability status or scarcity information — those stay
 * scoped to the boutique publisher scraper catalog.
 */
import { RetailerLinks } from "@/components/RetailerLinks"

export interface RawgGame {
  id: number
  name: string
  released: string | null
  backgroundImage: string | null
  metacritic: number | null
  rating: number
  ratingsCount: number
  platforms: string[]
  genres: string[]
  retailerSearchUrls: {
    ebay: string
    amazon: string
    gamestop: string
    bestbuy: string
  }
}

function MetacriticBadge({ score }: { score: number }) {
  const colour =
    score >= 75 ? "bg-primary text-primary-foreground"
    : score >= 50 ? "bg-yellow-500 text-black"
    : "bg-red-500 text-white"
  return (
    <span className={`absolute top-2 right-2 text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${colour}`}>
      {score}
    </span>
  )
}

export function RawgGameCard({ game }: { game: RawgGame }) {
  const year = game.released ? new Date(game.released).getFullYear() : null

  return (
    <article className="group bg-card border border-card-border rounded-lg overflow-hidden flex flex-col hover:border-primary/30 transition-colors duration-150">

      {/* ── Cover image ── */}
      <div className="relative aspect-video bg-secondary overflow-hidden flex-shrink-0">
        {game.backgroundImage ? (
          <img
            src={game.backgroundImage}
            alt={game.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
            <svg viewBox="0 0 40 28" className="w-10 h-10 fill-current" aria-hidden>
              <rect x="2" y="7" width="36" height="14" rx="7" />
            </svg>
          </div>
        )}
        {game.metacritic !== null && <MetacriticBadge score={game.metacritic} />}
      </div>

      {/* ── Body ── */}
      <div className="p-3 flex flex-col gap-2 flex-1 min-h-0">

        {/* Title + year */}
        <div>
          <h3 className="font-display font-bold text-[0.82rem] leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors">
            {game.name}
          </h3>
          {year && (
            <span className="text-[10px] font-mono text-muted-foreground/50">{year}</span>
          )}
        </div>

        {/* Platform chips — cap at 4 */}
        {game.platforms.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {game.platforms.slice(0, 4).map(p => (
              <span
                key={p}
                className="text-[8px] font-mono uppercase tracking-wide bg-secondary border border-border/50 text-muted-foreground px-1 py-0.5 rounded"
              >
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

        {/* Retailer buttons — pushed to bottom of card */}
        <div className="mt-auto">
          <RetailerLinks urls={game.retailerSearchUrls} />
        </div>
      </div>
    </article>
  )
}
