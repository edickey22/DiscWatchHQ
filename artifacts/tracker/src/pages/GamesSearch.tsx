/**
 * GamesSearch — Browse the persistent game catalog (TheGamesDB + RAWG).
 *
 * Searches the local catalog_games PostgreSQL table, which is populated by:
 *   1. Organic searches (this page triggers live upserts on cache misses)
 *   2. The startup backfill job (~70 popular franchises seeded from RAWG)
 *
 * Attribution:
 *   - TheGamesDB (courtesy — community-run open database)
 *   - RAWG (required by their free-tier API terms)
 */
import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Search, ChevronLeft, ChevronRight,
  ExternalLink, AlertCircle, Gamepad2,
} from "lucide-react"

import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { CatalogGameCard, type CatalogGame } from "@/components/TgdbGameCard"
import { useDebounce } from "@/hooks/use-debounce"
import { useDocumentHead } from "@/hooks/useDocumentHead"
import { buildCanonicalUrl } from "@/lib/seo"

// ── Types ─────────────────────────────────────────────────────────────────────

interface GameSearchResponse {
  count:    number
  next:     number | null
  previous: number | null
  results:  CatalogGame[]
  sources:  { rawg: boolean; tgdb: boolean }
  empty:    boolean
}

interface PlatformsResponse {
  platforms: { name: string; count: number }[]
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchGames(q: string, page: number, platform: string): Promise<GameSearchResponse> {
  if (!q.trim()) {
    return { count: 0, next: null, previous: null, results: [], sources: { rawg: false, tgdb: false }, empty: true }
  }
  const params = new URLSearchParams({ q, page: String(page) })
  if (platform) params.set("platform", platform)
  const res  = await fetch(`/api/games/search?${params}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
  return data as GameSearchResponse
}

async function fetchPlatforms(): Promise<PlatformsResponse> {
  const res = await fetch("/api/catalog/platforms")
  if (!res.ok) return { platforms: [] }
  return res.json()
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
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 bg-secondary rounded" />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Attribution ───────────────────────────────────────────────────────────────

function CatalogAttribution({ sources }: { sources?: { rawg: boolean; tgdb: boolean } }) {
  const showRawg = sources?.rawg ?? true
  const showTgdb = sources?.tgdb ?? true
  if (!showRawg && !showTgdb) return null
  return (
    <p className="text-xs text-muted-foreground/60 flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span>Game data from</span>
      {showTgdb && (
        <a href="https://thegamesdb.net" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-primary/70 hover:text-primary underline underline-offset-2 transition-colors font-medium">
          TheGamesDB <ExternalLink size={9} />
        </a>
      )}
      {showRawg && showTgdb && <span className="text-muted-foreground/40">&amp;</span>}
      {showRawg && (
        <a href="https://rawg.io" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-primary/70 hover:text-primary underline underline-offset-2 transition-colors font-medium">
          RAWG <ExternalLink size={9} />
        </a>
      )}
    </p>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GamesSearch() {
  const [search, setSearch]     = useState("")
  const [platform, setPlatform] = useState("all")
  const [page, setPage]         = useState(1)
  const debouncedSearch         = useDebounce(search, 400)

  useDocumentHead({
    title:       "Browse Physical Games – Limited Editions & Rare Releases | DiscWatchHQ",
    description: "Search 1,800+ physical video game releases across platforms and generations. Find limited-edition disc games from boutique publishers, compare retailer prices, and track availability.",
    canonical:   buildCanonicalUrl("/games"),
    jsonLd: null,
  })

  useEffect(() => { setPage(1) }, [debouncedSearch, platform])

  const { data, isLoading, error } = useQuery<GameSearchResponse, Error>({
    queryKey:        ["catalog-games", debouncedSearch, page, platform],
    queryFn:         () => fetchGames(debouncedSearch, page, platform === "all" ? "" : platform),
    staleTime:       10 * 60 * 1_000,
    placeholderData: prev => prev,
    enabled:         debouncedSearch.trim().length > 0,
  })

  const { data: platformsData } = useQuery<PlatformsResponse>({
    queryKey:  ["catalog-platforms"],
    queryFn:   fetchPlatforms,
    staleTime: 5 * 60 * 1_000,
  })

  const totalPages   = data?.count ? Math.ceil(data.count / 20) : 0
  const neitherReady = data && !data.sources?.rawg && !data.sources?.tgdb
  const showGrid     = !neitherReady && debouncedSearch.trim().length > 0

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 container mx-auto max-w-6xl px-4 py-8">

        {/* ── Page header ── */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
            <div>
              <h1 className="font-display font-bold text-2xl md:text-3xl text-foreground tracking-tight">
                Browse Games
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                {data?.count && !data.empty
                  ? `${data.count.toLocaleString()} results — click any retailer button to find a copy.`
                  : "Search by title, find affiliate buy links across all major retailers."}
              </p>
            </div>
            <CatalogAttribution sources={data?.sources} />
          </div>

          {/* Search + platform filter row */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none"
                size={15}
              />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`"Zelda", "Final Fantasy", "Halo"…`}
                className="pl-9 bg-card border-card-border"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {platformsData && platformsData.platforms.length > 0 && (
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="w-[140px] bg-card border-card-border">
                  <SelectValue placeholder="All platforms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All platforms</SelectItem>
                  {platformsData.platforms.map(p => (
                    <SelectItem key={p.name} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* ── No sources configured ── */}
        {neitherReady && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="w-12 h-12 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
              <AlertCircle className="text-yellow-500" size={22} />
            </div>
            <div className="space-y-2">
              <h2 className="font-display font-semibold text-foreground">No catalog API keys configured</h2>
              <p className="text-muted-foreground text-sm max-w-md">
                Add one or both to Replit Secrets to enable game search:
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 mt-2">
                <li>
                  <code className="text-[11px] bg-secondary px-1.5 py-0.5 rounded font-mono">RAWG_API_KEY</code>
                  {" — "}
                  <a href="https://rawg.io/apidocs" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">rawg.io/apidocs</a>
                </li>
                <li>
                  <code className="text-[11px] bg-secondary px-1.5 py-0.5 rounded font-mono">TGDB_API_KEY</code>
                  {" — "}
                  <a href="https://thegamesdb.net/forums/viewtopic.php?t=19274" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">thegamesdb.net</a>
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* ── Search prompt (no query yet) ── */}
        {!neitherReady && !debouncedSearch.trim() && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Gamepad2 className="text-primary/60" size={26} />
            </div>
            <div>
              <h2 className="font-display font-semibold text-foreground mb-1">Search the full catalog</h2>
              <p className="text-muted-foreground text-sm max-w-sm">
                Type a game title to search the database across all platforms and generations.
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
            {!isLoading && data?.results.length === 0 && !error && (
              <div className="py-20 text-center">
                <p className="text-muted-foreground">
                  No games found for &ldquo;{debouncedSearch}&rdquo;. Try a different title.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-8">
              {isLoading
                ? Array.from({ length: 20 }).map((_, i) => <GameCardSkeleton key={i} />)
                : data?.results.map(game => (
                    <CatalogGameCard key={game.id} game={game} />
                  ))
              }
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={!data?.previous || isLoading}
                  className="gap-1.5"
                >
                  <ChevronLeft size={14} /> Previous
                </Button>
                <span className="text-sm text-muted-foreground font-mono">
                  Page {page}{totalPages ? ` of ${totalPages.toLocaleString()}` : ""}
                </span>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={!data?.next || isLoading}
                  className="gap-1.5"
                >
                  Next <ChevronRight size={14} />
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      <Footer showCatalogAttribution />
    </div>
  )
}
