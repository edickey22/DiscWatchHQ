import { useState, useMemo, useEffect } from "react"
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
  useListSoldOutReleases
} from "@workspace/api-client-react"
import { GameCard, GameCardSkeleton } from "@/components/GameCard"
import { NewsletterSignup } from "@/components/NewsletterSignup"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { useDebounce } from "@/hooks/use-debounce"
import { useDocumentHead } from "@/hooks/useDocumentHead"
import { buildCanonicalUrl } from "@/lib/seo"

type SortOption = "updated" | "title" | "publisher" | "newest"

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest",    label: "Newly Listed"      },
  { value: "publisher", label: "Publisher A–Z"     },
  { value: "updated",   label: "Recently Updated"  },
  { value: "title",     label: "Title A–Z"         },
]

export default function Home() {
  const [search, setSearch]       = useState("")
  const [platform, setPlatform]   = useState<string>("_all")
  const [publisher, setPublisher] = useState<string>("_all")
  const [sort, setSort]           = useState<SortOption>("updated")

  useDocumentHead({
    title:       "Boutique Tracker — Limited-Run Physical Game Releases | DiscWatchHQ",
    description: "Track limited-run physical game releases from Limited Run Games, Strictly Limited, iam8bit, Super Rare Games, and more. See what's available now, coming soon, and recently sold out.",
    canonical:   buildCanonicalUrl("/boutique"),
    jsonLd:      null,
  })

  const debouncedSearch = useDebounce(search, 300)

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

  // Report every distinct search query to GA4 so "Search Term" reporting is populated,
  // mirroring the same event on Browse Games (GamesSearch.tsx).
  useEffect(() => {
    const term = debouncedSearch.trim()
    if (!term) return
    if (typeof window.gtag !== "function") return
    window.gtag("event", "search", { search_term: term })
  }, [debouncedSearch])

  const { data: availableData,  isLoading: isLoadingAvailable }  = useListAvailableReleases(queryParams)
  const { data: comingSoonData, isLoading: isLoadingComingSoon } = useListComingSoonReleases(queryParams)
  const { data: soldOutData,    isLoading: isLoadingSoldOut }    = useListSoldOutReleases(queryParams)

  const clearFilters = () => {
    setSearch("")
    setPlatform("_all")
    setPublisher("_all")
    setSort("updated")
  }

  const hasActiveFilters =
    search !== "" || platform !== "_all" || publisher !== "_all" || sort !== "updated"

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Visually-hidden H1 — one H1 per page for accessibility + SEO.
            The Boutique page uses H2s for its three content sections (Currently
            Available, Coming Soon, Sold Out). Adding a matching H1 here keeps
            the document outline correct without altering the visual layout. */}
        <h1 className="sr-only">Boutique Tracker — Limited-Run Physical Game Releases</h1>

        {/* Filter + Sort bar */}
        <section className="bg-card border-b sticky top-16 z-30 shadow-sm">
          <div className="container mx-auto max-w-6xl px-4 py-4">
            <div className="flex flex-col md:flex-row gap-3 items-center">

              {/* Search */}
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search titles or publishers..."
                  className="pl-9 bg-background"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <div className="flex gap-2 w-full md:w-auto flex-wrap">
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

                {/* Publisher filter */}
                <Select value={publisher} onValueChange={setPublisher}>
                  <SelectTrigger className="w-full md:w-[200px] bg-background">
                    <SelectValue placeholder="Publisher" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Publishers</SelectItem>
                    {publishers?.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                      <SelectItem key={p.slug} value={p.slug}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Sort */}
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

        <div className="container mx-auto max-w-6xl px-4 py-8 space-y-16">

          {/* Currently Available */}
          <section>
            <div className="flex items-baseline justify-between mb-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold font-display tracking-tight text-foreground flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-40" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
                  </span>
                  Currently Available
                </h2>
                <p className="text-muted-foreground mt-1 font-mono text-sm">Open preorders & in-stock drops</p>
              </div>
              <div className="text-sm font-mono text-muted-foreground bg-secondary px-3 py-1 rounded-full">
                {isLoadingAvailable ? "…" : (availableData?.total ?? 0)}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {isLoadingAvailable ? (
                Array.from({ length: 4 }).map((_, i) => <GameCardSkeleton key={i} />)
              ) : availableData?.releases.length ? (
                availableData.releases.map((release, i) => (
                  <GameCard key={release.id} release={release} priority={i < 4} />
                ))
              ) : (
                <div className="col-span-full py-12 text-center bg-card/30 rounded-xl border border-dashed">
                  <p className="text-muted-foreground font-mono">No open preorders match your filters.</p>
                  <Button variant="link" onClick={clearFilters} className="mt-2">Clear filters</Button>
                </div>
              )}
            </div>
          </section>

          {/* Coming Soon */}
          <section>
            <div className="flex items-baseline justify-between mb-6">
              <div>
                <h2 className="text-xl md:text-2xl font-bold font-display tracking-tight text-foreground">
                  Coming Soon
                </h2>
                <p className="text-muted-foreground mt-1 font-mono text-sm">Announced, waiting for drop</p>
              </div>
              <div className="text-sm font-mono text-muted-foreground bg-secondary px-3 py-1 rounded-full">
                {isLoadingComingSoon ? "…" : (comingSoonData?.total ?? 0)}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {isLoadingComingSoon ? (
                Array.from({ length: 4 }).map((_, i) => <GameCardSkeleton key={i} />)
              ) : comingSoonData?.releases.length ? (
                comingSoonData.releases.map(release => (
                  <GameCard key={release.id} release={release} />
                ))
              ) : (
                <div className="col-span-full py-12 text-center bg-card/30 rounded-xl border border-dashed">
                  <p className="text-muted-foreground font-mono">No upcoming releases match your filters.</p>
                  {hasActiveFilters && (
                    <Button variant="link" onClick={clearFilters} className="mt-2">Clear filters</Button>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Recently Sold Out */}
          <section>
            <div className="flex items-baseline justify-between mb-6 opacity-70">
              <div>
                <h2 className="text-xl md:text-2xl font-bold font-display tracking-tight text-foreground">
                  Recently Sold Out
                </h2>
                <p className="text-muted-foreground mt-1 font-mono text-sm">Missed it</p>
              </div>
              <div className="text-sm font-mono text-muted-foreground bg-secondary px-3 py-1 rounded-full">
                {isLoadingSoldOut ? "…" : (soldOutData?.total ?? 0)}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {isLoadingSoldOut ? (
                Array.from({ length: 4 }).map((_, i) => <GameCardSkeleton key={i} />)
              ) : soldOutData?.releases.length ? (
                soldOutData.releases.map(release => (
                  <GameCard key={release.id} release={release} />
                ))
              ) : (
                <div className="col-span-full py-12 text-center bg-card/30 rounded-xl border border-dashed">
                  <p className="text-muted-foreground font-mono">No sold out releases match your filters.</p>
                  {hasActiveFilters && (
                    <Button variant="link" onClick={clearFilters} className="mt-2">Clear filters</Button>
                  )}
                </div>
              )}
            </div>
          </section>

        </div>
      </main>

      <NewsletterSignup />
      <Footer />
    </div>
  )
}
