import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "wouter"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { ControllerIcon } from "@/components/ControllerIcon"
import { CONSOLE_IMAGES } from "@/lib/consoleImages"
import { ConsoleListingCard, ConsoleListingCardSkeleton, type ConsoleListing } from "@/components/ConsoleListingCard"
import { useDocumentHead } from "@/hooks/useDocumentHead"
import { buildCanonicalUrl } from "@/lib/seo"
import { ArrowLeft, Search } from "lucide-react"

interface ConsoleDetailData {
  id:         string
  name:       string
  generation: "current" | "previous" | "retro"
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

const GENERATION_LABELS: Record<ConsoleDetailData["generation"], string> = {
  current:  "Current-Gen",
  previous: "Previous-Gen",
  retro:    "Retro",
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
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Link href="/consoles" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors font-mono">
              <ArrowLeft size={14} />
              All consoles
            </Link>
            {consoleData?.searchUrl && (
              <a
                href={consoleData.searchUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-secondary/40 text-foreground/80 text-xs font-semibold uppercase tracking-wider px-4 py-2 hover:border-primary/50 hover:bg-secondary/60 transition-colors"
              >
                <Search size={12} />
                Search all on eBay
              </a>
            )}
          </div>
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
              <div className="container relative mx-auto max-w-[1600px] px-4 py-8 md:py-10 flex flex-col md:flex-row gap-6 items-start md:items-center">
                <div className="relative aspect-[5/4] w-40 shrink-0 overflow-hidden rounded-md bg-muted shadow-sm">
                  {stockPhoto ? (
                    <img src={stockPhoto} alt={consoleData?.name ?? ""} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-secondary">
                      <ControllerIcon size={40} strokeWidth={2.5} className="opacity-45" />
                    </div>
                  )}
                </div>
                <div>
                  {isLoading ? (
                    <div className="h-8 w-64 animate-pulse rounded bg-muted/60" />
                  ) : (
                    <>
                      <span className="inline-block text-xs font-mono uppercase tracking-wide text-primary/90 mb-1.5">
                        {consoleData && GENERATION_LABELS[consoleData.generation]}
                      </span>
                      <h1 className="text-2xl md:text-3xl font-bold font-display tracking-tight text-foreground">
                        {consoleData?.name}
                      </h1>
                      <p className="text-muted-foreground mt-1.5 font-mono text-sm">
                        {consoleData && consoleData.listings.length > 0
                          ? `${consoleData.listings.length} current listing${consoleData.listings.length === 1 ? "" : "s"} — real hardware only, filtered for junk`
                          : "No live listings right now"}
                      </p>
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
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                  {consoleData.listings.map((listing, i) => (
                    <ConsoleListingCard key={`${listing.url}-${i}`} listing={listing} />
                  ))}
                </div>
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
