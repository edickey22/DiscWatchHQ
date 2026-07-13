import { useState } from "react"
import { Link, useLocation } from "wouter"
import { useQuery } from "@tanstack/react-query"
import { Menu } from "lucide-react"
import { ControllerIcon } from "@/components/ControllerIcon"
import { useGetReleaseStats } from "@workspace/api-client-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

const NAV_ITEMS = [
  { href: "/games",    label: "Browse Games" },
  { href: "/boutique", label: "Boutique" },
  { href: "/consoles", label: "Consoles" },
]

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
  const [mobileOpen, setMobileOpen] = useState(false)

  const navLink = (href: string, label: string, exact = true) => {
    const isActive = exact ? location === href : location.startsWith(href)
    return (
      <Link
        href={href}
        className={`px-3 py-1.5 rounded transition-colors text-[13px] font-medium ${
          isActive
            ? "text-foreground bg-secondary/60"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
        }`}
      >
        {label}
      </Link>
    )
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container mx-auto max-w-6xl px-4 flex h-16 items-center justify-between gap-4">

        {/* ── Wordmark → landing page ──────────────────────────────────── */}
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

        {/* ── Page navigation — Browse Games first (primary catalog) ────── */}
        <nav className="hidden sm:flex items-center gap-1">
          {navLink("/games",    "Browse Games")}
          {navLink("/boutique", "Boutique")}
          {navLink("/consoles", "Consoles")}
        </nav>

        {/* ── Mobile nav trigger ───────────────────────────────────────── */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open menu"
              className="sm:hidden inline-flex items-center justify-center rounded-md h-9 w-9 text-foreground/80 hover:text-foreground hover:bg-secondary/50 transition-colors"
            >
              <Menu size={22} />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-4/5 max-w-xs bg-background border-border p-0 flex flex-col">
            <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60 text-left">
              <SheetTitle className="flex items-center gap-2">
                <ControllerIcon size={22} />
                <span className="font-display font-bold">
                  <span className="text-foreground">Disc</span>
                  <span className="text-primary">Watch</span>
                </span>
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col p-3 gap-1">
              {NAV_ITEMS.map(({ href, label }) => {
                const isActive = location === href
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={`px-4 py-3 rounded-md text-base font-medium transition-colors ${
                      isActive
                        ? "text-foreground bg-primary/10 border border-primary/30"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    {label}
                  </Link>
                )
              })}
            </nav>
          </SheetContent>
        </Sheet>

        {/* ── Live stats ────────────────────────────────────────────────────
            Two distinct data sources, kept visually grouped so the numbers
            read as "what we track" (boutique limited-run releases) vs.
            "what we can look up" (the full searchable game catalog) rather
            than one flat undifferentiated row. */}
        <div className="hidden md:flex items-center gap-5 text-sm font-mono tracking-tight shrink-0">
          {stats && (
            <div className="flex items-center gap-4" title="Limited-run boutique releases this site tracks across publisher storefronts">
              <span className="text-[9px] font-sans font-semibold uppercase tracking-widest text-muted-foreground/60 mr-0.5">
                Boutique
              </span>
              <div className="flex flex-col items-center" title="Open for order right now">
                <span className="text-muted-foreground text-[10px] uppercase">In Stock</span>
                <span className="text-primary font-bold">{stats.available}</span>
              </div>
              <div className="w-px h-6 bg-border" />
              <div className="flex flex-col items-center" title="Announced, not yet open for order">
                <span className="text-muted-foreground text-[10px] uppercase">Coming Soon</span>
                <span className="text-foreground font-semibold">{stats.comingSoon}</span>
              </div>
              <div className="w-px h-6 bg-border" />
              <div className="flex flex-col items-center" title="Previously tracked, no longer available new — check eBay">
                <span className="text-muted-foreground text-[10px] uppercase">Sold Out</span>
                <span className="text-foreground/80">{stats.soldOut}</span>
              </div>
            </div>
          )}
          {catalogStats && catalogStats.count > 0 && (
            <>
              <div className="w-px h-7 bg-border/80" />
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-sans font-semibold uppercase tracking-widest text-muted-foreground/60">
                  Catalog
                </span>
                <div className="flex flex-col items-center" title="Games indexed locally — full 900K+ catalog searchable via live lookup on Browse Games">
                  <span className="text-muted-foreground text-[10px] uppercase">Indexed</span>
                  <span className="text-foreground/70">{catalogStats.count.toLocaleString()}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
