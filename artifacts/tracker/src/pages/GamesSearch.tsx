/**
 * GamesSearch — Browse the full game catalog (RAWG + TheGamesDB).
 *
 * Filter bar:
 *   Row 1 — Search by title
 *   Row 2 — Platform · Genre · Era · Sort By  (+ active-filter count / clear)
 *
 * Modes:
 *   Browse (no query, but filter(s) active) — shows filtered DB results
 *   Search (query typed)                    — live RAWG + TGDB + DB results
 *   Default (nothing active)                — pre-populated Most Popular + Recently Released + Upcoming
 *
 * Pre-populated sections are deliberately labelled as industry-wide data from RAWG,
 * NOT as "trending on DiscWatchHQ". Real on-site trending requires analytics data
 * (page views, click-throughs, search frequency) that don't yet exist.
 *
 * Attribution:
 *   TheGamesDB — community-run open database (courtesy credit)
 *   RAWG       — required by their free-tier API terms
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "wouter"
import {
  Search, ChevronLeft, ChevronRight,
  ExternalLink, AlertCircle, Star, CalendarDays,
  ArrowRight, X, SlidersHorizontal,
} from "lucide-react"
import { trackSearchEvent } from "@/lib/analytics"

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
import { HeroMarquee } from "@/components/HeroMarquee"
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

interface GenresResponse {
  genres: { name: string; count: number }[]
}

// ── Era filter — decade quick picks ──────────────────────────────────────────

const ERA_OPTIONS = [
  { value: "all",   label: "All eras" },
  { value: "pre90", label: "Classic (pre-1990)" },
  { value: "90s",   label: "90s  (1990–1999)" },
  { value: "2000s", label: "2000s (2000–2009)" },
  { value: "2010s", label: "2010s (2010–2019)" },
  { value: "2020s", label: "2020s+" },
] as const

type EraValue = (typeof ERA_OPTIONS)[number]["value"]

function eraToYears(era: EraValue): { yearFrom: string; yearTo: string } {
  switch (era) {
    case "pre90":  return { yearFrom: "",     yearTo: "1989" }
    case "90s":    return { yearFrom: "1990", yearTo: "1999" }
    case "2000s":  return { yearFrom: "2000", yearTo: "2009" }
    case "2010s":  return { yearFrom: "2010", yearTo: "2019" }
    case "2020s":  return { yearFrom: "2020", yearTo: "" }
    default:       return { yearFrom: "",     yearTo: "" }
  }
}

// ── Sort options ──────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: "best_rated", label: "Best Rated" },
  { value: "newest",     label: "Newest First" },
  { value: "oldest",     label: "Oldest First" },
  { value: "alpha",      label: "A → Z" },
] as const

type SortValue = (typeof SORT_OPTIONS)[number]["value"]

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchGames(
  q: string,
  page: number,
  platform: string,
  genre: string,
  era: EraValue,
  sort: SortValue,
): Promise<GameSearchResponse> {
  const { yearFrom, yearTo } = eraToYears(era)
  const hasFilters = !!(platform || genre || yearFrom || yearTo)

  if (!q.trim() && !hasFilters) {
    return { count: 0, next: null, previous: null, results: [], sources: { rawg: false, tgdb: false }, empty: true }
  }

  const params = new URLSearchParams({ page: String(page), sort })
  if (q.trim())  params.set("q",        q.trim())
  if (platform)  params.set("platform", platform)
  if (genre)     params.set("genre",    genre)
  if (yearFrom)  params.set("yearFrom", yearFrom)
  if (yearTo)    params.set("yearTo",   yearTo)

  const res  = await fetch(`/api/games/search?${params}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
  return data as GameSearchResponse
}

async function fetchPopular(): Promise<PopularResponse> {
  const res = await fetch("/api/games/popular?limit=24")
  if (!res.ok) return { results: [], count: 0, next: null, previous: null }
  return res.json()
}

async function fetchNewReleases(): Promise<PopularResponse> {
  const res = await fetch("/api/games/new-releases?limit=24")
  if (!res.ok) return { results: [], count: 0, next: null, previous: null }
  return res.json()
}

async function fetchUpcoming(): Promise<PopularResponse> {
  const res = await fetch("/api/games/upcoming?limit=24")
  if (!res.ok) return { results: [], count: 0, next: null, previous: null }
  return res.json()
}

async function fetchPlatforms(): Promise<PlatformsResponse> {
  const res = await fetch("/api/catalog/platforms")
  if (!res.ok) return { platforms: [] }
  return res.json()
}

async function fetchGenres(): Promise<GenresResponse> {
  const res = await fetch("/api/catalog/genres")
  if (!res.ok) return { genres: [] }
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
  icon, label, attribution,
}: {
  icon: React.ReactNode; label: string; attribution: string
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
      <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2">
        {icon}
        {label}
      </h2>
      <p className="text-[11px] font-mono text-muted-foreground/90 uppercase tracking-wider">
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
    <p className="text-xs text-muted-foreground/90 flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span>Data from</span>
      {showTgdb && (
        <a href="https://thegamesdb.net" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-primary/95 hover:text-primary underline underline-offset-2 transition-colors font-medium">
          TheGamesDB <ExternalLink size={9} />
        </a>
      )}
      {showRawg && showTgdb && <span className="text-muted-foreground/40">&amp;</span>}
      {showRawg && (
        <a href="https://rawg.io" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-primary/95 hover:text-primary underline underline-offset-2 transition-colors font-medium">
          RAWG <ExternalLink size={9} />
        </a>
      )}
    </p>
  )
}

// ── Filter dropdown (shared style) ────────────────────────────────────────────

/**
 * A SelectTrigger that auto-sizes to its content.
 * `min-w-[...]` prevents it being narrower than the placeholder;
 * `w-auto` overrides Shadcn's default `w-full` so it shrinks/grows naturally.
 */
