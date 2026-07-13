import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "wouter"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { ControllerIcon } from "@/components/ControllerIcon"
import { Badge } from "@/components/ui/badge"
import { CONSOLE_IMAGES } from "@/lib/consoleImages"
import { ConsoleListingCard, ConsoleListingCardSkeleton, type ConsoleListing } from "@/components/ConsoleListingCard"
import { CONSOLE_SORT_OPTIONS, sortConsoleListings, type ConsoleSortValue } from "@/lib/consoleListingsSort"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useDocumentHead } from "@/hooks/useDocumentHead"
import { buildCanonicalUrl } from "@/lib/seo"
import { GENERATION_LABELS, GENERATION_BADGE_STYLES, type ConsoleGeneration } from "@/lib/consoleGenerations"
import { ArrowLeft, Search, ChevronDown, ArrowUpDown } from "lucide-react"

/** How many listings render initially, and how many more each "Show more" click reveals. */
const LISTINGS_PAGE_SIZE = 24

interface ConsoleDetailData {
  id:         string
  name:       string
  generation: ConsoleGeneration
  query:      string
  searchUrl:  string
  listings:   ConsoleListing[]
  updatedAt:  number | null
}

interface ConsoleDetailResponse {
  configured: boolean
  console:    ConsoleDetailData | null
}

