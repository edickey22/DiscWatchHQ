/**
 * CatalogListPage — full paginated listing for "Most Popular" or "New & Upcoming".
 *
 * Used by the "View all →" links on the Browse Games homepage sections.
 * Fetches from the same /api/games/popular and /api/games/new-releases endpoints,
 * supports full page-by-page navigation, and opens the GameDetailModal on card click.
 */

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "wouter"
import {
  ChevronLeft, ChevronRight, Star, CalendarDays, ArrowLeft, ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { CatalogGameCard, type CatalogGame } from "@/components/TgdbGameCard"
import { GameDetailModal } from "@/components/GameDetailModal"
import { useDocumentHead } from "@/hooks/useDocumentHead"
import { buildCanonicalUrl } from "@/lib/seo"

// ── Types ─────────────────────────────────────────────────────────────────────

interface ListResponse {
  results:  CatalogGame[]
  count:    number
  next:     number | null
  previous: number | null
}

export type CatalogListKind = "popular" | "new-releases" | "upcoming"

// ── Config per kind ───────────────────────────────────────────────────────────

const CONFIG = {
  "popular": {
    apiPath:     "/api/games/popular",
    title:       "Most Popular",
    description: "Top-rated physical games by Metacritic score — sourced from RAWG.",
    icon:        <Star size={20} className="text-primary" />,
    attribution: "Industry-wide by Metacritic score · RAWG",
    docTitle:    "Most Popular Games — By Metacritic Score | DiscWatchHQ",
    docDesc:     "Browse the highest-rated physical games across all platforms, ranked by Metacritic score.",
    canonical:   "/games/popular",
  },
  "new-releases": {
    apiPath:     "/api/games/new-releases",
    title:       "Recently Released",
    description: "Physical games released in the past 12 months, sorted by release date.",
    icon:        <CalendarDays size={20} className="text-primary" />,
    attribution: "Released in the past 12 months · Sorted newest first · RAWG",
    docTitle:    "Recently Released Games — New Physical Releases | DiscWatchHQ",
    docDesc:     "Browse newly released physical games across all platforms, sorted by release date.",
    canonical:   "/games/new-releases",
  },
  "upcoming": {
    apiPath:     "/api/games/upcoming",
    title:       "Upcoming",
    description: "Confirmed future releases ordered by launch date — soonest first.",
    icon:        <CalendarDays size={20} className="text-primary" />,
    attribution: "Confirmed future release dates · Sorted soonest first · RAWG",
    docTitle:    "Upcoming Games — Confirmed Physical Releases | DiscWatchHQ",
    docDesc:     "Browse upcoming physical game releases with confirmed launch dates, sorted soonest first.",
    canonical:   "/games/upcoming",
  },
} as const

const PAGE_SIZE = 20

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchList(apiPath: string, page: number): Promise<ListResponse> {
  const res = await fetch(`${apiPath}?page=${page}`)
  if (!res.ok) return { results: [], count: 0, next: null, previous: null }
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

// ── Main component ────────────────────────────────────────────────────────────

interface CatalogListPageProps {
  kind: CatalogListKind
}

export default function CatalogListPage({ kind }: CatalogListPageProps) {
  const cfg = CONFIG[kind]
  const [page, setPage]               = useState(1)
  const [selectedGame, setSelectedGame] = useState<CatalogGame | null>(null)

  useDocumentHead({
    title:     cfg.docTitle,
    description: cfg.docDesc,
    canonical: buildCanonicalUrl(cfg.canonical),
    jsonLd:    null,
  })

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey:  [kind, page],
    queryFn:   () => fetchList(cfg.apiPath, page),
    staleTime: 10 * 60 * 1_000,
    placeholderData: prev => prev,
  })

  const results    = data?.results ?? []
  const total      = data?.count   ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 container mx-auto max-w-[1600px] px-4 py-8">

        {/* ── Page header ── */}
        <div className="mb-8">
          {/* Back link */}
          <Link
            href="/games"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground/90 hover:text-primary transition-colors mb-4"
          >
            <ArrowLeft size={12} /> Browse Games
          </Link>

          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="font-display font-bold text-2xl md:text-3xl text-foreground flex items-center gap-2.5">
              {cfg.icon}
              {cfg.title}
            </h1>
            <p className="text-[11px] font-mono text-muted-foreground/90 uppercase tracking-wider">
              {cfg.attribution}
            </p>
          </div>
          <p className="text-base text-muted-foreground mt-1.5">{cfg.description}</p>

          {total > 0 && (
            <p className="text-xs font-mono text-muted-foreground/90 mt-1">
              {total.toLocaleString()} games
              {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
            </p>
          )}
        </div>

        {/* ── Grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 mb-8">
          {isLoading
            ? Array.from({ length: PAGE_SIZE }).map((_, i) => <GameCardSkeleton key={i} />)
            : results.map(game => (
                <CatalogGameCard key={game.id} game={game} onClick={setSelectedGame} />
              ))
          }
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo(0, 0) }}
              disabled={page <= 1 || isLoading}
              className="gap-1.5"
            >
              <ChevronLeft size={14} /> Previous
            </Button>
            <span className="text-sm text-muted-foreground font-mono">
              Page {page} of {totalPages.toLocaleString()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo(0, 0) }}
              disabled={page >= totalPages || isLoading}
              className="gap-1.5"
            >
              Next <ChevronRight size={14} />
            </Button>
          </div>
        )}

        {/* ── Attribution ── */}
        <div className="border-t border-border/20 pt-4 mt-8">
          <p className="text-xs text-muted-foreground/90 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>Data from</span>
            <a
              href="https://rawg.io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-primary/95 hover:text-primary underline underline-offset-2 transition-colors font-medium"
            >
              RAWG <ExternalLink size={9} />
            </a>
          </p>
        </div>
      </main>

      <Footer />

      <GameDetailModal
        game={selectedGame}
        onClose={() => setSelectedGame(null)}
      />
    </div>
  )
}
