/**
 * GamesSearch — Browse mainstream game catalog via TheGamesDB.
 *
 * Powered by TheGamesDB (https://thegamesdb.net), a community-run open
 * video game database. Attribution link shown in header and footer.
 *
 * Results carry affiliate search buttons for GameStop, eBay, Amazon, and
 * Best Buy. No availability/scarcity tracking (stays scoped to boutique
 * publisher scraper catalog).
 */
import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search, ChevronLeft, ChevronRight, ExternalLink, AlertCircle, Gamepad2 } from "lucide-react"

import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { TgdbGameCard, type TgdbGame } from "@/components/TgdbGameCard"
import { useDebounce } from "@/hooks/use-debounce"

// ── Types ─────────────────────────────────────────────────────────────────────

interface GameSearchResponse {
  count: number
  next: number | null
  previous: number | null
  results: TgdbGame[]
  configured: boolean
  empty: boolean
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchGames(q: string, page: number): Promise<GameSearchResponse> {
  if (!q.trim()) {
    return { count: 0, next: null, previous: null, results: [], configured: true, empty: true }
  }
  const params = new URLSearchParams({ q, page: String(page) })
  const res  = await fetch(`/api/games/search?${params}`)
  const data = await res.json()
  if (res.status === 503) {
    return { count: 0, next: null, previous: null, results: [], configured: false, empty: false }
  }
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
  return data as GameSearchResponse
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function GameCardSkeleton() {
  return (
    <div className="bg-card border border-card-border rounded-lg overflow-hidden animate-pulse">
      <div className="aspect-[3/4] bg-secondary" />
      <div className="p-3 flex flex-col gap-2">
        <div className="h-4 bg-secondary rounded w-3/4" />
        <div className="h-3 bg-secondary rounded w-1/4" />
        <div className="h-3 w-10 bg-secondary rounded mt-1" />
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <div className="h-7 bg-secondary rounded" />
          <div className="h-7 bg-secondary rounded" />
          <div className="h-7 bg-secondary rounded" />
          <div className="h-7 bg-secondary rounded" />
        </div>
      </div>
    </div>
  )
}

// ── Attribution ───────────────────────────────────────────────────────────────

function TgdbAttribution({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-muted-foreground/60 flex items-center gap-1.5 ${className}`}>
      Game data from{" "}
      <a
        href="https://thegamesdb.net"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 text-primary/70 hover:text-primary underline underline-offset-2 transition-colors font-medium"
      >
        TheGamesDB
        <ExternalLink size={10} />
      </a>
      {" "}— community-run open game database
    </p>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GamesSearch() {
  const [search, setSearch] = useState("")
  const [page, setPage]     = useState(1)
  const debouncedSearch     = useDebounce(search, 400)

  // Reset to page 1 whenever the search query changes
  useEffect(() => { setPage(1) }, [debouncedSearch])

  const { data, isLoading, error } = useQuery<GameSearchResponse, Error>({
    queryKey:        ["tgdb-games", debouncedSearch, page],
    queryFn:         () => fetchGames(debouncedSearch, page),
    staleTime:       10 * 60 * 1_000,
    placeholderData: prev => prev,
    // Don't fire the query until the user types something
    enabled:         debouncedSearch.trim().length > 0 || page > 1,
  })

  const totalPages = data?.count ? Math.ceil(data.count / 20) : 0
  const showGrid   = data?.configured !== false && debouncedSearch.trim().length > 0

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 container mx-auto max-w-6xl px-4 py-8">

        {/* ── Page header ── */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
            <div>
              <h1 className="font-display font-bold text-2xl md:text-3xl text-foreground tracking-tight">
                Browse Games
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                {data?.count
                  ? `${data.count.toLocaleString()} results — click any title to find it at a retailer.`
                  : "Search mainstream franchises by title — Mario, Zelda, Final Fantasy, and more."}
              </p>
            </div>
            <TgdbAttribution />
          </div>

          {/* Search bar */}
          <div className="relative max-w-xl">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none"
              size={15}
            />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search by title, e.g. "Zelda", "Final Fantasy", "Halo"…`}
              className="pl-9 bg-card border-card-border"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        {/* ── Not configured ── */}
        {data?.configured === false && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="w-12 h-12 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
              <AlertCircle className="text-yellow-500" size={22} />
            </div>
            <div>
              <h2 className="font-display font-semibold text-foreground mb-2">TheGamesDB API Key Required</h2>
              <p className="text-muted-foreground text-sm max-w-md">
                Game search requires a free TheGamesDB API key. Request yours at{" "}
                <a
                  href="https://thegamesdb.net/forums/viewtopic.php?t=19274"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  thegamesdb.net
                </a>
                , then add it to Replit Secrets as{" "}
                <code className="text-[11px] bg-secondary px-1 py-0.5 rounded font-mono">TGDB_API_KEY</code>.
              </p>
            </div>
          </div>
        )}

        {/* ── Search prompt (no query entered yet) ── */}
        {data?.configured !== false && !debouncedSearch.trim() && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Gamepad2 className="text-primary/60" size={26} />
            </div>
            <div>
              <h2 className="font-display font-semibold text-foreground mb-1">Search the full catalog</h2>
              <p className="text-muted-foreground text-sm max-w-sm">
                Type a game title above to search hundreds of thousands of titles
                across all platforms and generations.
              </p>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive mb-6">
            <AlertCircle size={16} className="shrink-0" />
            <p className="text-sm">{error.message}</p>
          </div>
        )}

        {/* ── Results grid ── */}
        {showGrid && (
          <>
            {/* No results */}
            {!isLoading && data?.results.length === 0 && !error && (
              <div className="py-20 text-center">
                <p className="text-muted-foreground">
                  No games found for &ldquo;{debouncedSearch}&rdquo;. Try a different title.
                </p>
              </div>
            )}

            {/* Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-8">
              {isLoading
                ? Array.from({ length: 20 }).map((_, i) => <GameCardSkeleton key={i} />)
                : data?.results.map(game => <TgdbGameCard key={`${game.id}-${game.platform}`} game={game} />)
              }
            </div>

            {/* ── Pagination ── */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={!data?.previous || isLoading}
                  className="gap-1.5"
                >
                  <ChevronLeft size={14} />
                  Previous
                </Button>

                <span className="text-sm text-muted-foreground font-mono">
                  Page {page}{totalPages ? ` of ${totalPages.toLocaleString()}` : ""}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={!data?.next || isLoading}
                  className="gap-1.5"
                >
                  Next
                  <ChevronRight size={14} />
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      <Footer showTgdbAttribution />
    </div>
  )
}
