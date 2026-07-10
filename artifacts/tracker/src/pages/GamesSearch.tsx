/**
 * GamesSearch — Browse the full game catalog (RAWG + TheGamesDB).
 *
 * Pre-populated sections (no search required):
 *   • Most Popular — top games by Metacritic score, sourced from RAWG
 *   • New & Upcoming — games released in the past 12 months, sourced from RAWG
 *
 * Labelling policy
 * ─────────────────
 * These sections are deliberately labelled as industry-wide data from RAWG,
 * NOT as "trending on DiscWatchHQ". There is no on-site usage data yet to
 * compute genuine site-specific trending metrics. Labels must stay honest
 * until real analytics (page views, click-through, search frequency) exist.
 *
 * TODO: "Trending on DiscWatchHQ" — future section
 *   Replace or supplement the RAWG-sourced sections with on-site trending
 *   once we have enough traffic data. Metrics to track:
 *     - Page views per release/game (daily sliding window)
 *     - Retailer button click-through rates
 *     - Search frequency per title
 *     - Newsletter signups per listing
 *
 * Attribution:
 *   TheGamesDB — community-run open database (courtesy credit)
 *   RAWG       — required by their free-tier API terms
 */

import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "wouter"
import {
  Search, ChevronLeft, ChevronRight,
  ExternalLink, AlertCircle, Star, CalendarDays,
  ChevronDown, ArrowRight,
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
import { GameDetailModal } from "@/components/GameDetailModal"
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

interface PopularResponse {
  results:  CatalogGame[]
  count:    number
  next:     number | null
  previous: number | null
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

async function fetchPopular(): Promise<PopularResponse> {
  // Always request 24 so show-more works without a second network call
  const res = await fetch("/api/games/popular?limit=24")
  if (!res.ok) return { results: [], count: 0, next: null, previous: null }
  return res.json()
}

async function fetchNewReleases(): Promise<PopularResponse> {
  const res = await fetch("/api/games/new-releases?limit=24")
  if (!res.ok) return { results: [], count: 0, next: null, previous: null }
  return res.json()
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

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  label,
  attribution,
}: {
  icon: React.ReactNode
  label: string
  attribution: string
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
      <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2">
        {icon}
        {label}
      </h2>
      <p className="text-[11px] font-mono text-muted-foreground/50 uppercase tracking-wider">
        {attribution}
      </p>
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
      <span>Data from</span>
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
  const [search, setSearch]             = useState("")
  const [platform, setPlatform]         = useState("all")
  const [page, setPage]                 = useState(1)
  const [selectedGame, setSelectedGame] = useState<CatalogGame | null>(null)
  // Show-more state for pre-populated sections (12 → 24)
  const [popularShown, setPopularShown] = useState(12)
  const [newShown,     setNewShown]     = useState(12)
  const debouncedSearch                 = useDebounce(search, 400)
  const isSearching                     = debouncedSearch.trim().length > 0

  useDocumentHead({
    title:       "Browse Games — Physical Releases Across All Platforms | DiscWatchHQ",
    description: "Explore popular games, new releases, and the full physical game catalog across all platforms. Search 2,000+ titles with direct retailer links.",
    canonical:   buildCanonicalUrl("/games"),
    jsonLd:      null,
  })

  useEffect(() => { setPage(1) }, [debouncedSearch, platform])

  // ── Search results (only when actively searching) ──
  const { data: searchData, isLoading: isSearchLoading, error: searchError } =
    useQuery<GameSearchResponse, Error>({
      queryKey:        ["catalog-games", debouncedSearch, page, platform],
      queryFn:         () => fetchGames(debouncedSearch, page, platform === "all" ? "" : platform),
      staleTime:       10 * 60 * 1_000,
      placeholderData: prev => prev,
      enabled:         isSearching,
    })

  // ── Pre-populated sections (always loaded, hidden when searching) ──
  const { data: popularData, isLoading: isPopularLoading } = useQuery<PopularResponse>({
    queryKey:  ["games-popular"],
    queryFn:   fetchPopular,
    staleTime: 30 * 60 * 1_000,
  })

  const { data: newData, isLoading: isNewLoading } = useQuery<PopularResponse>({
    queryKey:  ["games-new-releases"],
    queryFn:   fetchNewReleases,
    staleTime: 30 * 60 * 1_000,
  })

  const { data: platformsData } = useQuery<PlatformsResponse>({
    queryKey:  ["catalog-platforms"],
    queryFn:   fetchPlatforms,
    staleTime: 5 * 60 * 1_000,
  })

  const totalPages   = searchData?.count ? Math.ceil(searchData.count / 20) : 0
  const neitherReady = searchData && !searchData.sources?.rawg && !searchData.sources?.tgdb

  // Pre-populated sections: slice to `shown` count (12 or 24).
  // Grid is max 4 cols so both 12 and 24 always produce complete rows.
  const allPopular       = popularData?.results    ?? []
  const allNew           = newData?.results        ?? []
  const popularCards     = allPopular.slice(0, popularShown)
  const newReleasesCards = allNew.slice(0, newShown)
  const popularTotal     = popularData?.count ?? 0
  const newTotal         = newData?.count     ?? 0

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 container mx-auto max-w-6xl px-4 py-8">

        {/* ── Page header ── */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
            <div>
              <h1 className="font-display font-bold text-2xl md:text-3xl text-foreground tracking-tight">
                Browse Games
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                {isSearching && searchData?.count && !searchData.empty
                  ? `${searchData.count.toLocaleString()} results for "${debouncedSearch}"`
                  : "Popular titles, new releases, and the full game catalog."}
              </p>
            </div>
            {isSearching && <CatalogAttribution sources={searchData?.sources} />}
          </div>

          {/* Search + platform filter */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none"
                size={15}
              />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search by title — "Zelda", "Halo", "Final Fantasy"…`}
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
                    <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            PRE-POPULATED SECTIONS
            Hidden when the user is actively searching. Shown by default so
            the page has real, crawlable content on every load.
        ══════════════════════════════════════════════════════════════════ */}
        {!isSearching && (
          <>
            {/* ── Most Popular ── */}
            <section className="mb-12">
              <SectionHeader
                icon={<Star size={18} className="text-primary" />}
                label="Most Popular"
                attribution="Industry-wide by Metacritic score · RAWG · Not site-specific trending"
              />

              {isPopularLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {Array.from({ length: 12 }).map((_, i) => <GameCardSkeleton key={i} />)}
                </div>
              ) : popularCards.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {popularCards.map(game => (
                      <CatalogGameCard key={game.id} game={game} onClick={setSelectedGame} />
                    ))}
                  </div>

                  {/* Show-more / View-all controls */}
                  <div className="flex items-center justify-between mt-5">
                    {/* "Show 12 more" — only while shown < 24 and more data exists */}
                    {popularShown < 24 && allPopular.length > popularShown ? (
                      <button
                        onClick={() => setPopularShown(Math.min(24, allPopular.length))}
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronDown size={15} />
                        Show {Math.min(12, allPopular.length - popularShown)} more
                      </button>
                    ) : (
                      <span />
                    )}

                    {/* "View all →" — once at 24 or when there are many more in the DB */}
                    {(popularShown >= 24 || popularTotal > 24) && (
                      <Link
                        href="/games/popular"
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                      >
                        View all Most Popular <ArrowRight size={14} />
                      </Link>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Popularity data unavailable — configure a RAWG_API_KEY to enable this section.
                </p>
              )}
            </section>

            {/* ── New & Upcoming ── */}
            <section className="mb-12">
              <SectionHeader
                icon={<CalendarDays size={18} className="text-primary" />}
                label="New & Upcoming"
                attribution="Released in the past 12 months · Sorted by release date · RAWG"
              />

              {isNewLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {Array.from({ length: 12 }).map((_, i) => <GameCardSkeleton key={i} />)}
                </div>
              ) : newReleasesCards.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {newReleasesCards.map(game => (
                      <CatalogGameCard key={game.id} game={game} onClick={setSelectedGame} />
                    ))}
                  </div>

                  <div className="flex items-center justify-between mt-5">
                    {newShown < 24 && allNew.length > newShown ? (
                      <button
                        onClick={() => setNewShown(Math.min(24, allNew.length))}
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronDown size={15} />
                        Show {Math.min(12, allNew.length - newShown)} more
                      </button>
                    ) : (
                      <span />
                    )}

                    {(newShown >= 24 || newTotal > 24) && (
                      <Link
                        href="/games/new-releases"
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                      >
                        View all New &amp; Upcoming <ArrowRight size={14} />
                      </Link>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  New release data unavailable — configure a RAWG_API_KEY to enable this section.
                </p>
              )}
            </section>

            {/*
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              TODO: "Trending on DiscWatchHQ"
              ─────────────────────────────────────────────────────────────
              Replace or augment the sections above with on-site trending
              metrics once real traffic and engagement data are available.

              Placeholder: the two RAWG-sourced sections are honest, useful
              proxies until DiscWatchHQ has enough usage data to compute
              genuine site-specific trends.

              Metrics needed for real trending:
                - Page views per release/game (daily sliding window)
                - Retailer button click-through rates per listing
                - Search frequency per title (query log analysis)
                - Newsletter alert signups per listing

              Implementation ideas once data is available:
                - Materialised view in PostgreSQL updated every hour
                - "Trending this week" sorted by view velocity (views today
                  vs views same day last week)
                - Separate "Rising" section for games gaining search traction
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            */}

            {/* Attribution strip */}
            <div className="border-t border-border/20 pt-4 mb-8">
              <CatalogAttribution sources={{ rawg: true, tgdb: true }} />
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SEARCH RESULTS (active when user types a query)
        ══════════════════════════════════════════════════════════════════ */}

        {/* No sources configured */}
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

        {/* Search error */}
        {searchError && isSearching && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive mb-6">
            <AlertCircle size={16} className="shrink-0" />
            <p className="text-sm">{searchError.message}</p>
          </div>
        )}

        {/* Search results grid */}
        {isSearching && !neitherReady && (
          <>
            {!isSearchLoading && searchData?.results.length === 0 && !searchError && (
              <div className="py-20 text-center">
                <p className="text-muted-foreground">
                  No games found for &ldquo;{debouncedSearch}&rdquo;. Try a different title.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-8">
              {isSearchLoading
                ? Array.from({ length: 20 }).map((_, i) => <GameCardSkeleton key={i} />)
                : searchData?.results.map(game => (
                    <CatalogGameCard key={game.id} game={game} onClick={setSelectedGame} />
                  ))
              }
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={!searchData?.previous || isSearchLoading}
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
                  disabled={!searchData?.next || isSearchLoading}
                  className="gap-1.5"
                >
                  Next <ChevronRight size={14} />
                </Button>
              </div>
            )}
          </>
        )}

      </main>

      <Footer />

      {/* Game detail modal — opens on card click */}
      <GameDetailModal
        game={selectedGame}
        onClose={() => setSelectedGame(null)}
      />
    </div>
  )
}
