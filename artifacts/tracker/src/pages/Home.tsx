import { useState, useMemo, useEffect, useRef } from "react"
import { Search, FilterX } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import {
  useListPlatforms,
  useListPublishers,
  useListAvailableReleases,
  useListComingSoonReleases,
  useListSoldOutReleases,
  useListAnnouncedReleases
} from "@workspace/api-client-react"
import { GameCard, GameCardSkeleton } from "@/components/GameCard"
import { NewsletterSignup } from "@/components/NewsletterSignup"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { HeroMarquee } from "@/components/HeroMarquee"
import { useDebounce } from "@/hooks/use-debounce"
import { useDocumentHead } from "@/hooks/useDocumentHead"
import { buildCanonicalUrl } from "@/lib/seo"
import { trackSearchEvent } from "@/lib/analytics"

type SortOption = "updated" | "title" | "publisher" | "newest" | "release_date_asc" | "release_date_desc"
type StatusFilter = "_all" | "available" | "coming_soon" | "sold_out" | "announced"

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "_all",        label: "All Statuses"      },
  { value: "available",   label: "Available Now"      },
  { value: "coming_soon", label: "Coming Soon"        },
  { value: "announced",   label: "Announced"          },
  { value: "sold_out",    label: "Sold Out"           },
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "updated",          label: "Recently Updated"         },
  { value: "release_date_asc", label: "Release Date — Soonest"   },
  { value: "release_date_desc",label: "Release Date — Furthest"  },
  { value: "newest",           label: "Newly Listed"             },
  { value: "publisher",        label: "Publisher A–Z"            },
  { value: "title",            label: "Title A–Z"                },
]