function FilterSelect({
  value,
  onValueChange,
  placeholder,
  // Pass the full responsive class string here (must already include the
  // "sm:" prefix) — Tailwind's JIT scanner only picks up literal class
  // strings it can find verbatim in source, so building "sm:" + minWidth
  // at runtime silently fails to generate the CSS. Default mirrors the
  // common case used across most filters below.
  smWidthClass = "sm:w-auto sm:min-w-[150px]",
  children,
}: {
  value: string
  onValueChange: (v: string) => void
  placeholder: string
  smWidthClass?: string
  children: React.ReactNode
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      {/* Full-width below sm so each filter stacks on its own row on mobile
          (matches the Boutique page's w-full md:w-[Npx] pattern) — a bare
          min-width lets flex-wrap pack two ~150px selects per row on a
          narrow screen, which wraps unevenly (2, then 1 alone, then sort
          alone) instead of a clean single-column stack. */}
      <SelectTrigger className={`w-full ${smWidthClass} bg-card border-card-border sm:shrink-0 text-sm`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {children}
      </SelectContent>
    </Select>
  )
}

// ── Hero marquee sampling ─────────────────────────────────────────────────────

/**
 * Picks a visually varied sample of cover art for the hero marquee — spread
 * across genres and across the three pre-populated lists (popular/new/
 * upcoming) rather than just the top few "Most Popular" entries, which
 * would otherwise skew toward one era/style of box art. Greedily takes one
 * game per not-yet-seen genre first, then tops up with remaining unique
 * covers once every genre bucket has been touched once.
 */
function buildVariedHeroImages(pools: CatalogGame[][], max = 16): string[] {
  const seenGenres = new Set<string>()
  const seenCovers = new Set<string>()
  const picked: string[] = []
  const leftovers: string[] = []

  // Interleave the pools (one from each, round-robin) so no single list dominates.
  const interleaved: CatalogGame[] = []
  const maxLen = Math.max(0, ...pools.map(p => p.length))
  for (let i = 0; i < maxLen; i++) {
    for (const pool of pools) if (pool[i]) interleaved.push(pool[i])
  }

  for (const game of interleaved) {
    if (!game.coverImageUrl || seenCovers.has(game.coverImageUrl)) continue
    const primaryGenre = game.genres?.[0]
    if (primaryGenre && !seenGenres.has(primaryGenre)) {
      seenGenres.add(primaryGenre)
      seenCovers.add(game.coverImageUrl)
      picked.push(game.coverImageUrl)
    } else {
      seenCovers.add(game.coverImageUrl)
      leftovers.push(game.coverImageUrl)
    }
    if (picked.length >= max) break
  }

  while (picked.length < max && leftovers.length > 0) {
    picked.push(leftovers.shift()!)
  }

  return picked
}

// ── Responsive column count ──────────────────────────────────────────────────
// Mirrors the `grid-cols-2 sm:grid-cols-3 md:grid-cols-4` breakpoints used by
// the pre-populated sections below, so each section can always show exactly
// three full rows (columns × 3) for whatever the current column count is —
// never a ragged/partial last row.

function computeSectionColumns(width: number): number {
  if (width >= 768) return 4
  if (width >= 640) return 3
  return 2
}

function useSectionColumns(): number {
  const [columns, setColumns] = useState(() =>
    typeof window === "undefined" ? 4 : computeSectionColumns(window.innerWidth),
  )
  useEffect(() => {
    const handleResize = () => setColumns(computeSectionColumns(window.innerWidth))
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])
  return columns
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GamesSearch() {
  const [search,       setSearch]       = useState("")
  const [platform,     setPlatform]     = useState("all")
  const [genre,        setGenre]        = useState("all")
  const [era,          setEra]          = useState<EraValue>("all")
  const [sort,         setSort]         = useState<SortValue>("best_rated")
  const [page,         setPage]         = useState(1)
  const [selectedGame, setSelectedGame] = useState<CatalogGame | null>(null)
  // Current column count for the pre-populated sections — drives how many
  // cards are shown (columns × 3 rows) so each section always renders
  // exactly three full rows, never a ragged/partial last row.
  const sectionColumns = useSectionColumns()

  const debouncedSearch = useDebounce(search, 400)
  // Longer debounce dedicated to analytics — the 400ms search debounce fires on
  // every brief typing pause, which would report partial fragments ("zeld") as
  // distinct search terms. Waiting ~1.2s for typing to fully settle avoids that.
  const analyticsSearch = useDebounce(search, 1200)

  // Active filter count (sort is not a "filter", just presentation)
  const activeFilterCount =
    (platform !== "all" ? 1 : 0) +
    (genre    !== "all" ? 1 : 0) +
    (era      !== "all" ? 1 : 0)

  const hasActiveFilters = activeFilterCount > 0
  // Search mode: user typed a query, OR has at least one active filter
  const isSearchMode = debouncedSearch.trim().length > 0 || hasActiveFilters

  const _pageTitle = debouncedSearch.trim()
    ? `"${debouncedSearch.trim()}" — Physical Games | DiscWatchHQ`
    : "Browse Games — Physical Releases Across All Platforms | DiscWatchHQ"

  useDocumentHead({
    title:       _pageTitle,
    description: "Search 900,000+ physical video games across every platform and generation. Compare prices and buy on GameStop, Amazon, eBay, and Best Buy — all in one search.",
    canonical:   buildCanonicalUrl("/games"),
    jsonLd: {
      "@context":    "https://schema.org",
      "@type":       "CollectionPage",
      "name":        "Browse Physical Games — DiscWatchHQ",
      "description": "Search 900,000+ physical video games across every platform. Compare prices on GameStop, Amazon, eBay, and Best Buy.",
      "url":         "https://discwatchhq.com/games",
      "isPartOf":    { "@id": "https://discwatchhq.com/#website" },
    },
  })

  // Reset page whenever any search/filter parameter changes
  useEffect(() => { setPage(1) }, [debouncedSearch, platform, genre, era, sort])

  // Report submitted search queries to GA4 so "Search Term" reporting is
  // populated. Uses the longer analyticsSearch debounce (not the 400ms
  // search-results one) so partial in-progress fragments don't get reported
  // as distinct searches — this only fires once typing has settled, i.e. once
  // the search has effectively been "submitted", never on every keystroke.
  // lastTrackedSearch guards against firing the same term twice in a row
  // (e.g. if analyticsSearch briefly re-settles to an identical value).
  const lastTrackedSearch = useRef<string>("")
  useEffect(() => {
    if (!search.trim()) lastTrackedSearch.current = ""
  }, [search])
  useEffect(() => {
    const term = analyticsSearch.trim()
    if (!term || term === lastTrackedSearch.current) return
    trackSearchEvent(term)
    lastTrackedSearch.current = term
  }, [analyticsSearch])

  const clearFilters = useCallback(() => {
    setPlatform("all")
    setGenre("all")
    setEra("all")
    setPage(1)
  }, [])

  // ── Search / browse results ──
  const { data: searchData, isLoading: isSearchLoading, error: searchError } =
    useQuery<GameSearchResponse, Error>({
      queryKey:        ["catalog-games", debouncedSearch, page, platform, genre, era, sort],
      queryFn:         () => fetchGames(
        debouncedSearch, page,
        platform === "all" ? "" : platform,
        genre    === "all" ? "" : genre,
        era,
        sort,
      ),
      staleTime:       10 * 60 * 1_000,
      placeholderData: prev => prev,
      enabled:         isSearchMode,
    })

  // ── Pre-populated sections (always loaded, shown when nothing is active) ──
  const { data: popularData,  isLoading: isPopularLoading } = useQuery<PopularResponse>({
    queryKey:  ["games-popular"],
    queryFn:   fetchPopular,
    staleTime: 30 * 60 * 1_000,
  })
  const { data: newData, isLoading: isNewLoading } = useQuery<PopularResponse>({
    queryKey:  ["games-new-releases"],
    queryFn:   fetchNewReleases,
    staleTime: 30 * 60 * 1_000,
  })
  const { data: upcomingData, isLoading: isUpcomingLoading } = useQuery<PopularResponse>({
    queryKey:  ["games-upcoming"],
    queryFn:   fetchUpcoming,
    staleTime: 30 * 60 * 1_000,
  })
  const { data: platformsData } = useQuery<PlatformsResponse>({
    queryKey:  ["catalog-platforms"],
    queryFn:   fetchPlatforms,
    staleTime: 5 * 60 * 1_000,
  })
  const { data: genresData } = useQuery<GenresResponse>({
    queryKey:  ["catalog-genres"],
    queryFn:   fetchGenres,
    staleTime: 5 * 60 * 1_000,
  })

  const totalPages   = searchData?.count ? Math.ceil(searchData.count / 20) : 0
  const neitherReady = searchData && !searchData.sources?.rawg && !searchData.sources?.tgdb

  // Pre-populated sections
  const allPopular       = popularData?.results  ?? []
  const allNew           = newData?.results      ?? []
  const allUpcoming      = upcomingData?.results ?? []
  const sectionCardLimit = sectionColumns * 3
  const popularCards     = allPopular.slice(0, sectionCardLimit)
  const newReleasesCards = allNew.slice(0, sectionCardLimit)
  const upcomingCards    = allUpcoming.slice(0, sectionCardLimit)
  const popularTotal     = popularData?.count  ?? 0
  const newTotal         = newData?.count      ?? 0
  const upcomingTotal    = upcomingData?.count ?? 0

  // Hero marquee — mixed, genre-varied sample from the three already-fetched
  // lists (not just "Most Popular" by score), so the strip reads as broad
  // catalog variety rather than a duplicate of the ranking shown below.
  const heroImages = useMemo(
    () => buildVariedHeroImages([allPopular, allNew, allUpcoming]),
    [popularData, newData, upcomingData],
  )

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden border-b bg-card">
        <HeroMarquee images={heroImages} className="opacity-90" />
        <div className="container relative mx-auto max-w-[1600px] px-4 py-10 md:py-14">
          <h1 className="text-2xl md:text-3xl font-bold font-display tracking-tight text-foreground flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-40" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
            </span>
            Browse Games
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-base">
            Popular titles, new releases, and 900,000+ physical games across every platform and era.
          </p>
        </div>
      </section>

      <main className="flex-1 container mx-auto max-w-[1600px] px-4 py-8">

        {/* ── Page header ── */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
            <div>
              <h2 className="font-display font-bold text-xl md:text-2xl text-foreground tracking-tight">
                {debouncedSearch.trim() ? <>Results for &ldquo;{debouncedSearch.trim()}&rdquo;</> : "All Games"}
              </h2>
              <p className="text-muted-foreground text-base mt-1">
                {isSearchMode && searchData?.count && !searchData.empty
                  ? `${searchData.count.toLocaleString()} results${debouncedSearch.trim() ? ` for "${debouncedSearch}"` : ""}`
                  : "Search or filter the full catalog below."}
              </p>
            </div>
            {isSearchMode && <CatalogAttribution sources={searchData?.sources} />}
          </div>

          {/* ── Row 1: Search box ── */}
          <div className="relative">
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

          {/* ── Row 2: Filter dropdowns ── */}
          <div className="flex flex-wrap items-center gap-2 mt-2">

            {/* Platform */}
            <FilterSelect
              value={platform}
              onValueChange={v => { setPlatform(v); setPage(1) }}
              placeholder="All platforms"
              smWidthClass="sm:w-auto sm:min-w-[155px]"
            >
              <SelectItem value="all">All platforms</SelectItem>
              {(platformsData?.platforms ?? []).map(p => (
                <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
              ))}
            </FilterSelect>

            {/* Genre */}
            <FilterSelect
              value={genre}
              onValueChange={v => { setGenre(v); setPage(1) }}
              placeholder="All genres"
              smWidthClass="sm:w-auto sm:min-w-[135px]"
            >
              <SelectItem value="all">All genres</SelectItem>
              {(genresData?.genres ?? []).map(g => (
                <SelectItem key={g.name} value={g.name}>{g.name}</SelectItem>
              ))}
            </FilterSelect>

            {/* Era */}
            <FilterSelect
              value={era}
              onValueChange={v => { setEra(v as EraValue); setPage(1) }}
              placeholder="All eras"
              smWidthClass="sm:w-auto sm:min-w-[165px]"
            >
              {ERA_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </FilterSelect>

            {/* Active filter badge + clear — sits between filter group and sort */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground border border-border/50 hover:border-border rounded-full px-2.5 py-1 transition-colors"
                aria-label="Clear all active filters"
              >
                <SlidersHorizontal size={11} />
                {activeFilterCount} active
                <X size={11} />
              </button>
            )}

            {/* Sort — pushed to right end on sm+; stacks full-width on mobile */}
            <div className="w-full sm:w-auto sm:ml-auto">
              <FilterSelect
                value={sort}
                onValueChange={v => setSort(v as SortValue)}
                placeholder="Best Rated"
                smWidthClass="sm:w-auto sm:min-w-[155px]"
              >
                {SORT_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </FilterSelect>
            </div>
          </div>

          <p className="text-xs text-muted-foreground/70 mt-2">
            Tip: select a platform above for more precise, less cluttered search results.
          </p>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            PRE-POPULATED SECTIONS
            Hidden when the user has an active search or any active filter.
        ══════════════════════════════════════════════════════════════════ */}
        {!isSearchMode && (
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
                  {Array.from({ length: sectionCardLimit }).map((_, i) => <GameCardSkeleton key={i} />)}
                </div>
              ) : popularCards.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {popularCards.map((game, i) => (
                      <CatalogGameCard key={game.id} game={game} onClick={setSelectedGame} priority={i < 4} />
                    ))}
                  </div>

                  {popularTotal > sectionCardLimit && (
                    <div className="flex items-center justify-end mt-5">
                      <Link
                        href="/games/popular"
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                      >
                        View all Most Popular <ArrowRight size={14} />
                      </Link>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Popularity data unavailable — configure a RAWG_API_KEY to enable this section.
                </p>
              )}
            </section>

            {/* ── Recently Released ── */}
            <section className="mb-12">
              <SectionHeader
                icon={<CalendarDays size={18} className="text-primary" />}
                label="Recently Released"
                attribution="Released in the past 12 months · Sorted newest first · RAWG"
              />

              {isNewLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {Array.from({ length: sectionCardLimit }).map((_, i) => <GameCardSkeleton key={i} />)}
                </div>
              ) : newReleasesCards.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {newReleasesCards.map(game => (
                      <CatalogGameCard key={game.id} game={game} onClick={setSelectedGame} />
                    ))}
                  </div>

                  {newTotal > sectionCardLimit && (
                    <div className="flex items-center justify-end mt-5">
                      <Link
                        href="/games/new-releases"
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                      >
                        View all Recently Released <ArrowRight size={14} />
                      </Link>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Recent release data unavailable — configure a RAWG_API_KEY to enable this section.
                </p>
              )}
            </section>

            {/* ── Upcoming ── */}
            <section className="mb-12">
              <SectionHeader
                icon={<CalendarDays size={18} className="text-primary" />}
                label="Upcoming"
                attribution="Confirmed future release dates · Soonest first · RAWG"
              />

              {isUpcomingLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {Array.from({ length: sectionCardLimit }).map((_, i) => <GameCardSkeleton key={i} />)}
                </div>
              ) : upcomingCards.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {upcomingCards.map(game => (
                      <CatalogGameCard key={game.id} game={game} onClick={setSelectedGame} />
                    ))}
                  </div>

                  {upcomingTotal > sectionCardLimit && (
                    <div className="flex items-center justify-end mt-5">
                      <Link
                        href="/games/upcoming"
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                      >
                        View all Upcoming <ArrowRight size={14} />
                      </Link>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No upcoming games found yet — check back shortly while the catalog loads.
                </p>
              )}
            </section>

            {/*
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              TODO: "Trending on DiscWatchHQ"
              Replace or augment the sections above with on-site trending
              metrics once real traffic and engagement data are available.
              Metrics needed: page views, click-through rates, search frequency.
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            */}

            <div className="border-t border-border/20 pt-4 mb-8">
              <CatalogAttribution sources={{ rawg: true, tgdb: true }} />
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SEARCH / BROWSE RESULTS (active when query or any filter is set)
        ══════════════════════════════════════════════════════════════════ */}

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

        {searchError && isSearchMode && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive mb-6">
            <AlertCircle size={16} className="shrink-0" />
            <p className="text-sm">{searchError.message}</p>
          </div>
        )}

        {isSearchMode && !neitherReady && (
          <>
            {!isSearchLoading && searchData?.results.length === 0 && !searchError && (
              <div className="py-20 text-center">
                <p className="text-muted-foreground">
                  {debouncedSearch.trim()
                    ? <>No games found for &ldquo;{debouncedSearch}&rdquo;. Try a different title or clear your filters.</>
                    : <>No games match the selected filters. Try broadening your selection.</>}
                </p>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="mt-3 text-sm text-primary hover:text-primary/80 inline-flex items-center gap-1"
                  >
                    <X size={13} /> Clear filters
                  </button>
                )}
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

      <GameDetailModal
        game={selectedGame}
        onClose={() => setSelectedGame(null)}
      />
    </div>
  )
}
