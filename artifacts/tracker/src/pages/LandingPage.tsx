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

import { type ReactNode, useMemo } from "react"
import { Link } from "wouter"
import { useQuery } from "@tanstack/react-query"
import { ChevronRight, Zap, Clock, ShoppingBag, Library, Bell, Search, ExternalLink } from "lucide-react"
import { ControllerIcon } from "@/components/ControllerIcon"

import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { Button } from "@/components/ui/button"
import { useGetReleaseStats, useListPublishers } from "@workspace/api-client-react"
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

// Live console model count — never hardcode this; it drifts whenever
// consoleModels.ts gains/loses an entry. Same summary endpoint the
// Consoles page itself uses, so the two can never disagree.
async function fetchConsolesCount(): Promise<number> {
  const res = await fetch("/api/consoles")
  if (!res.ok) return 0
  const data = await res.json()
  return Array.isArray(data.consoles) ? data.consoles.length : 0
}

// Fallback publisher names used while useListPublishers loads (or if the API
// is unavailable). Must match artifacts/api-server/src/lib/scraper/registry.ts.
// ⚠ When adding/removing a publisher in registry.ts, update this list too —
//   it's the only spot that doesn't auto-derive from the live endpoint.
const PUBLISHER_FALLBACKS = [
  "Limited Run Games",
  "Strictly Limited Games",
  "iam8bit",
  "Super Rare Games",
  "Fangamer",
  "Xbox Game Studios Shop",
  "Blizzard Gear Store",
  "eastasiasoft",
  "Red Art Games",
  "NIS America",
  "Koei Tecmo",
  "Square Enix",
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

// ── How It Works — step data & images ────────────────────────────────────────

const STEP_IMAGES = [
  { src: "/images/step-search.jpg",    alt: "A collection of Nintendo game cartridges" },
  { src: "/images/step-checkout.jpg",  alt: "Person holding a card at checkout"        },
  { src: "/images/step-collector.jpg", alt: "Premium black collector's edition box"     },
]

// STEPS defined inside LandingPage (below) so step 03's body can reference
// the live publisherCount from useListPublishers.

// ── Step row — zigzag alternating layout with scroll-reveal + photo ──────────

function StepRow({
  num, icon, title, body, index,
}: { num: string; icon: ReactNode; title: string; body: string; index: number }) {
  // Content is always visible at initial render — no scroll-triggered opacity.
  // This ensures Googlebot (which does not scroll) can read the text.
  // The num prop is kept in the signature for future use.
  void num

  // true  → image on the LEFT,  text on the right
  // false → text on the LEFT,   image on the right
  const imageLeft = index % 2 === 1

  const content = (
    <div className="flex-1 py-10 md:py-14 md:pr-6 space-y-5">
      <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <h3 className="font-display font-bold text-3xl sm:text-4xl text-foreground">{title}</h3>
      <p className="text-muted-foreground text-lg leading-relaxed max-w-md">{body}</p>
    </div>
  )

  const photo = (
    <div className="hidden md:block flex-1 py-8 shrink-0">
      <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: "4/3" }}>
        <img
          src={STEP_IMAGES[index].src}
          alt={STEP_IMAGES[index].alt}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
        {/* Subtle dark vignette along the bottom edge */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
      </div>
    </div>
  )

  return (
    <div>
      {/* Simple flex-row; swap JSX child order to achieve the left/right alternation.
          No flex-row-reverse (which would invert both DOM order AND visual order,
          accidentally putting both halves on the same side). */}
      <div className="flex flex-col md:flex-row md:gap-12 items-center">
        {imageLeft ? <>{photo}{content}</> : <>{content}{photo}</>}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { data: stats }        = useGetReleaseStats()
  const { data: catalogStats } = useQuery({
    queryKey:  ["catalog-stats"],
    queryFn:   fetchCatalogStats,
    staleTime: 5 * 60_000,
  })
  const { data: consolesCount } = useQuery({
    queryKey:  ["consoles-count"],
    queryFn:   fetchConsolesCount,
    staleTime: 5 * 60_000,
  })

  // Live publisher list — auto-updates when publishers are added/removed.
  // Falls back to PUBLISHER_FALLBACKS during initial load.
  const { data: publishersData } = useListPublishers({})
  const publisherList  = useMemo(() => {
    const live = (publishersData ?? []).filter(p => p.enabled).map(p => p.name)
    return live.length > 0 ? live : PUBLISHER_FALLBACKS
  }, [publishersData])
  const publisherCount = publisherList.length

  // STEPS defined here (not at module level) so step 03 can reference publisherCount.
  const steps = useMemo<{ num: string; icon: ReactNode; title: string; body: string }[]>(
    () => [
      {
        num:   "01",
        icon:  <Search className="text-primary" size={18} />,
        title: "Search any title",
        body:  "Search 899,000+ games across every platform and generation — NES to PS5, retro to new releases. Filter by platform, sort by Metacritic score or release date. Results are cached locally for instant repeat searches.",
      },
      {
        num:   "02",
        icon:  <ShoppingBag className="text-primary" size={18} />,
        title: "Buy at four retailers",
        body:  "Every game card links directly to GameStop, Amazon, eBay, and Best Buy. One search, four storefronts — find the best price or availability without tabbing between sites.",
      },
      {
        num:   "03",
        icon:  <Clock className="text-primary" size={18} />,
        title: "Boutique drop tracker",
        // Publisher count is live — no hardcoded number here.
        body:  `Limited-run physical releases from ${publisherCount} boutique publishers are monitored every 2 hours — Available\u00a0Now, Coming\u00a0Soon, and Sold\u00a0Out with preorder countdowns.`,
      },
    ],
    [publisherCount],
  )

  // Use the live catalog count when available (e.g. "899K+"), fall back to
  // the same static figure used in index.html so the two never disagree.
  const catalogLabel =
    catalogStats?.count && catalogStats.count > 100_000
      ? `${Math.floor(catalogStats.count / 1_000).toLocaleString()}K+`
      : "900,000+"

  useDocumentHead({
    title:       "DiscWatchHQ — Every Game. Every Drop. Best Price.",
    description: `Search ${catalogLabel} physical games across every platform. Compare prices on GameStop, Amazon, eBay, and Best Buy. Track limited-run boutique releases in real time.`,
    canonical:   buildCanonicalUrl("/"),
    jsonLd: {
      "@context":            "https://schema.org",
      "@type":               "WebApplication",
      "name":                "DiscWatchHQ",
      "url":                 "https://discwatchhq.com",
      "applicationCategory": "EntertainmentApplication",
      "operatingSystem":     "Web",
      "description":         "Find physical video games and compare prices across GameStop, Amazon, eBay, and Best Buy. Track limited-run boutique releases in real time.",
      "offers": {
        "@type":         "Offer",
        "price":         "0",
        "priceCurrency": "USD",
      },
      "publisher": {
        "@type": "Organization",
        "@id":   "https://discwatchhq.com/#organization",
        "name":  "DiscWatchHQ",
      },
    },
  })
  // No scroll-reveal for pathway cards — content is always visible so
  // Googlebot (which does not scroll) can read it without JS interaction.

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
              style={{ opacity: 0.5 }}
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

            {/* Left vignette — lightened so artwork shows through behind text
                 while still providing enough contrast for WCAG-safe reading.
                 from-background/75 keeps left legible; via-background/40 lets
                 midpoint art breathe; right fades to near-transparent. */}
            <div className="absolute inset-0 bg-gradient-to-r from-background/75 via-background/40 to-background/5 pointer-events-none" />
            {/* Top/bottom vignette — softened top to match lighter left */}
            <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-transparent to-background/75 pointer-events-none" />
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
              EVERY GAME.<br />
              EVERY DROP.<br />
              <span className="text-primary">BEST PRICE.</span>
            </h1>

            {/* Sub-headline */}
            <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed mb-10 max-w-lg">
              Search the full physical game catalog — classic to current, every platform —
              and jump straight to{" "}
              <span className="text-foreground font-medium">GameStop</span>,{" "}
              <span className="text-foreground font-medium">Amazon</span>,{" "}
              <span className="text-foreground font-medium">eBay</span>, and{" "}
              <span className="text-foreground font-medium">Best Buy</span>. Need hardware
              too? Browse live{" "}
              <span className="text-foreground font-medium">console listings</span>, from
              current-gen to retro.
            </p>

            {/* CTAs — all three carry the same solid-fill treatment (equal visual
                weight, no single section reads as "more important"). Deterministic
                wrapping: full-width stack on mobile, equal-width row from sm up —
                never a content-width-driven wrap that stacks 1-then-2 unevenly. */}
            <div className="flex flex-col sm:flex-row gap-3 mb-16">
              <Button
                asChild size="lg"
                className="h-14 px-7 text-base font-bold gap-2 shadow-lg shadow-primary/25 w-full sm:w-auto sm:flex-1"
              >
                <Link href="/games">
                  <Library size={18} />
                  Browse Games
                </Link>
              </Button>
              <Button
                asChild size="lg"
                className="h-14 px-7 text-base font-bold gap-2 shadow-lg shadow-primary/25 w-full sm:w-auto sm:flex-1"
              >
                <Link href="/boutique">
                  <Bell size={18} />
                  Boutique Tracker
                </Link>
              </Button>
              <Button
                asChild size="lg"
                className="h-14 px-7 text-base font-bold gap-2 shadow-lg shadow-primary/25 w-full sm:w-auto sm:flex-1"
              >
                <Link href="/consoles">
                  <ControllerIcon size={18} strokeWidth={2.5} color="currentColor" />
                  Consoles
                </Link>
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
              <div className="w-px h-10 bg-border hidden sm:block" />
              <div>
                <div className="text-3xl sm:text-4xl font-display font-black text-foreground/60 tabular-nums">
                  {consolesCount && consolesCount > 0 ? consolesCount : 26}
                </div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">
                  Console Models
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
              <p className="mt-8 text-[10px] font-mono text-muted-foreground/90 flex items-center gap-1">
                Background art powered by{" "}
                <a
                  href="https://rawg.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground/90 hover:text-primary underline underline-offset-2 inline-flex items-center gap-0.5 transition-colors"
                >
                  RAWG <ExternalLink size={8} />
                </a>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          HOW IT WORKS — zigzag alternating rows with scroll-reveal
      ════════════════════════════════════════════════════════════════════ */}
      <section className="border-t border-border/30 bg-secondary/20">
        <div className="container mx-auto max-w-6xl px-4 pt-20 pb-4 text-center">
          <p className="text-sm font-mono uppercase tracking-widest text-primary/60 mb-4">
            No account needed
          </p>
          <h2 className="font-display text-5xl sm:text-6xl font-bold text-foreground">
            How it works
          </h2>
        </div>
        <div className="container mx-auto max-w-6xl px-4 pb-10">
          <div className="divide-y divide-border/20">
            {steps.map((step, i) => (
              <StepRow key={step.num} {...step} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Visual break: gradient line + background shift ── */}
      <div className="relative" aria-hidden="true">
        <div className="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="h-8 bg-gradient-to-b from-secondary/20 to-background" />
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          WHY IT EXISTS — editorial "problem being solved" section
      ════════════════════════════════════════════════════════════════════ */}
      <section className="py-16 bg-background border-b border-border/20">
        <div className="container mx-auto max-w-3xl px-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-primary/60 mb-5">
              Why DiscWatchHQ exists
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-8 leading-tight">
              Physical games are harder to buy than they should be.
            </h2>
            <div className="space-y-5 text-muted-foreground text-base leading-relaxed">
              <p>
                Physical video game collecting has a fragmentation problem. A game you want might
                be available at GameStop but out of stock on Amazon, cheaper on eBay but only in
                poor condition, or not on any major retailer at all because it was a{" "}
                <span className="text-foreground/80 font-medium">boutique-only release</span> from
                a publisher most people have never heard of. Checking each storefront separately —
                in different browser tabs, with different search interfaces — is tedious. DiscWatchHQ
                puts them all in one place.
              </p>
              <p>
                The boutique publisher market has grown significantly over the past decade. Companies
                like <span className="text-foreground/80 font-medium">Limited Run Games</span>,{" "}
                <span className="text-foreground/80 font-medium">Strictly Limited Games</span>, and{" "}
                <span className="text-foreground/80 font-medium">Super Rare Games</span> produce
                physical editions of games that otherwise exist only as digital downloads — often in
                print runs of just a few thousand units. These releases frequently sell out within
                hours of going live, and the preorder windows are short. Miss the window and you're
                paying two or three times the original price on the secondary market. The Boutique
                {/* Publisher count is live — derived from useListPublishers, not hardcoded.
                    Example names above are the three founding boutique publishers and are unlikely
                    to change; spot-check them if the publisher roster changes significantly. */}
                Tracker exists specifically to solve this: we currently monitor{" "}
                <span className="text-foreground/80 font-medium">{publisherCount} publisher storefronts</span>,
                checked every two hours so you don't have to.
              </p>
              <p>
                The hardware side has its own challenges. Retro console prices are driven largely
                by what's actually selling on eBay right now — not by any MSRP or list price. The
                Consoles section pulls live eBay listings for both current-gen and retro hardware so
                you can see the real market price, with condition and seller ratings visible upfront.
                No fake "retail" anchors, no guessing — just what hardware is actually selling for
                today.
              </p>
              <p>
                DiscWatchHQ is free to use. It's supported by affiliate commissions when you click
                through to a retailer and make a purchase — at no extra cost to you. Game data comes
                from <span className="text-foreground/80 font-medium">RAWG</span> and{" "}
                <span className="text-foreground/80 font-medium">TheGamesDB</span>, two of the
                largest community-maintained game databases, covering over 900,000 titles across
                every platform and era.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          PATHWAY CARDS — per-section accent colours, staggered reveal
      ════════════════════════════════════════════════════════════════════ */}
      <section className="pb-16 bg-background">
        <div className="container mx-auto max-w-6xl px-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50 mb-8">
            Where to start
          </p>
          {/* Single column on mobile, straight to 3 columns at lg */}
          <div className="grid lg:grid-cols-3 gap-5">

            {/* ── Browse Games — primary green accent, photo bg ── */}
            <div>
              <Link
                href="/games"
                className="group relative flex flex-col h-full rounded-2xl border border-border/30 border-t-2 border-t-primary overflow-hidden hover:border-border/50 hover:border-t-primary transition-colors duration-200 p-8"
              >
                {/* Photo background */}
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: "url('/images/card-games-spread.jpg')" }}
                />
                {/* Dark overlay — dense at bottom so stat line stays readable */}
                <div className="absolute inset-0 bg-gradient-to-br from-background/92 via-background/80 to-background/55" />
                {/* Content */}
                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
                      <Library className="text-primary" size={22} />
                    </div>
                    <ChevronRight
                      className="text-primary/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all mt-1"
                      size={20}
                    />
                  </div>
                  <h3 className="font-display font-black text-2xl text-foreground mb-2">Browse Games</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-5 flex-1">
                    Explore the full game catalog — popular titles, new releases, every
                    platform from NES to PS5 — with direct retailer buy links.
                  </p>
                  <div className="text-xs font-mono text-primary/80 uppercase tracking-wider">
                    {catalogStats?.count?.toLocaleString() ?? "—"} games indexed and counting →
                  </div>
                </div>
              </Link>
            </div>

            {/* ── Boutique Tracker — amber accent, photo bg ── */}
            <div>
              <Link
                href="/boutique"
                className="group relative flex flex-col h-full rounded-2xl border border-border/30 border-t-2 overflow-hidden hover:border-border/50 transition-colors duration-200 p-8"
                style={{ borderTopColor: "#f59e0b" }}
              >
                {/* Photo background */}
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: "url('/images/card-shipping-box.jpg')" }}
                />
                {/* Dark overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-background/92 via-background/80 to-background/55" />
                {/* Content */}
                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: "rgba(245,158,11,0.12)" }}>
                      <Bell size={22} style={{ color: "#f59e0b" }} />
                    </div>
                    <ChevronRight
                      className="group-hover:translate-x-0.5 transition-all mt-1"
                      style={{ color: "rgba(245,158,11,0.4)" }}
                      size={20}
                    />
                  </div>
                  <h3 className="font-display font-black text-2xl text-foreground mb-2">Boutique Tracker</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-5 flex-1">
                    Real-time scarcity tracking for limited-run physical releases from {publisherCount}
                    boutique publishers. Preorder windows, countdowns, and secondary-market
                    links for sold-out titles.
                  </p>
                  <div className="text-xs font-mono uppercase tracking-wider" style={{ color: "rgba(245,158,11,0.75)" }}>
                    {stats?.available ?? "—"} available now · {stats?.comingSoon ?? "—"} coming soon →
                  </div>
                </div>
              </Link>
            </div>

            {/* ── Consoles — sky-blue accent, photo bg ── */}
            <div>
              <Link
                href="/consoles"
                className="group relative flex flex-col h-full rounded-2xl border border-border/30 border-t-2 overflow-hidden hover:border-border/50 transition-colors duration-200 p-8"
                style={{ borderTopColor: "#38bdf8" }}
              >
                {/* Photo background */}
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: "url('/images/card-consoles.jpg')" }}
                />
                {/* Dark overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-background/92 via-background/80 to-background/55" />
                {/* Content */}
                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: "rgba(56,189,248,0.12)" }}>
                      <ControllerIcon size={22} strokeWidth={1.75} color="#38bdf8" />
                    </div>
                    <ChevronRight
                      className="group-hover:translate-x-0.5 transition-all mt-1"
                      style={{ color: "rgba(56,189,248,0.4)" }}
                      size={20}
                    />
                  </div>
                  <h3 className="font-display font-black text-2xl text-foreground mb-2">Consoles</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-5 flex-1">
                    Live eBay listings for hardware across every era — current-gen flagships
                    down to 16-bit retro — with condition always clearly labeled.
                  </p>
                  <div className="text-xs font-mono uppercase tracking-wider" style={{ color: "rgba(56,189,248,0.7)" }}>
                    {consolesCount && consolesCount > 0 ? consolesCount : 26} console models tracked →
                  </div>
                </div>
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          PUBLISHER LIST
      ════════════════════════════════════════════════════════════════════ */}
      <section className="py-10 border-t border-border/20">
        <div className="container mx-auto max-w-6xl px-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/90 mb-4">
            Boutique publishers we monitor
          </p>
          <div className="flex flex-wrap gap-2.5">
            {publisherList.map(pub => (
              <span
                key={pub}
                className="text-xs font-mono text-muted-foreground/90 border border-border/25 px-3 py-1.5 rounded-full"
              >
                {pub}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SEO CONTENT — keyword-rich descriptive section
          Provides topical depth for search engines and long-scroll users.
      ════════════════════════════════════════════════════════════════════ */}
      <section className="py-14 border-t border-border/30 bg-secondary/10">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="font-display text-2xl font-bold text-foreground mb-8">
            Physical Game Tracker for Collectors &amp; Buyers
          </h2>
          <div className="grid sm:grid-cols-2 gap-8 text-sm text-muted-foreground leading-relaxed">
            <div className="space-y-4">
              <p>
                <strong className="text-foreground/80">DiscWatchHQ</strong> is a free physical
                video game tracker and price comparison tool. Search{" "}
                {catalogLabel ? `${catalogLabel} ` : ""}physical games — from classic NES and
                Atari titles to the latest PS5, Xbox Series X, and Nintendo Switch 2 releases
                — and compare buy links across GameStop, Amazon, eBay, and Best Buy in a
                single search.
              </p>
              <p>
                Every major platform is covered: PlayStation, Xbox, Nintendo Switch, PC, and
                decades of retro hardware. Filter by platform or genre, sort by Metacritic
                score or release date, and jump straight to your preferred retailer without
                bouncing between tabs.
              </p>
            </div>
            <div className="space-y-4">
              <p>
                The <strong className="text-foreground/80">boutique tracker</strong> monitors
                limited-run physical releases from {publisherCount} boutique publishers —
                including Limited Run Games, Strictly Limited Games, iam8bit, and Super Rare
                Games — updated every two hours. See what's available now, what's coming soon,
                and find sold-out titles on the secondary market via eBay.
              </p>
              <p>
                Need hardware? Browse live eBay listings for 26+ console models across every
                generation — PS5 Pro, Nintendo Switch 2, Xbox Series X, and retro systems
                like the N64, SNES, and Sega Genesis — with condition always clearly labeled.{" "}
                <Link
                  href="/about"
                  className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                >
                  Learn more about DiscWatchHQ →
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