export default function Home() {
  const [search, setSearch]       = useState("")
  const [platform, setPlatform]   = useState<string>("_all")
  const [publisher, setPublisher] = useState<string>("_all")
  const [status, setStatus]       = useState<StatusFilter>("_all")
  const [sort, setSort]           = useState<SortOption>("updated")

  // Hide the filter bar while scrolling down (it stacks to several rows on
  // mobile and eats half the viewport), reveal it again on scroll up or once
  // back near the top. Small threshold avoids flicker from sub-pixel scroll
  // jitter; only engages past the hero so it doesn't collapse mid-hero.
  const [filtersHidden, setFiltersHidden] = useState(false)
  const lastScrollY = useRef(0)
  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY
      const delta = y - lastScrollY.current
      if (y < 220) {
        setFiltersHidden(false)
      } else if (delta > 8) {
        setFiltersHidden(true)
      } else if (delta < -8) {
        setFiltersHidden(false)
      }
      lastScrollY.current = y
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useDocumentHead({
    title:       "Boutique Tracker — Limited-Run Physical Game Releases | DiscWatchHQ",
    description: "Track limited-run physical game releases from Limited Run Games, Strictly Limited, iam8bit, Super Rare Games, and more. Available now, coming soon, and recently sold out.",
    canonical:   buildCanonicalUrl("/boutique"),
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type":       "CollectionPage",
          "name":        "Boutique Tracker — Limited-Run Physical Game Releases | DiscWatchHQ",
          "url":         "https://discwatchhq.com/boutique",
          "description": "Real-time tracking of limited-run physical game releases and collector merchandise from boutique publishers including Limited Run Games, Strictly Limited, iam8bit, Super Rare Games, Fangamer, Square Enix, and more.",
          "isPartOf":    { "@id": "https://discwatchhq.com/#website" },
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home",             "item": "https://discwatchhq.com/" },
            { "@type": "ListItem", "position": 2, "name": "Boutique Tracker", "item": "https://discwatchhq.com/boutique" },
          ],
        },
      ],
    },
  })

  const debouncedSearch = useDebounce(search, 300)
  // Longer debounce dedicated to analytics — the 300ms search debounce fires on
  // every brief typing pause, which would report partial fragments as distinct
  // search terms. Waiting ~1.2s for typing to fully settle avoids that.
  const analyticsSearch = useDebounce(search, 1200)

  const { data: platforms }  = useListPlatforms()
  const { data: publishers } = useListPublishers()

  // Build query params — omit _all sentinels, pass real values only
  const queryParams = useMemo(() => {
    const params: Record<string, string> = { sort }
    if (platform  !== "_all") params.platform  = platform
    if (publisher !== "_all") params.publisher = publisher
    if (debouncedSearch)      params.search    = debouncedSearch
    return params
  }, [platform, publisher, debouncedSearch, sort])

  // Report submitted search queries to GA4 so "Search Term" reporting is
  // populated, mirroring Browse Games (GamesSearch.tsx). Uses the longer
  // analyticsSearch debounce (not the 300ms search-results one) so this only
  // fires once typing has settled — i.e. once the search has effectively
  // been "submitted" — never on every keystroke, and never for a blank term.
  // lastTrackedSearch guards against firing the same term twice in a row.
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

  // ── Per-section "Load More" limits ──────────────────────────────────────
  // PAGE_SIZE = 48: multiple of LCM(2,3,4)=12, so grid rows are always complete
  // at every responsive breakpoint (2-col mobile, 3-col tablet, 4-col desktop).
  const PAGE_SIZE = 48
  const [availableLimit, setAvailableLimit] = useState(PAGE_SIZE)
  const [comingSoonLimit, setComingSoonLimit] = useState(PAGE_SIZE)
  const [announcedLimit, setAnnouncedLimit] = useState(PAGE_SIZE)
  const [soldOutLimit, setSoldOutLimit] = useState(PAGE_SIZE)

  // Reset per-section limits whenever any filter changes — avoids stale pages
  // bleeding through when the user narrows the result set.
  const resetLimits = () => {
    setAvailableLimit(PAGE_SIZE)
    setComingSoonLimit(PAGE_SIZE)
    setAnnouncedLimit(PAGE_SIZE)
    setSoldOutLimit(PAGE_SIZE)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(resetLimits, [platform, publisher, debouncedSearch, sort])

  const { data: availableData,  isLoading: isLoadingAvailable }  = useListAvailableReleases({ ...queryParams, limit: availableLimit })
  const { data: comingSoonData, isLoading: isLoadingComingSoon } = useListComingSoonReleases({ ...queryParams, limit: comingSoonLimit })
  const { data: announcedData,  isLoading: isLoadingAnnounced }  = useListAnnouncedReleases({ ...queryParams, limit: announcedLimit })
  const { data: soldOutData,    isLoading: isLoadingSoldOut }    = useListSoldOutReleases({ ...queryParams, limit: soldOutLimit })

  const clearFilters = () => {
    setSearch("")
    setPlatform("_all")
    setPublisher("_all")
    setStatus("_all")
    setSort("updated")
  }

  const hasActiveFilters =
    search !== "" || platform !== "_all" || publisher !== "_all" || status !== "_all" || sort !== "updated"

  // Hero marquee — real photos of currently-available and coming-soon boutique
  // items (already fetched for the grids below), so the strip reflects live
  // drops rather than stale/sold-out stock. Deduped and capped for variety.
  const heroImages = useMemo(() => {
    const covers = [
      ...(availableData?.releases  ?? []),
      ...(comingSoonData?.releases ?? []),
    ]
      .map(r => r.coverImageUrl)
      .filter((url): url is string => !!url)
    return Array.from(new Set(covers)).slice(0, 16)
  }, [availableData, comingSoonData])

  return (
    <div className="min-h-[100dvh] flex flex-col">
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
            Boutique Tracker
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-base">
            Limited-run physical releases from Limited Run Games, Strictly Limited, iam8bit, Super Rare Games, Fangamer, and more.
          </p>
          <p className="text-muted-foreground/80 mt-3 text-sm leading-relaxed max-w-2xl">
            Boutique game publishers release physical editions in limited quantities — often a
            few thousand units — that sell out in hours or days and rarely restock. Once they're
            gone, you're paying secondary-market prices. The Boutique Tracker monitors{" "}
            {publishers?.length ?? 15} publishers every two hours and organizes their
            releases into three buckets:{" "}
            <span className="text-foreground/70 font-medium">Available Now</span> (open for
            order today),{" "}
            <span className="text-foreground/70 font-medium">Coming Soon</span> (announced,
            preorder window not yet open), and{" "}
            <span className="text-foreground/70 font-medium">Sold Out</span> (with eBay links
            for the secondary market). Log in to save items to your watchlist and get notified
            when availability changes.
          </p>
        </div>
      </section>

      <main className="flex-1">

        {/* Filter + Sort bar — collapses on scroll-down, reopens on scroll-up */}
        <section
          className={`bg-card sticky top-16 z-30 shadow-sm overflow-hidden transition-[max-height,opacity,border-color] duration-300 ease-in-out ${
            filtersHidden
              ? "max-h-0 opacity-0 border-b border-transparent"
              : "max-h-[500px] opacity-100 border-b border-border"
          }`}
        >
          <div className="container mx-auto max-w-[1600px] px-4 pt-6 pb-4">

            {/* ── Row 1: Search box ── */}
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none"
                size={15}
              />
              <Input
                placeholder="Search titles or publishers..."
                className="pl-9 bg-card border-card-border"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {/* ── Row 2: Filter dropdowns ── */}
            <div className="flex items-center gap-2 flex-wrap mt-2">
              {/* Platform filter */}
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="w-full md:w-[165px] bg-background">
                  <SelectValue placeholder="Platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Platforms</SelectItem>
                  {platforms?.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                    <SelectItem key={p.name} value={p.name}>
                      {p.name} ({p.releaseCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Publisher filter — only show publishers with at least one release */}
              <Select value={publisher} onValueChange={setPublisher}>
                <SelectTrigger className="w-full md:w-[200px] bg-background">
                  <SelectValue placeholder="Publisher" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Publishers</SelectItem>
                  {publishers?.filter(p => p.releaseCount > 0).slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                    <SelectItem key={p.slug} value={p.slug}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status filter */}
              <Select value={status} onValueChange={v => setStatus(v as StatusFilter)}>
                <SelectTrigger className="w-full md:w-[165px] bg-background">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Sort — pushed to right end, mirrors Browse Games layout */}
              <div className="md:ml-auto w-full md:w-auto flex items-center gap-2">
                <Select value={sort} onValueChange={v => setSort(v as SortOption)}>
                  <SelectTrigger className="w-full md:w-[185px] bg-background">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {hasActiveFilters && (
                  <Button variant="ghost" size="icon" onClick={clearFilters} title="Reset all filters">
                    <FilterX className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="container mx-auto max-w-[1600px] px-4 py-8 space-y-16">

          {/* Currently Available */}
          {(status === "_all" || status === "available") && <section>
            <div className="flex items-baseline justify-between mb-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold font-display tracking-tight text-foreground flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-40" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
                  </span>
                  Currently Available
                </h2>
                <p className="text-muted-foreground mt-1 font-mono text-base">Open preorders & in-stock drops</p>
              </div>
              <div className="text-sm font-mono text-muted-foreground bg-secondary px-3 py-1 rounded-full">
                {isLoadingAvailable ? "…" : (availableData?.total ?? 0)}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {isLoadingAvailable ? (
                Array.from({ length: 8 }).map((_, i) => <GameCardSkeleton key={i} />)
              ) : availableData?.releases.length ? (
                <>
                  {availableData.releases.map((release, i) => (
                    <GameCard key={release.id} release={release} priority={i < 4} />
                  ))}
                  {/* Invisible spacers — pad last row to a multiple of 4 (lg breakpoint) */}
                  {Array.from({ length: (4 - (availableData.releases.length % 4)) % 4 }).map((_, i) => (
                    <div key={`avail-spacer-${i}`} aria-hidden="true" />
                  ))}
                </>
              ) : (
                <div className="col-span-full py-12 text-center bg-card/30 rounded-xl border border-dashed">
                  <p className="text-muted-foreground font-mono">No open preorders match your filters.</p>
                  <Button variant="link" onClick={clearFilters} className="mt-2">Clear filters</Button>
                </div>
              )}
            </div>
            {/* Load More — only shown when there are more results than the current page */}
            {!isLoadingAvailable && (availableData?.total ?? 0) > (availableData?.releases.length ?? 0) && (
              <div className="flex flex-col items-center gap-2 pt-6">
                <Button variant="outline" onClick={() => setAvailableLimit(l => l + PAGE_SIZE)} className="min-w-[200px]">
                  Load More
                </Button>
                <p className="text-xs text-muted-foreground font-mono">
                  Showing {availableData?.releases.length ?? 0} of {availableData?.total ?? 0}
                </p>
              </div>
            )}
          </section>}

          {/* Coming Soon */}
          {(status === "_all" || status === "coming_soon") && <section>
            <div className="flex items-baseline justify-between mb-6">
              <div>
                <h2 className="text-xl md:text-2xl font-bold font-display tracking-tight text-foreground">
                  Coming Soon
                </h2>
                <p className="text-muted-foreground mt-1 font-mono text-base">Announced, waiting for drop</p>
              </div>
              <div className="text-sm font-mono text-muted-foreground bg-secondary px-3 py-1 rounded-full">
                {isLoadingComingSoon ? "…" : (comingSoonData?.total ?? 0)}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {isLoadingComingSoon ? (
                Array.from({ length: 8 }).map((_, i) => <GameCardSkeleton key={i} />)
              ) : comingSoonData?.releases.length ? (
                <>
                  {comingSoonData.releases.map(release => (
                    <GameCard key={release.id} release={release} />
                  ))}
                  {Array.from({ length: (4 - (comingSoonData.releases.length % 4)) % 4 }).map((_, i) => (
                    <div key={`cs-spacer-${i}`} aria-hidden="true" />
                  ))}
                </>
              ) : (
                <div className="col-span-full py-12 text-center bg-card/30 rounded-xl border border-dashed">
                  <p className="text-muted-foreground font-mono">No upcoming releases match your filters.</p>
                  {hasActiveFilters && (
                    <Button variant="link" onClick={clearFilters} className="mt-2">Clear filters</Button>
                  )}
                </div>
              )}
            </div>
            {!isLoadingComingSoon && (comingSoonData?.total ?? 0) > (comingSoonData?.releases.length ?? 0) && (
              <div className="flex flex-col items-center gap-2 pt-6">
                <Button variant="outline" onClick={() => setComingSoonLimit(l => l + PAGE_SIZE)} className="min-w-[200px]">
                  Load More
                </Button>
                <p className="text-xs text-muted-foreground font-mono">
                  Showing {comingSoonData?.releases.length ?? 0} of {comingSoonData?.total ?? 0}
                </p>
              </div>
            )}
          </section>}

          {/* Announced — listed but no pre-order button yet */}
          {(status === "_all" || status === "announced") && <section>
            <div className="flex items-baseline justify-between mb-6 opacity-80">
              <div>
                <h2 className="text-xl md:text-2xl font-bold font-display tracking-tight text-foreground">
                  Announced
                </h2>
                <p className="text-muted-foreground mt-1 font-mono text-base">Listed but not yet open for pre-order</p>
              </div>
              <div className="text-sm font-mono text-muted-foreground bg-secondary px-3 py-1 rounded-full">
                {isLoadingAnnounced ? "…" : (announcedData?.total ?? 0)}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {isLoadingAnnounced ? (
                Array.from({ length: 4 }).map((_, i) => <GameCardSkeleton key={i} />)
              ) : announcedData?.releases.length ? (
                <>
                  {announcedData.releases.map(release => (
                    <GameCard key={release.id} release={release} />
                  ))}
                  {Array.from({ length: (4 - (announcedData.releases.length % 4)) % 4 }).map((_, i) => (
                    <div key={`ann-spacer-${i}`} aria-hidden="true" />
                  ))}
                </>
              ) : (
                <div className="col-span-full py-12 text-center bg-card/30 rounded-xl border border-dashed">
                  <p className="text-muted-foreground font-mono">No announced titles match your filters.</p>
                  {hasActiveFilters && (
                    <Button variant="link" onClick={clearFilters} className="mt-2">Clear filters</Button>
                  )}
                </div>
              )}
            </div>
            {!isLoadingAnnounced && (announcedData?.total ?? 0) > (announcedData?.releases.length ?? 0) && (
              <div className="flex flex-col items-center gap-2 pt-6">
                <Button variant="outline" onClick={() => setAnnouncedLimit(l => l + PAGE_SIZE)} className="min-w-[200px]">
                  Load More
                </Button>
                <p className="text-xs text-muted-foreground font-mono">
                  Showing {announcedData?.releases.length ?? 0} of {announcedData?.total ?? 0}
                </p>
              </div>
            )}
          </section>}

          {/* Recently Sold Out */}
          {(status === "_all" || status === "sold_out") && <section>
            <div className="flex items-baseline justify-between mb-6 opacity-70">
              <div>
                <h2 className="text-xl md:text-2xl font-bold font-display tracking-tight text-foreground">
                  Recently Sold Out
                </h2>
                <p className="text-muted-foreground mt-1 font-mono text-base">Missed it</p>
              </div>
              <div className="text-sm font-mono text-muted-foreground bg-secondary px-3 py-1 rounded-full">
                {isLoadingSoldOut ? "…" : (soldOutData?.total ?? 0)}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {isLoadingSoldOut ? (
                Array.from({ length: 8 }).map((_, i) => <GameCardSkeleton key={i} />)
              ) : soldOutData?.releases.length ? (
                <>
                  {soldOutData.releases.map(release => (
                    <GameCard key={release.id} release={release} />
                  ))}
                  {Array.from({ length: (4 - (soldOutData.releases.length % 4)) % 4 }).map((_, i) => (
                    <div key={`sold-spacer-${i}`} aria-hidden="true" />
                  ))}
                </>
              ) : (
                <div className="col-span-full py-12 text-center bg-card/30 rounded-xl border border-dashed">
                  <p className="text-muted-foreground font-mono">No sold out releases match your filters.</p>
                  {hasActiveFilters && (
                    <Button variant="link" onClick={clearFilters} className="mt-2">Clear filters</Button>
                  )}
                </div>
              )}
            </div>
            {!isLoadingSoldOut && (soldOutData?.total ?? 0) > (soldOutData?.releases.length ?? 0) && (
              <div className="flex flex-col items-center gap-2 pt-6">
                <Button variant="outline" onClick={() => setSoldOutLimit(l => l + PAGE_SIZE)} className="min-w-[200px]">
                  Load More
                </Button>
                <p className="text-xs text-muted-foreground font-mono">
                  Showing {soldOutData?.releases.length ?? 0} of {soldOutData?.total ?? 0}
                </p>
              </div>
            )}
          </section>}

        </div>
      </main>

      <NewsletterSignup />
      <Footer />
    </div>
  )
}
