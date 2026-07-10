/**
 * LandingPage — DiscWatchHQ hero/home experience.
 *
 * Visual concept: "The War Room" — Netflix-style tile wallpaper
 * Seven vertical columns of real RAWG game cover art scroll continuously at
 * independent speeds, alternating directions, creating a living mosaic behind
 * the hero. Column speeds range from 24 s (fast) to 52 s (slow) to produce
 * layered parallax depth without any JS-driven repaints.
 *
 * Cover art sourcing policy:
 *   Only actual published game key art from the RAWG API (background_image
 *   field) is displayed — same informational/reference context as RAWG,
 *   Metacritic, and Wikipedia. No generated, fabricated, or hotlinked artwork.
 *   Attribution: "Powered by RAWG" link present on this page per API ToS.
 *
 * Performance:
 *   • Pure CSS keyframe animations — no JS animation loop.
 *   • `will-change: transform` promotes each column to its own GPU layer.
 *   • `loading="lazy"` on all tile images; `decoding="async"` for off-thread decode.
 *   • Tiles are `aria-hidden` — purely decorative; no alt text needed.
 */

import { Link } from "wouter"
import { useQuery } from "@tanstack/react-query"
import { ChevronRight, Zap, Clock, ShoppingBag, Library, Bell, Search, ExternalLink } from "lucide-react"

import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { Button } from "@/components/ui/button"
import { useGetReleaseStats } from "@workspace/api-client-react"
import { useDocumentHead } from "@/hooks/useDocumentHead"
import { buildCanonicalUrl } from "@/lib/seo"

// ── Data fetching ─────────────────────────────────────────────────────────────

interface Cover { coverImageUrl: string; title: string }

async function fetchCovers(): Promise<Cover[]> {
  const res = await fetch("/api/games/landing-covers")
  if (!res.ok) return []
  const data = await res.json()
  return (data.covers ?? []).filter((g: Cover) => g.coverImageUrl)
}

async function fetchCatalogStats(): Promise<{ count: number }> {
  const res = await fetch("/api/catalog/stats")
  if (!res.ok) return { count: 0 }
  return res.json()
}

const PUBLISHERS = [
  "Limited Run Games",
  "Strictly Limited Games",
  "iam8bit",
  "Super Rare Games",
  "Fangamer",
  "Xbox Game Studios Shop",
  "Blizzard Gear Store",
]

// ── Column config ─────────────────────────────────────────────────────────────
// Seven columns, alternating up/down, staggered speeds for parallax depth.
// Duration in seconds — odd indices scroll down, even scroll up.
const COLUMN_CONFIG = [
  { duration: 52, reverse: false }, // col 0: slowest, up
  { duration: 30, reverse: true  }, // col 1: fast, down
  { duration: 44, reverse: false }, // col 2: medium, up
  { duration: 25, reverse: true  }, // col 3: fastest, down — eye-catching centre
  { duration: 48, reverse: false }, // col 4: slow, up
  { duration: 35, reverse: true  }, // col 5: medium-fast, down
  { duration: 28, reverse: false }, // col 6: fast, up
] as const

// ── Scrolling tile column ─────────────────────────────────────────────────────

