/**
 * GamesSearch — Browse all games via the RAWG Video Games Database.
 *
 * RAWG attribution (required by free-tier terms):
 *   Data is provided by RAWG (https://rawg.io). An active hyperlink is
 *   displayed wherever RAWG data appears, per the API terms of service.
 */
import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search, ChevronLeft, ChevronRight, ExternalLink, AlertCircle } from "lucide-react"

import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { RawgGameCard, type RawgGame } from "@/components/RawgGameCard"
import { useDebounce } from "@/hooks/use-debounce"

// ── Types ─────────────────────────────────────────────────────────────────────

interface GameSearchResponse {
  count: number
  next: number | null
  previous: number | null
  results: RawgGame[]
  configured: boolean
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchGames(q: string, page: number): Promise<GameSearchResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: "20" })
  if (q) params.set("q", q)
  const res = await fetch(`/api/games/search?${params}`)
  const data = await res.json()
  if (res.status === 503) {
    // RAWG key not configured — return a sentinel instead of throwing
    return { count: 0, next: null, previous: null, results: [], configured: false }
  }
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
  return data as GameSearchResponse
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function GameCardSkeleton() {
  return (
    <div className="bg-card border border-card-border rounded-lg overflow-hidden animate-pulse">
      <div className="aspect-video bg-secondary" />
      <div className="p-3 flex flex-col gap-2">
        <div className="h-4 bg-secondary rounded w-3/4" />
        <div className="h-3 bg-secondary rounded w-1/4" />
        <div className="flex gap-1 mt-1">
          <div className="h-3 w-8 bg-secondary rounded" />
          <div className="h-3 w-8 bg-secondary rounded" />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <div className="h-8 bg-secondary rounded" />
          <div className="h-8 bg-secondary rounded" />
          <div className="h-8 bg-secondary rounded" />
          <div className="h-8 bg-secondary rounded" />
        </div>
      </div>
    </div>
  )
}

// ── Attribution ───────────────────────────────────────────────────────────────

function RawgAttribution({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-muted-foreground/60 flex items-center gap-1.5 ${className}`}>
      Data provided by{" "}
      <a
        href="https://rawg.io"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 text-primary/70 hover:text-primary underline underline-offset-2 transition-colors font-medium"
      >
        RAWG Video Games Database
        <ExternalLink size={10} />
      </a>
    </p>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GamesSearch() {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 400)

  // Reset to page 1 whenever the search query changes
  useEffect(() => { setPage(1) }, [debouncedSearch])

  const { data, isLoading, error } = useQuery<GameSearchResponse, Error>({
    queryKey: ["rawg-games", debouncedSearch, page],
    queryFn: () => fetchGames(debouncedSearch, page),
    staleTime: 10 * 60 * 1_000,
    placeholderData: prev => prev,
  })

  const totalPages = data?.count ? Math.ceil(data.count / 20) : 0

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
                Search{data?.count ? ` ${data.count.toLocaleString()}` : ""} games across all platforms
                — click any title to find it on your preferred retailer.
              </p>
            </div>
            <RawgAttribution />
          </div>

          {/* Search bar */}
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" size={15} />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by title, franchise, or publisher…"
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
              <h2 className="font-display font-semibold text-foreground mb-2">RAWG API Key Required</h2>
              <p className="text-muted-foreground text-sm max-w-md">
                Game search requires a free RAWG API key. Get yours at{" "}
                <a
                  href="https://rawg.io/apidocs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  rawg.io/apidocs
                </a>
                , then add it to Replit Secrets as <code className="text-[11px] bg-secondary px-1 py-0.5 rounded font-mono">RAWG_API_KEY</code>.
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
        {(data?.configured !== false) && (
          <>
            {/* No results */}
            {!isLoading && data?.results.length === 0 && !error && (
              <div className="py-20 text-center">
                <p className="text-muted-foreground">
                  No games found{debouncedSearch ? ` for "${debouncedSearch}"` : ""}. Try a different search.
                </p>
              </div>
            )}

            {/* Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-8">
              {isLoading
                ? Array.from({ length: 20 }).map((_, i) => <GameCardSkeleton key={i} />)
                : data?.results.map(game => <RawgGameCard key={game.id} game={game} />)
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
                  Page {page} of {totalPages.toLocaleString()}
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

      <Footer showRawgAttribution />
    </div>
  )
}
