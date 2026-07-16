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

import { useRef, useEffect, useState, type ReactNode } from "react"
import { Link } from "wouter"
import { useQuery } from "@tanstack/react-query"
import { ChevronRight, Zap, Clock, ShoppingBag, Library, Bell, Search, ExternalLink } from "lucide-react"
import { ControllerIcon } from "@/components/ControllerIcon"

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

// Live console model count — never hardcode this; it drifts whenever
// consoleModels.ts gains/loses an entry. Same summary endpoint the
// Consoles page itself uses, so the two can never disagree.
async function fetchConsolesCount(): Promise<number> {
  const res = await fetch("/api/consoles")
  if (!res.ok) return 0
  const data = await res.json()
  return Array.isArray(data.consoles) ? data.consoles.length : 0
}

const PUBLISHERS = [
  "Limited Run Games",
  "Strictly Limited Games",
  "iam8bit",
  "Super Rare Games",
  "Fangamer",
  "Xbox Game Studios Shop",
  "Blizzard Gear Store",
  "eastasiasoft",
  "Red Art Games",
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

const STEPS: { num: string; icon: ReactNode; title: string; body: string }[] = [
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
    body:  "Limited-run physical releases from boutique publishers like Limited Run Games and Strictly Limited are monitored every 2 hours — Available\u00a0Now, Coming\u00a0Soon, and Sold\u00a0Out with preorder countdowns.",
  },
]

// ── Step row — zigzag alternating layout with scroll-reveal + photo ──────────

function StepRow({
  num, icon, title, body, index,
}: { num: string; icon: ReactNode; title: string; body: string; index: number }) {
  const rowRef                = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return }
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      // rootMargin keeps the animation from firing until the user has
      // genuinely scrolled the section into view — avoids instant-trigger
      // on tall viewports where the section is technically "visible" on load.
      { threshold: 0.15, rootMargin: "-100px" },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // true  → image on the LEFT,  text on the right
  // false → text on the LEFT,   image on the right
  const imageLeft = index % 2 === 1

  const content = (
    <div className="flex-1 py-10 md:py-14 md:pr-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-primary/60">
          Step {num}
        </span>
      </div>
      <h3 className="font-display font-bold text-2xl text-foreground">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed max-w-md">{body}</p>
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
        {/* Subtle dark vignette so the step number overlay is legible */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        {/* Faint step-number watermark in the image corner */}
        <span
          className="absolute bottom-3 right-4 font-mono font-black leading-none select-none pointer-events-none"
          style={{ fontSize: "clamp(3rem,7vw,5.5rem)", color: "rgba(255,255,255,0.10)" }}
          aria-hidden="true"
        >
          {num}
        </span>
      </div>
    </div>
  )

  return (
    <div
      ref={rowRef}
      // All transition properties set inline so Tailwind class ordering
      // can never accidentally reset transition-duration to its 150ms default.
      style={{
        opacity:                visible ? 1 : 0,
        transform:              visible ? "translateY(0)" : "translateY(2rem)",
        transitionProperty:     "opacity, transform",
        transitionDuration:     "700ms",
        transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
        transitionDelay:        `${index * 120}ms`,
      }}
    >
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

  // Use the live catalog count when available (e.g. "899K+"), fall back to
  // the same static figure used in index.html so the two never disagree.
  const catalogLabel =
    catalogStats?.count && catalogStats.count > 100_000
      ? `${Math.floor(catalogStats.count / 1_000).toLocaleString()}K+`
      : "900,000+"

  useDocumentHead({
    title:       "DiscWatchHQ — Find Any Physical Game, Buy Anywhere",
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
  // Scroll-reveal for the staggered pathway cards
  const cardsRef                = useRef<HTMLDivElement>(null)
  const [cardsVisible, setCardsVisible] = useState(false)
  useEffect(() => {
    const el = cardsRef.current
    if (!el) return
    if (typeof IntersectionObserver === "undefined") { setCardsVisible(true); return }
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setCardsVisible(true); obs.disconnect() } },
      { threshold: 0.1, rootMargin: "-100px" },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

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

            {/* Left vignette — keeps hero text fully legible */}
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-background/10 pointer-events-none" />
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
        <div className="container mx-auto max-w-6xl px-4 pt-20 pb-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-primary/60 mb-3">
            Three steps · no account needed
          </p>
          <h2 className="font-display text-3xl font-bold text-foreground">
            How it works
          </h2>
        </div>
        <div className="container mx-auto max-w-6xl px-4 pb-10">
          <div className="divide-y divide-border/20">
            {STEPS.map((step, i) => (
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
          PATHWAY CARDS — per-section accent colours, staggered reveal
      ════════════════════════════════════════════════════════════════════ */}
      <section className="pb-16 bg-background">
        <div className="container mx-auto max-w-6xl px-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50 mb-8">
            Where to start
          </p>
          {/* Single column on mobile, straight to 3 columns at lg */}
          <div ref={cardsRef} className="grid lg:grid-cols-3 gap-5">

            {/* ── Browse Games — primary green accent, photo bg ── */}
            <div
              style={{
                opacity:                cardsVisible ? 1 : 0,
                transform:              cardsVisible ? "translateY(0)" : "translateY(2rem)",
                transitionProperty:     "opacity, transform",
                transitionDuration:     "700ms",
                transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
                transitionDelay:        "0ms",
              }}
            >
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
            <div
              style={{
                opacity:                cardsVisible ? 1 : 0,
                transform:              cardsVisible ? "translateY(0)" : "translateY(2rem)",
                transitionProperty:     "opacity, transform",
                transitionDuration:     "700ms",
                transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
                transitionDelay:        "120ms",
              }}
            >
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
                    Real-time scarcity tracking for limited-run physical releases from 9
                    boutique publishers. Preorder windows, countdowns, and secondary-market
                    links for sold-out titles.
                  </p>
                  <div className="text-xs font-mono uppercase tracking-wider" style={{ color: "rgba(245,158,11,0.75)" }}>
                    {stats?.available ?? "—"} available now · {stats?.comingSoon ?? "—"} coming soon →
                  </div>
                </div>
              </Link>
            </div>

            {/* ── Consoles — sky-blue accent ── */}
            <div
              className="transition-[opacity,transform] duration-700 ease-out"
              style={{
                opacity:         cardsVisible ? 1 : 0,
                transform:       cardsVisible ? "translateY(0)" : "translateY(2rem)",
                transitionDelay: "240ms",
              }}
            >
              <Link
                href="/consoles"
                className="group flex flex-col h-full rounded-2xl border border-border/30 border-t-2 bg-secondary/10 hover:bg-secondary/20 hover:border-border/50 transition-colors duration-200 p-8"
                style={{ borderTopColor: "#38bdf8" }}
              >
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
            {PUBLISHERS.map(pub => (
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
                limited-run physical releases from publishers like Limited Run Games, Strictly
                Limited Games, iam8bit, Super Rare Games, and Fangamer — updated every two
                hours. See what's available now, what's coming soon, and find sold-out titles
                on the secondary market via eBay.
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
