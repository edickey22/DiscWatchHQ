/**
 * LandingPage — DiscWatchHQ hero/home experience.
 *
 * Visual concept: "The War Room"
 * A living wallpaper of real game cover art (from RAWG popular games) scrolls
 * continuously behind the hero — the sheer density of games underlines the
 * scale of what we track. Bold, dark, high-contrast. Every element earns its
 * place on the screen.
 *
 * Cover art use: only actual published game box art / key art from the RAWG
 * API (background_image field) is displayed, in the same informational/
 * reference context as RAWG, Metacritic, and Wikipedia — no generated or
 * fabricated artwork depicting copyrighted characters.
 */

import { Link } from "wouter"
import { useQuery } from "@tanstack/react-query"
import { ChevronRight, Zap, Clock, ShoppingBag, Library, Bell } from "lucide-react"

import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { Button } from "@/components/ui/button"
import { useGetReleaseStats } from "@workspace/api-client-react"
import { useDocumentHead } from "@/hooks/useDocumentHead"
import { buildCanonicalUrl } from "@/lib/seo"

// ── Data fetching ─────────────────────────────────────────────────────────────

interface Cover { coverImageUrl: string; title: string }

async function fetchCovers(): Promise<Cover[]> {
  const res = await fetch("/api/games/popular")
  if (!res.ok) return []
  const data = await res.json()
  return (data.results ?? [])
    .filter((g: { coverImageUrl: string | null }) => g.coverImageUrl)
    .map((g: { coverImageUrl: string; title: string }) => ({
      coverImageUrl: g.coverImageUrl,
      title:         g.title,
    }))
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

// ── Scrolling cover column ────────────────────────────────────────────────────

function CoverColumn({
  covers,
  animClass,
}: {
  covers: Cover[]
  animClass: string
}) {
  if (!covers.length) return null
  // Duplicate for seamless infinite loop
  const doubled = [...covers, ...covers]
  return (
    <div className="flex-1 overflow-hidden">
      <div className={animClass}>
        {doubled.map((c, i) => (
          <div key={i} className="w-full aspect-video bg-muted/50 overflow-hidden mb-1.5 rounded-sm">
            <img
              src={c.coverImageUrl}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
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
    title:       "DiscWatchHQ — Track Every Limited-Run Physical Game Release",
    description: "Never miss a drop. DiscWatchHQ tracks limited-run physical game releases from Limited Run Games, Strictly Limited, iam8bit, Super Rare Games, and more — in real time.",
    canonical:   buildCanonicalUrl("/"),
    jsonLd:      null,
  })

  const { data: stats }        = useGetReleaseStats()
  const { data: catalogStats } = useQuery({
    queryKey: ["catalog-stats"],
    queryFn:  fetchCatalogStats,
    staleTime: 5 * 60 * 1_000,
  })
  const { data: covers = [] } = useQuery({
    queryKey: ["landing-covers"],
    queryFn:  fetchCovers,
    staleTime: 60 * 60 * 1_000,
  })

  // Distribute covers across 4 scrolling columns
  const col = (mod: number) => covers.filter((_, i) => i % 4 === mod)

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Keyframe animations for the cover art columns */}
      <style>{`
        @keyframes dwScrollUp {
          from { transform: translateY(0); }
          to   { transform: translateY(-50%); }
        }
        @keyframes dwScrollDown {
          from { transform: translateY(-50%); }
          to   { transform: translateY(0); }
        }
        .dw-col-a { animation: dwScrollUp   32s linear infinite; }
        .dw-col-b { animation: dwScrollDown 24s linear infinite; }
        .dw-col-c { animation: dwScrollUp   28s linear infinite; }
        .dw-col-d { animation: dwScrollDown 36s linear infinite; }
      `}</style>

      <Header />

      {/* ════════════════════════════════════════════════════════════════════
          HERO
      ════════════════════════════════════════════════════════════════════ */}
      <section className="relative flex items-center min-h-[calc(100vh-4rem)] overflow-hidden">

        {/* ── Cover art wallpaper ── */}
        {covers.length > 0 && (
          <div
            className="absolute inset-0 flex gap-1.5 overflow-hidden opacity-[0.22]"
            aria-hidden="true"
          >
            <CoverColumn covers={col(0)} animClass="dw-col-a" />
            <CoverColumn covers={col(1)} animClass="dw-col-b" />
            <CoverColumn covers={col(2)} animClass="dw-col-c" />
            <CoverColumn covers={col(3)} animClass="dw-col-d" />
          </div>
        )}

        {/* ── Gradient overlays — hero text must be legible ── */}
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/95 to-background/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-background/60" />

        {/* ── Hero content ── */}
        <div className="relative z-10 container mx-auto max-w-6xl px-4 py-24">
          <div className="max-w-2xl">

            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 text-[11px] font-bold font-mono uppercase tracking-widest text-primary border border-primary/30 bg-primary/10 px-3 py-1.5 rounded-full mb-8 select-none">
              <Zap size={10} />
              Real-time limited-run game tracker
            </div>

            {/* Headline */}
            <h1 className="font-display text-[clamp(3.5rem,10vw,6.5rem)] font-black tracking-tight leading-[0.9] text-foreground mb-7">
              EVERY<br />
              DROP.<br />
              <span className="text-primary">TRACKED.</span>
            </h1>

            {/* Sub-headline */}
            <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed mb-10 max-w-lg">
              Limited-run physical releases from{" "}
              <span className="text-foreground font-medium">Limited Run Games</span>,{" "}
              <span className="text-foreground font-medium">Strictly Limited</span>,{" "}
              <span className="text-foreground font-medium">iam8bit</span>, and 4 more boutique
              publishers — tracked the moment they go live.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4 mb-16">
              <Button
                asChild
                size="lg"
                className="h-14 px-8 text-base font-bold gap-2 shadow-lg shadow-primary/25"
              >
                <Link href="/games">
                  Browse Games <ChevronRight size={18} />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-14 px-8 text-base font-semibold border-foreground/20 hover:border-foreground/40"
              >
                <Link href="/boutique">
                  Boutique Tracker
                </Link>
              </Button>
            </div>

            {/* Live stats */}
            {stats && (
              <div className="flex flex-wrap items-center gap-6 sm:gap-10">
                <div>
                  <div className="text-3xl sm:text-4xl font-display font-black text-primary tabular-nums">
                    {stats.available}
                  </div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">
                    Available Now
                  </div>
                </div>
                <div className="w-px h-10 bg-border hidden sm:block" />
                <div>
                  <div className="text-3xl sm:text-4xl font-display font-black text-foreground tabular-nums">
                    {stats.comingSoon}
                  </div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">
                    Coming Soon
                  </div>
                </div>
                <div className="w-px h-10 bg-border hidden sm:block" />
                <div>
                  <div className="text-3xl sm:text-4xl font-display font-black text-foreground/80 tabular-nums">
                    {stats.totalTracked}
                  </div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">
                    Boutique Releases
                  </div>
                </div>
                {catalogStats && catalogStats.count > 0 && (
                  <>
                    <div className="w-px h-10 bg-border hidden sm:block" />
                    <div>
                      <div className="text-3xl sm:text-4xl font-display font-black text-foreground/50 tabular-nums">
                        {catalogStats.count.toLocaleString()}
                      </div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">
                        Game Catalog
                      </div>
                    </div>
                  </>
                )}
              </div>
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
                <Clock className="text-primary" size={18} />
              </div>
              <h3 className="font-display font-bold text-xl text-foreground">
                Scraped every 2 hours
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Every boutique publisher store is automatically monitored every 2 hours.
                New listings are captured the moment they go live — before social media
                catches on.
              </p>
            </div>
            <div className="space-y-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <ShoppingBag className="text-primary" size={18} />
              </div>
              <h3 className="font-display font-bold text-xl text-foreground">
                Scarcity-aware
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                The Boutique Tracker shows live status for every limited-run release:
                Available&nbsp;Now, Coming&nbsp;Soon, and Sold&nbsp;Out — with preorder
                window countdowns and direct retailer affiliate links.
              </p>
            </div>
            <div className="space-y-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Library className="text-primary" size={18} />
              </div>
              <h3 className="font-display font-bold text-xl text-foreground">
                Full game catalog
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Browse {catalogStats?.count?.toLocaleString() ?? "thousands of"} games
                across all platforms and generations. Every title links directly to
                GameStop, Amazon, eBay, and Best Buy.
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
              <h3 className="font-display font-black text-2xl text-foreground mb-2">
                Browse Games
              </h3>
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
              <h3 className="font-display font-black text-2xl text-foreground mb-2">
                Boutique Tracker
              </h3>
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
