import { Link, useLocation } from "wouter"
import { useQuery } from "@tanstack/react-query"
import { ControllerIcon } from "@/components/ControllerIcon"
import { useGetReleaseStats } from "@workspace/api-client-react"

async function fetchCatalogStats(): Promise<{ count: number }> {
  const res = await fetch("/api/catalog/stats")
  if (!res.ok) return { count: 0 }
  return res.json()
}

export function Header() {
  const { data: stats }        = useGetReleaseStats()
  const { data: catalogStats } = useQuery({
    queryKey:  ["catalog-stats"],
    queryFn:   fetchCatalogStats,
    staleTime: 5 * 60 * 1_000,
  })
  const [location] = useLocation()

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container mx-auto max-w-6xl px-4 flex h-16 items-center justify-between gap-4">

        {/* ── Wordmark ─────────────────────────────────────────────────── */}
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <ControllerIcon size={30} />
          <span className="flex items-center gap-1.5 leading-none">
            <span className="font-display text-[1.2rem] font-bold tracking-tight">
              <span className="text-gray-900 dark:text-foreground">Disc</span>
              <span className="text-primary">Watch</span>
            </span>
            <span className="
              text-[10px] font-bold tracking-wide leading-none
              text-primary border border-primary/40 bg-primary/10
              rounded px-1.5 py-0.5 select-none
            ">
              HQ
            </span>
          </span>
        </Link>

        {/* ── Page navigation ───────────────────────────────────────────── */}
        <nav className="hidden sm:flex items-center gap-1 text-[13px] font-medium">
          <Link
            href="/"
            className={`px-3 py-1.5 rounded transition-colors ${
              location === "/"
                ? "text-foreground bg-secondary/60"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
            }`}
          >
            Boutique
          </Link>
          <Link
            href="/games"
            className={`px-3 py-1.5 rounded transition-colors ${
              location === "/games"
                ? "text-foreground bg-secondary/60"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
            }`}
          >
            Browse Games
          </Link>
        </nav>

        {/* ── Live stats ────────────────────────────────────────────────── */}
        <div className="hidden md:flex items-center gap-5 text-sm font-mono tracking-tight shrink-0">
          {stats && (
            <>
              <div className="flex flex-col items-center">
                <span className="text-muted-foreground text-[10px] uppercase">Available</span>
                <span className="text-primary font-bold">{stats.available}</span>
              </div>
              <div className="w-px h-6 bg-border" />
              <div className="flex flex-col items-center">
                <span className="text-muted-foreground text-[10px] uppercase">Coming Soon</span>
                <span className="text-foreground font-semibold">{stats.comingSoon}</span>
              </div>
              <div className="w-px h-6 bg-border" />
              <div className="flex flex-col items-center">
                <span className="text-muted-foreground text-[10px] uppercase">Boutique</span>
                <span className="text-foreground/80">{stats.totalTracked}</span>
              </div>
            </>
          )}
          {catalogStats && catalogStats.count > 0 && (
            <>
              <div className="w-px h-6 bg-border" />
              <div className="flex flex-col items-center">
                <span className="text-muted-foreground text-[10px] uppercase">Catalog</span>
                <span className="text-foreground/70">{catalogStats.count.toLocaleString()}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