async function fetchConsoleDetail(id: string): Promise<ConsoleDetailResponse> {
  const res = await fetch(`/api/consoles/${id}`)
  if (res.status === 404) return { configured: true, console: null }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export default function ConsoleDetail() {
  const { slug } = useParams<{ slug: string }>()

  const { data, isLoading } = useQuery({
    queryKey: ["console-detail", slug],
    queryFn:  () => fetchConsoleDetail(slug),
    staleTime: 60 * 60_000, // 1h client-side — server-side scheduler refreshes every 24h
    enabled:  !!slug,
  })

  const consoleData = data?.console ?? null
  const configured  = data?.configured ?? false
  const stockPhoto  = consoleData ? CONSOLE_IMAGES[consoleData.id] : undefined

  // Reveals more of the already-fetched/already-filtered cached listings —
  // purely client-side, no additional API calls. Resets whenever the console
  // changes so navigating between detail pages doesn't carry over state.
  const [visibleCount, setVisibleCount] = useState(LISTINGS_PAGE_SIZE)
  const [sortBy, setSortBy] = useState<ConsoleSortValue>("featured")
  useEffect(() => {
    setVisibleCount(LISTINGS_PAGE_SIZE)
    setSortBy("featured")
  }, [slug])

  // Sorting is entirely client-side over the already-cached listings — no
  // extra API calls, same data as "Featured" just reordered.
  const sortedListings = useMemo(
    () => sortConsoleListings(consoleData?.listings ?? [], sortBy),
    [consoleData, sortBy],
  )
  const visibleListings = sortedListings.slice(0, visibleCount)
  const hasMore = sortedListings.length > visibleCount

  useDocumentHead({
    title:       consoleData
      ? `${consoleData.name} — Live eBay Listings | DiscWatchHQ`
      : "Console Listings | DiscWatchHQ",
    description: consoleData
      ? `Multiple current eBay listings for the ${consoleData.name}, filtered to real complete consoles only — no manuals, parts, or accessories. Condition always clearly labeled.`
      : "Live eBay console listings.",
    canonical:   buildCanonicalUrl(`/consoles/${slug}`),
    jsonLd:      null,
  })

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Header />

      <main className="flex-1">
        <div className="container mx-auto max-w-[1600px] px-4 pt-6">
          <Link
            href="/consoles"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold px-3 py-1.5 hover:bg-primary/90 active:bg-primary/80 transition-colors font-mono"
          >
            <ArrowLeft size={14} />
            All consoles
          </Link>
        </div>

        {!isLoading && !consoleData ? (
          <div className="container mx-auto max-w-[1600px] px-4 py-16 text-center">
            <p className="text-lg font-semibold text-foreground">Console not found</p>
            <p className="text-muted-foreground mt-1 font-mono text-sm">
              This console isn't in our curated list.{" "}
              <Link href="/consoles" className="text-primary hover:underline">Browse all consoles</Link>
            </p>
          </div>
        ) : (
          <>
            <section className="relative overflow-hidden border-b bg-card mt-4">
              {/* Mobile: image spans full width and text is centered below it;
                  md+: reverts to the original side-by-side thumbnail layout. */}
              <div className="container relative mx-auto max-w-[1600px] px-4 py-8 md:py-10 flex flex-col md:flex-row gap-6 items-center md:items-center text-center md:text-left">
                <div className="relative w-full md:w-72 shrink-0 flex items-center justify-center md:justify-start">
                  {stockPhoto ? (
                    // No fixed-aspect box around the photo — sizing the box
                    // separately from the image's own aspect ratio is what
                    // left a visible letterboxed strip of the section's
                    // background color next to/around the photo. Letting
                    // the image size itself (capped by max-height) means
                    // there's no leftover box background to show at all.
                    <img
                      src={stockPhoto}
                      alt={consoleData?.name ?? ""}
                      className="max-h-64 w-auto max-w-full rounded-md object-contain shadow-sm"
                    />
                  ) : (
                    <div className="flex h-64 w-64 items-center justify-center rounded-md bg-secondary">
                      <ControllerIcon size={64} strokeWidth={2.5} className="opacity-45" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-center md:items-start">
                  {isLoading ? (
                    <div className="h-8 w-64 animate-pulse rounded bg-muted/60" />
                  ) : (
                    <>
                      {consoleData && (
                        <Badge
                          variant="outline"
                          className={`mb-2 font-semibold text-xs uppercase tracking-wide shadow-sm ${GENERATION_BADGE_STYLES[consoleData.generation]}`}
                        >
                          {GENERATION_LABELS[consoleData.generation]}
                        </Badge>
                      )}
                      <h1 className="text-2xl md:text-3xl font-bold font-display tracking-tight text-foreground">
                        {consoleData?.name}
                      </h1>
                      <p className="text-muted-foreground mt-1.5 font-mono text-sm">
                        {consoleData && consoleData.listings.length > 0
                          ? `${consoleData.listings.length} current listing${consoleData.listings.length === 1 ? "" : "s"} — real hardware only, filtered for junk`
                          : "No live listings right now"}
                      </p>
                      {consoleData?.searchUrl && (
                        <a
                          href={consoleData.searchUrl}
                          target="_blank"
                          rel="noopener noreferrer sponsored"
                          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-secondary/40 text-foreground/80 text-xs font-semibold uppercase tracking-wider px-4 py-2 hover:border-primary/50 hover:bg-secondary/60 transition-colors"
                        >
                          <Search size={12} />
                          Search all on eBay
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>
            </section>

            <div className="container mx-auto max-w-[1600px] px-4 py-8">
              {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                  {Array.from({ length: 8 }).map((_, i) => <ConsoleListingCardSkeleton key={i} />)}
                </div>
              ) : consoleData && consoleData.listings.length > 0 ? (
                <>
                  <div className="flex justify-end mb-4">
                    <Select value={sortBy} onValueChange={v => setSortBy(v as ConsoleSortValue)}>
                      <SelectTrigger
                        aria-label="Sort listings"
                        className="w-auto min-w-[170px] bg-card border-card-border shrink-0 text-sm gap-2"
                      >
                        <ArrowUpDown size={13} className="text-muted-foreground shrink-0" />
                        <SelectValue placeholder="Featured" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONSOLE_SORT_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                    {visibleListings.map((listing, i) => (
                      <ConsoleListingCard key={`${listing.url}-${i}`} listing={listing} />
                    ))}
                  </div>
                  {hasMore && (
                    <div className="flex flex-col items-center gap-2 mt-8">
                      <button
                        type="button"
                        onClick={() => setVisibleCount(c => c + LISTINGS_PAGE_SIZE)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 text-foreground/80 text-xs font-semibold uppercase tracking-wider px-5 py-2.5 hover:border-primary/50 hover:bg-secondary/60 transition-colors"
                      >
                        Show more
                        <ChevronDown size={14} />
                      </button>
                      <p className="text-muted-foreground font-mono text-xs">
                        Showing {visibleListings.length} of {consoleData.listings.length} — or{" "}
                        <a
                          href={consoleData.searchUrl}
                          target="_blank"
                          rel="noopener noreferrer sponsored"
                          className="text-primary hover:underline"
                        >
                          search all on eBay
                        </a>
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center text-center gap-4 py-12 border border-dashed border-border rounded-lg">
                  <p className="text-foreground font-semibold">
                    {configured
                      ? "No qualifying listings found right now"
                      : "Live listings aren't configured yet"}
                  </p>
                  <p className="text-muted-foreground font-mono text-sm max-w-md">
                    {configured
                      ? "We filter out manuals, parts, repairs, and accessories, so sometimes there's nothing left to show. Check back after the next refresh, or search directly on eBay."
                      : "In the meantime, search directly on eBay."}
                  </p>
                  {consoleData?.searchUrl && (
                    <a
                      href={consoleData.searchUrl}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-secondary/40 text-foreground/80 text-xs font-semibold uppercase tracking-wider px-4 py-2.5 hover:border-primary/50 hover:bg-secondary/60 transition-colors"
                    >
                      Search on eBay
                      <Search size={12} />
                    </a>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  )
}
