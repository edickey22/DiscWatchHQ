import { useState, useMemo } from "react"
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

export default function Home() {
  const [search, setSearch] = useState("")
  const [platform, setPlatform] = useState<string>("_all")
  const [publisher, setPublisher] = useState<string>("_all")
  
  const debouncedSearch = useDebounce(search, 300)

  const { data: platforms } = useListPlatforms()
  const { data: publishers } = useListPublishers()

  const queryParams = useMemo(() => {
    const params: any = {}
    if (platform !== "_all") params.platform = platform
    if (publisher !== "_all") params.publisher = publisher
    if (debouncedSearch) params.search = debouncedSearch
    return params
  }, [platform, publisher, debouncedSearch])

  const { data: availableData, isLoading: isLoadingAvailable } = useListAvailableReleases(queryParams)
  const { data: comingSoonData, isLoading: isLoadingComingSoon } = useListComingSoonReleases(queryParams)
  const { data: soldOutData, isLoading: isLoadingSoldOut } = useListSoldOutReleases(queryParams)

  const clearFilters = () => {
    setSearch("")
    setPlatform("_all")
    setPublisher("_all")
  }

  const hasActiveFilters = search !== "" || platform !== "_all" || publisher !== "_all"

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Header />
      
      <main className="flex-1">
        {/* Filters Section */}
        <section className="bg-card border-b sticky top-16 z-30 shadow-sm">
          <div className="container mx-auto max-w-6xl px-4 py-4">
            <div className="flex flex-col md:flex-row gap-4 items-center">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search titles..." 
                  className="pl-9 bg-background"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              
              <div className="flex gap-2 w-full md:w-auto">
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger className="w-full md:w-[180px] bg-background">
                    <SelectValue placeholder="Platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Platforms</SelectItem>
                    {platforms?.map(p => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.name} ({p.releaseCount})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={publisher} onValueChange={setPublisher}>
                  <SelectTrigger className="w-full md:w-[220px] bg-background">
                    <SelectValue placeholder="Publisher" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Publishers</SelectItem>
                    {publishers?.map(p => (
                      <SelectItem key={p.slug} value={p.slug}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {hasActiveFilters && (
                  <Button variant="ghost" size="icon" onClick={clearFilters} title="Clear filters">
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
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-40"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                  </span>
                  Currently Available
                </h2>
                <p className="text-muted-foreground mt-1 font-mono text-sm">Open preorders & in-stock drops</p>
              </div>
              <div className="text-sm font-mono text-muted-foreground bg-secondary px-3 py-1 rounded-full">
                {isLoadingAvailable ? "..." : availableData?.total || 0}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {isLoadingAvailable ? (
                Array.from({ length: 4 }).map((_, i) => <GameCardSkeleton key={i} />)
              ) : availableData?.releases.length ? (
                availableData.releases.map(release => (
                  <GameCard key={release.id} release={release} />
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
                {isLoadingComingSoon ? "..." : comingSoonData?.total || 0}
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
                </div>
              )}
            </div>
          </section>

          {/* Sold Out */}
          <section>
            <div className="flex items-baseline justify-between mb-6 opacity-70">
              <div>
                <h2 className="text-xl md:text-2xl font-bold font-display tracking-tight text-foreground">
                  Recently Sold Out
                </h2>
                <p className="text-muted-foreground mt-1 font-mono text-sm">Missed it</p>
              </div>
              <div className="text-sm font-mono text-muted-foreground bg-secondary px-3 py-1 rounded-full">
                {isLoadingSoldOut ? "..." : soldOutData?.total || 0}
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
