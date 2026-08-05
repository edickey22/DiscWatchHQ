import { useState, useRef, useEffect } from "react"
import { Link, useLocation } from "wouter"
import { useQuery } from "@tanstack/react-query"
import { Menu, Heart, User, LogOut, ChevronDown } from "lucide-react"
import { ControllerIcon } from "@/components/ControllerIcon"
import { useGetReleaseStats } from "@workspace/api-client-react"
import { useAuth } from "@/context/AuthContext"
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
  { href: "/about",    label: "About" },
]

async function fetchCatalogStats(): Promise<{ count: number }> {
  const res = await fetch("/api/catalog/stats")
  if (!res.ok) return { count: 0 }
  return res.json()
}

// ── User menu dropdown ─────────────────────────────────────────────────────────

function UserMenu() {
  const { user, logout, openLogin } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [, navigate] = useLocation()

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  if (!user) {
    return (
      <button
        onClick={openLogin}
        className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-[13px] font-semibold text-primary hover:bg-primary/20 transition-colors"
      >
        Sign in
      </button>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-2.5 py-1.5 text-[13px] font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <div className="w-5 h-5 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
          <User size={11} className="text-primary" />
        </div>
        <span className="max-w-[100px] truncate text-xs">{user.email.split("@")[0]}</span>
        <ChevronDown size={12} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-border bg-background shadow-2xl z-50 overflow-hidden">
          {/* Email */}
          <div className="px-3 py-2.5 border-b border-border/60">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Signed in as</p>
            <p className="text-xs text-foreground font-medium truncate mt-0.5">{user.email}</p>
          </div>

          {/* Actions */}
          <div className="p-1">
            <button
              onClick={() => { setOpen(false); navigate("/tracking") }}
              className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors text-left"
            >
              <Heart size={14} /> My Watchlist
            </button>
            <button
              onClick={() => { setOpen(false); navigate("/profile") }}
              className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors text-left"
            >
              <User size={14} /> Profile
            </button>
          </div>

          <div className="p-1 border-t border-border/60">
            <button
              onClick={async () => { setOpen(false); await logout(); navigate("/") }}
              className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors text-left"
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Header ─────────────────────────────────────────────────────────────────────

export function Header() {
  const { data: stats }        = useGetReleaseStats()
  const { data: catalogStats } = useQuery({
    queryKey:  ["catalog-stats"],
    queryFn:   fetchCatalogStats,
    staleTime: 5 * 60 * 1_000,
  })
  const [location] = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, openLogin, logout } = useAuth()

  const navLink = (href: string, label: string, exact = true) => {
    const isActive = exact ? location === href : location.startsWith(href)
    return (
      <Link
        href={href}
        className={`px-3 py-1.5 rounded transition-colors text-[13px] font-medium whitespace-nowrap ${
          isActive
            ? "text-primary bg-primary/15"
            : "text-muted-foreground hover:text-primary hover:bg-primary/10"
        }`}
      >
        {label}
      </Link>
    )
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="w-full px-6 flex h-16 items-center gap-0">

        {/* ── 1. LOGO — pinned to the far left ─────────────────────────── */}
        <Link href="/" className="flex items-center gap-1.5 lg:gap-2.5 group shrink-0">
          <span className="[&>svg]:w-[22px] [&>svg]:h-[22px] lg:[&>svg]:w-[30px] lg:[&>svg]:h-[30px]">
            <ControllerIcon size={30} />
          </span>
          <span className="flex items-center gap-1 lg:gap-1.5 leading-none">
            <span className="font-display text-[1.05rem] lg:text-[1.2rem] font-bold tracking-tight">
              <span className="text-gray-900 dark:text-foreground">Disc</span>
              <span className="text-primary">Watch</span>
            </span>
            <span className="
              text-[9px] lg:text-[10px] font-bold tracking-wide leading-none
              text-primary border border-primary/40 bg-primary/10
              rounded px-1 lg:px-1.5 py-0.5 select-none
            ">
              HQ
            </span>
          </span>
        </Link>

        {/* ── LEFT SPACER — equal flex weight with the right spacer so the
             nav group lands centered between logo and the stats block. ──── */}
        <div className="flex-1" />

        {/* ── 2. MAIN NAV ───────────────────────────────────────────────── */}
        <nav className="hidden sm:flex items-center gap-1 shrink-0">
          {navLink("/games",    "Browse Games")}
          {navLink("/boutique", "Boutique")}
          {navLink("/consoles", "Consoles")}
          {navLink("/about",    "About")}
        </nav>

        {/* ── RIGHT SPACER — mirrors the left spacer; equal flex weights
             center the nav between logo and stats at every viewport width. ── */}
        <div className="flex-1" />

        {/* ── 3. STATS — live boutique + catalog numbers ───────────────── */}
        {/* Vertical divider that marks the boundary between nav and stats  */}
        <div className="hidden xl:flex items-center self-stretch">
          <div className="w-px h-7 bg-border mx-5" />
        </div>

        <div className="hidden xl:flex items-center gap-4 text-sm font-mono tracking-tight shrink-0">
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

        {/* ── 4. ACCOUNT — pinned to the far right ─────────────────────── */}
        {/* Divider + deliberate breathing room between stats and account */}
        <div className="hidden xl:block w-px h-6 bg-border/60 mx-6" />

        {/* User menu (desktop) */}
        <div className="hidden sm:block shrink-0">
          <UserMenu />
        </div>

        {/* Mobile hamburger */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open menu"
                className="sm:hidden inline-flex items-center justify-center rounded-md h-9 w-9 text-primary hover:text-primary/80 hover:bg-secondary/50 transition-colors"
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
                          ? "text-primary bg-primary/15 border border-primary/30"
                          : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                      }`}
                    >
                      {label}
                    </Link>
                  )
                })}
                {/* Auth actions in mobile menu */}
                <div className="border-t border-border/60 mt-2 pt-2 space-y-1">
                  {user ? (
                    <>
                      <Link
                        href="/tracking"
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-2 px-4 py-3 rounded-md text-base font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Heart size={16} /> My Watchlist
                      </Link>
                      <Link
                        href="/profile"
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-2 px-4 py-3 rounded-md text-base font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <User size={16} /> Profile
                      </Link>
                      <button
                        onClick={async () => { setMobileOpen(false); await logout() }}
                        className="w-full flex items-center gap-2 px-4 py-3 rounded-md text-base font-medium text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors text-left"
                      >
                        <LogOut size={16} /> Sign out
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setMobileOpen(false); openLogin() }}
                      className="w-full flex items-center gap-2 px-4 py-3 rounded-md text-base font-semibold text-primary bg-primary/10 border border-primary/30 transition-colors text-left"
                    >
                      Sign in
                    </button>
                  )}
                </div>
              </nav>
            </SheetContent>
          </Sheet>
      </div>
    </header>
  )
}