function TileColumn({
  covers,
  colIndex,
}: {
  covers: Cover[]
  colIndex: number
}) {
  const { duration, reverse } = COLUMN_CONFIG[colIndex]
  // Duplicate for seamless infinite loop; minimum 6 tiles to fill viewport
  const tiles = covers.length < 4
    ? [...covers, ...covers, ...covers, ...covers]
    : [...covers, ...covers]

  if (!tiles.length) return null

  // Unique animation name per column — avoids any shared keyframe conflict
  const animName = `dwTile${colIndex}`

  return (
    <div
      className="flex-1 overflow-hidden"
      style={{ contain: "layout style" }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes ${animName} {
          from { transform: translateY(${reverse ? "-50%" : "0"}); }
          to   { transform: translateY(${reverse ? "0" : "-50%"}); }
        }
      `}</style>
      <div
        style={{
          animation:   `${animName} ${duration}s linear infinite`,
          willChange:  "transform",
        }}
      >
        {tiles.map((c, i) => (
          <div
            key={i}
            className="w-full overflow-hidden mb-1"
            style={{ aspectRatio: "3/4" }}
          >
            <img
              src={c.coverImageUrl}
              alt=""
              className="w-full h-full object-cover object-center"
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  useDocumentHead({
    title:       "DiscWatchHQ — Find Any Game, Buy Anywhere",
    description: "Search 899,000+ physical games across every platform and generation. Jump directly to GameStop, Amazon, eBay, and Best Buy. Plus real-time boutique limited-run drop tracking.",
    canonical:   buildCanonicalUrl("/"),
    jsonLd:      null,
  })

  const { data: stats }        = useGetReleaseStats()
  const { data: catalogStats } = useQuery({
    queryKey:  ["catalog-stats"],
    queryFn:   fetchCatalogStats,
    staleTime: 5 * 60_000,
  })
  const { data: covers = [] } = useQuery({
    queryKey:  ["landing-covers-v2"],
    queryFn:   fetchCovers,
    staleTime: 60 * 60_000,
  })

  // Round-robin distribution across 7 columns
  const colCovers = (idx: number) => covers.filter((_, i) => i % 7 === idx)

  // Show tiles on mobile only if we have enough images (avoid sparse look)
  const hasTiles = covers.length >= 7

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* ════════════════════════════════════════════════════════════════════
          HERO
      ════════════════════════════════════════════════════════════════════ */}
      <section className="relative flex items-center min-h-[calc(100vh-4rem)] overflow-hidden">

        {/* ── Tile wallpaper ── */}
        {hasTiles && (
          <div
            className="absolute inset-0 overflow-hidden"
            aria-hidden="true"
          >
            {/* Tile grid: 4 cols on mobile → 7 on lg */}
            <div
              className="h-full flex gap-1"
              style={{ opacity: 0.3 }}
            >
              {COLUMN_CONFIG.map((_, idx) => (
                <div
                  key={idx}
                  // Hide the rightmost 3 columns on small screens for density
                  className={idx >= 4 ? "hidden lg:block flex-1" : "flex-1"}
                  style={{ minWidth: 0 }}
                >
                  <TileColumn covers={colCovers(idx)} colIndex={idx} />
                </div>
              ))}
            </div>

            {/* Left vignette — keeps hero text fully legible */}
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/92 to-background/20 pointer-events-none" />
            {/* Top vignette */}
            <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-transparent to-background/80 pointer-events-none" />
          </div>
        )}

        {/* Fallback solid dark bg while covers load */}
        {!hasTiles && (
          <div className="absolute inset-0 bg-gradient-to-br from-background to-secondary/30" />
        )}

        {/* ── Hero content ── */}
        <div className="relative z-10 container mx-auto max-w-6xl px-4 py-24">
          <div className="max-w-2xl">

            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 text-[11px] font-bold font-mono uppercase tracking-widest text-primary border border-primary/30 bg-primary/10 px-3 py-1.5 rounded-full mb-8 select-none">
              <Zap size={10} />
              Search 899,000+ games · 4 major retailers
            </div>

            {/* Headline */}
            <h1 className="font-display text-[clamp(3.5rem,10vw,6.5rem)] font-black tracking-tight leading-[0.9] text-foreground mb-7">
              FIND ANY<br />
              GAME.<br />
              <span className="text-primary">BUY ANYWHERE.</span>
            </h1>

            {/* Sub-headline */}
            <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed mb-10 max-w-lg">
              Search the full physical game catalog — classic to current, every platform —
              and jump straight to{" "}
              <span className="text-foreground font-medium">GameStop</span>,{" "}
              <span className="text-foreground font-medium">Amazon</span>,{" "}
              <span className="text-foreground font-medium">eBay</span>, and{" "}
              <span className="text-foreground font-medium">Best Buy</span>.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4 mb-16">
              <Button
                asChild size="lg"
                className="h-14 px-8 text-base font-bold gap-2 shadow-lg shadow-primary/25"
              >
                <Link href="/games">
                  Browse Games <ChevronRight size={18} />
                </Link>
              </Button>
              <Button
                asChild size="lg" variant="outline"
                className="h-14 px-8 text-base font-semibold border-foreground/20 hover:border-foreground/40"
              >
                <Link href="/boutique">Boutique Tracker</Link>
              </Button>
            </div>

            {/* Live stats — searchable catalog leads, indexed/boutique secondary */}
            <div className="flex flex-wrap items-center gap-6 sm:gap-10">
              {/* Primary claim: RAWG's full searchable catalog (899,617 confirmed) */}
              <div>
                <div className="text-3xl sm:text-4xl font-display font-black text-primary tabular-nums">
                  899K+
                </div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">
                  Games Searchable
                </div>
              </div>
              <div className="w-px h-10 bg-border hidden sm:block" />
              {catalogStats && catalogStats.count > 0 && (
                <>
                  <div>
                    <div className="text-3xl sm:text-4xl font-display font-black text-foreground/60 tabular-nums">
                      {catalogStats.count.toLocaleString()}
                    </div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">
                      Indexed &amp; Growing
                    </div>
                  </div>
                  <div className="w-px h-10 bg-border hidden sm:block" />
                </>
              )}
              <div>
                <div className="text-3xl sm:text-4xl font-display font-black text-foreground/70 tabular-nums">
                  4
                </div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">
                  Retailers Linked
                </div>
              </div>
              {stats && stats.available > 0 && (
                <>
                  <div className="w-px h-10 bg-border hidden sm:block" />
                  <div>
                    <div className="text-3xl sm:text-4xl font-display font-black text-foreground/50 tabular-nums">
                      {stats.available}
                    </div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">
                      Boutique Drops Live
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* RAWG attribution — required by RAWG API ToS for pages displaying their data */}
            {hasTiles && (
              <p className="mt-8 text-[10px] font-mono text-muted-foreground/35 flex items-center gap-1">
                Background art powered by{" "}
                <a
                  href="https://rawg.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground/50 hover:text-primary underline underline-offset-2 inline-flex items-center gap-0.5 transition-colors"
                >
                  RAWG <ExternalLink size={8} />
                </a>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          HOW IT WORKS
      ════════════════════════════════════════════════════════════════════ */}
      <section className="border-t border-border/30 py-20 bg-secondary/20">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="font-display text-3xl font-bold text-foreground mb-12">
            How it works
          </h2>
          <div className="grid sm:grid-cols-3 gap-10">
            <div className="space-y-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Search className="text-primary" size={18} />
              </div>
              <h3 className="font-display font-bold text-xl text-foreground">Search any title</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Search 899,000+ games across every platform and generation — NES to PS5,
                retro to new releases. Filter by platform, sort by Metacritic score or
                release date. Results are cached locally for instant repeat searches.
              </p>
            </div>
            <div className="space-y-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <ShoppingBag className="text-primary" size={18} />
              </div>
              <h3 className="font-display font-bold text-xl text-foreground">Buy at four retailers</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Every game card links directly to GameStop, Amazon, eBay, and Best Buy.
                One search, four storefronts — find the best price or availability without
                tabbing between sites.
              </p>
            </div>
            <div className="space-y-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Clock className="text-primary" size={18} />
              </div>
              <h3 className="font-display font-bold text-xl text-foreground">Boutique drop tracker</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Limited-run physical releases from boutique publishers like Limited Run
                Games and Strictly Limited are monitored every 2 hours — Available&nbsp;Now,
                Coming&nbsp;Soon, and Sold&nbsp;Out with preorder countdowns.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          PATHWAY CARDS
      ════════════════════════════════════════════════════════════════════ */}
      <section className="py-16 border-t border-border/30">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="grid sm:grid-cols-2 gap-5">

            {/* Browse Games — primary */}
            <Link
              href="/games"
              className="group block rounded-2xl border border-primary/25 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all duration-200 p-8"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Library className="text-primary" size={22} />
                </div>
                <ChevronRight
                  className="text-primary/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all mt-1"
                  size={20}
                />
              </div>
              <h3 className="font-display font-black text-2xl text-foreground mb-2">Browse Games</h3>
              <p className="text-muted-foreground text-sm leading-relaxed mb-5">
                Explore the full game catalog — popular titles, new releases, every
                platform from NES to PS5 — with direct retailer buy links.
              </p>
              <div className="text-xs font-mono text-primary/60 uppercase tracking-wider">
                {catalogStats?.count?.toLocaleString() ?? "—"} games in catalog →
              </div>
            </Link>

            {/* Boutique Tracker — secondary */}
            <Link
              href="/boutique"
              className="group block rounded-2xl border border-border/40 bg-card hover:border-border hover:bg-secondary/30 transition-all duration-200 p-8"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
                  <Bell className="text-foreground/70" size={22} />
                </div>
                <ChevronRight
                  className="text-muted-foreground/40 group-hover:text-foreground/60 group-hover:translate-x-0.5 transition-all mt-1"
                  size={20}
                />
              </div>
              <h3 className="font-display font-black text-2xl text-foreground mb-2">Boutique Tracker</h3>
              <p className="text-muted-foreground text-sm leading-relaxed mb-5">
                Real-time scarcity tracking for limited-run physical releases from 7
                boutique publishers. Preorder windows, countdowns, and secondary-market
                links for sold-out titles.
              </p>
              <div className="text-xs font-mono text-muted-foreground/50 uppercase tracking-wider">
                {stats?.available ?? "—"} available now · {stats?.comingSoon ?? "—"} coming soon →
              </div>
            </Link>

          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          PUBLISHER LIST
      ════════════════════════════════════════════════════════════════════ */}
      <section className="py-10 border-t border-border/20">
        <div className="container mx-auto max-w-6xl px-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/40 mb-4">
            Boutique publishers we monitor
          </p>
          <div className="flex flex-wrap gap-2.5">
            {PUBLISHERS.map(pub => (
              <span
                key={pub}
                className="text-xs font-mono text-muted-foreground/50 border border-border/25 px-3 py-1.5 rounded-full"
              >
                {pub}
              </span>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
