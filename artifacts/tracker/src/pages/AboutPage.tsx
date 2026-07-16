/**
 * AboutPage — E-E-A-T signal page covering mission, features, data sources,
 * and contact info. Critical for Google's quality assessment of the site.
 */

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "wouter"
import { ExternalLink, Search, ShoppingBag, Bell, Database, BarChart2 } from "lucide-react"
import { ControllerIcon } from "@/components/ControllerIcon"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { HeroMarquee } from "@/components/HeroMarquee"
import { useDocumentHead } from "@/hooks/useDocumentHead"
import { buildCanonicalUrl } from "@/lib/seo"

// ── Static data ───────────────────────────────────────────────────────────────

const PUBLISHERS_TRACKED = [
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

const HERO_STATS = [
  { value: "900K+", label: "Physical games" },
  { value: "4",     label: "Retailers compared" },
  { value: "9",     label: "Boutique publishers" },
  { value: "26+",   label: "Consoles tracked" },
]

const FEATURES = [
  {
    num:     "01",
    icon:    <Search size={18} className="text-primary" />,
    heading: "Physical game catalog search",
    body:    "Search 900,000+ physical video games spanning every platform — NES, Atari, and Game Boy through PS5, Xbox Series X, and Nintendo Switch 2. Filter by platform or genre and sort by Metacritic score or release date. Powered by RAWG and TheGamesDB.",
  },
  {
    num:     "02",
    icon:    <ShoppingBag size={18} className="text-primary" />,
    heading: "Game price comparison",
    body:    "Compare buy links across GameStop, Amazon, eBay, and Best Buy on every game card. Live pricing from Best Buy for supported titles. Find the best deal without switching between storefronts.",
  },
  {
    num:     "03",
    icon:    <Bell size={18} className="text-primary" />,
    heading: "Boutique release tracker",
    body:    "Real-time tracking of limited-run physical game releases from boutique publishers — currently available, coming soon, and sold out. Updated every 2 hours with preorder deadlines and secondary-market eBay links for sold-out titles.",
  },
]

const DATA_SOURCES = [
  {
    icon:   <Database size={15} className="text-primary shrink-0" />,
    name:   "RAWG",
    href:   "https://rawg.io",
    detail: "Game catalog — 500K+ titles, Metacritic scores, cover art, and platform metadata",
  },
  {
    icon:   <Database size={15} className="text-primary shrink-0" />,
    name:   "TheGamesDB",
    href:   "https://thegamesdb.net",
    detail: "Community-run open game database — supplemental metadata and box art",
  },
  {
    icon:   <ShoppingBag size={15} className="text-primary shrink-0" />,
    name:   "eBay Browse API",
    href:   "https://developer.ebay.com",
    detail: "Live console listings and secondary-market prices for sold-out boutique titles",
  },
  {
    icon:   <BarChart2 size={15} className="text-primary shrink-0" />,
    name:   "Best Buy Products API",
    href:   "https://bestbuyapis.github.io/api-documentation/",
    detail: "Live retail pricing for current-generation titles",
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Thin eyebrow rule used above each section heading. */
function SectionEyebrow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-7">
      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary/75">
        {label}
      </span>
      <span className="flex-1 h-px bg-border/35" />
    </div>
  )
}

// ── Page component ────────────────────────────────────────────────────────────

export default function AboutPage() {
  useDocumentHead({
    title:       "About DiscWatchHQ — Physical Game Tracker & Price Comparison",
    description: "DiscWatchHQ tracks 900,000+ physical video games and compares prices on GameStop, Amazon, eBay, and Best Buy. Built for collectors and fans of physical media.",
    canonical:   buildCanonicalUrl("/about"),
    jsonLd: {
      "@context": "https://schema.org",
      "@type":    "AboutPage",
      "name":     "About DiscWatchHQ",
      "url":      "https://discwatchhq.com/about",
      "description": "DiscWatchHQ is a free physical video game tracker and price comparison tool for GameStop, Amazon, eBay, and Best Buy.",
      "mainEntity": {
        "@type":       "Organization",
        "name":        "DiscWatchHQ",
        "url":         "https://discwatchhq.com",
        "logo":        "https://discwatchhq.com/icon-192.png",
        "sameAs":      ["https://x.com/DiscWatchHQ"],
        "description": "DiscWatchHQ indexes 900,000+ physical video games and compares prices across four major retailers.",
        "contactPoint": {
          "@type":       "ContactPoint",
          "contactType": "customer support",
          "url":         "https://x.com/DiscWatchHQ",
        },
      },
    },
  })

  // Popular game covers for the hero marquee — same source as Browse Games page.
  const { data: popularData } = useQuery({
    queryKey: ["about-hero-images"],
    queryFn:  async () => {
      const res = await fetch("/api/games/popular?limit=20")
      if (!res.ok) return { results: [] as Array<{ coverImageUrl?: string | null }> }
      return res.json() as Promise<{ results: Array<{ coverImageUrl?: string | null }> }>
    },
    staleTime: 30 * 60_000,
  })

  const heroImages = useMemo(() => {
    return (popularData?.results ?? [])
      .map(g => g.coverImageUrl)
      .filter((url): url is string => !!url)
      .slice(0, 16)
  }, [popularData])

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* ── Hero — same pattern as Browse Games / Boutique / Consoles ── */}
      <section className="relative overflow-hidden border-b bg-card">
        <HeroMarquee images={heroImages} className="opacity-90" />
        <div className="container relative mx-auto max-w-[1600px] px-4 py-12 md:py-18">

          {/* Eyebrow */}
          <div className="flex items-center gap-2 text-[11px] font-bold font-mono uppercase tracking-widest text-primary mb-5">
            <ControllerIcon size={12} />
            About DiscWatchHQ
          </div>

          {/* Headline */}
          <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-foreground mb-4 max-w-2xl leading-[1.08]">
            Physical game tracking,<br className="hidden sm:block" /> built for collectors.
          </h1>

          {/* Tagline */}
          <p className="text-muted-foreground font-mono text-sm md:text-base max-w-xl leading-relaxed mb-10">
            Search 900,000+ physical games, compare prices across four major retailers,
            and track limited-run boutique releases before they sell out.
          </p>

          {/* Stat row */}
          <div className="flex flex-wrap gap-x-10 gap-y-5">
            {HERO_STATS.map(s => (
              <div key={s.label} className="flex flex-col gap-1.5">
                <span className="font-display font-black text-2xl md:text-3xl text-primary leading-none tabular-nums">
                  {s.value}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground/75 leading-none uppercase tracking-widest">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <main className="flex-1">
        <div className="container mx-auto max-w-3xl px-4 py-16">

          {/* ── Features ── */}
          <section className="mb-16">
            <SectionEyebrow label="Features" />
            <h2 className="font-display text-2xl font-bold text-foreground mb-8">
              What DiscWatchHQ does
            </h2>
            <div className="grid sm:grid-cols-3 gap-6">
              {FEATURES.map(item => (
                <div key={item.heading} className="relative space-y-3 group">
                  {/* Decorative number */}
                  <span className="absolute -top-1 right-0 font-mono text-[11px] font-bold text-primary/15 select-none group-hover:text-primary/30 transition-colors">
                    {item.num}
                  </span>
                  <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                    {item.icon}
                  </div>
                  <h3 className="font-semibold text-foreground text-sm leading-snug">{item.heading}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Who it's for ── */}
          <section className="mb-16 pt-12 border-t border-border/30">
            <SectionEyebrow label="Audience" />
            <h2 className="font-display text-2xl font-bold text-foreground mb-6">Who it's for</h2>
            <p className="text-muted-foreground leading-relaxed mb-8">
              DiscWatchHQ is built for anyone who prefers owning physical copies of video
              games. That includes game collectors building complete platform libraries,
              buyers comparing retail prices before purchasing, and fans of limited-edition
              physical releases who want to catch preorder windows before they close.
            </p>
            {/* Pull-quote */}
            <blockquote className="pl-6 py-1 border-l-2 border-primary">
              <p className="text-base text-foreground/85 leading-relaxed">
                If you've ever searched multiple retailer websites to find a physical copy of
                a game, missed a Limited Run Games preorder window, or wanted to know whether
                a sold-out boutique title has shown up on the secondary market — DiscWatchHQ
                was built to solve exactly those problems.
              </p>
            </blockquote>
          </section>

          {/* ── Publishers ── */}
          <section className="mb-16 pt-12 border-t border-border/30">
            <SectionEyebrow label="Publishers" />
            <h2 className="font-display text-2xl font-bold text-foreground mb-3">
              Boutique publishers we track
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              The{" "}
              <Link href="/boutique" className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors">
                Boutique Tracker
              </Link>{" "}
              monitors releases from these publishers in real time, updated every 2 hours:
            </p>
            <div className="flex flex-wrap gap-2">
              {PUBLISHERS_TRACKED.map(p => (
                <span
                  key={p}
                  className="text-xs font-mono text-primary/90 border border-primary/25 bg-primary/5 px-3 py-1.5 rounded-full hover:border-primary/45 hover:bg-primary/10 transition-colors"
                >
                  {p}
                </span>
              ))}
            </div>
          </section>

          {/* ── Console tracking ── */}
          <section className="mb-16 pt-12 border-t border-border/30">
            <SectionEyebrow label="Hardware" />
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <h2 className="font-display text-2xl font-bold text-foreground">
                Console price tracking
              </h2>
              {/* Live badge — matches Consoles page style */}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-mono text-primary/90 shrink-0 self-start mt-0.5">
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-50" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                </span>
                26+ consoles tracked
              </span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              The{" "}
              <Link href="/consoles" className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors">
                Consoles section
              </Link>{" "}
              aggregates live eBay listings for hardware spanning 30+ years of gaming —
              from current-generation consoles like the PS5 Pro, Xbox Series X, and
              Nintendo Switch 2 to retro hardware including the N64, Sega Genesis, Super
              Nintendo, and PlayStation 1. Condition is always clearly labeled (New, Used,
              or Seller Refurbished), and listings are refreshed daily.
            </p>
          </section>

          {/* ── Data sources ── */}
          <section className="mb-16 pt-12 border-t border-border/30">
            <SectionEyebrow label="Data" />
            <h2 className="font-display text-2xl font-bold text-foreground mb-8">Data sources</h2>
            <div className="grid sm:grid-cols-2 gap-3 mb-6">
              {DATA_SOURCES.map(src => (
                <a
                  key={src.name}
                  href={src.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col gap-2.5 rounded-lg border border-border/40 bg-card hover:border-primary/30 hover:bg-primary/5 px-5 py-4 transition-all duration-150"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {src.icon}
                      <span className="font-display font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                        {src.name}
                      </span>
                    </div>
                    <ExternalLink size={12} className="text-muted-foreground/40 group-hover:text-primary/60 transition-colors shrink-0" />
                  </div>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">
                    {src.detail}
                  </p>
                </a>
              ))}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              DiscWatchHQ is an independent tool and is not affiliated with any publisher,
              retailer, or platform holder. Affiliate links to GameStop, Amazon, eBay, and
              Best Buy may earn a small commission at no additional cost to you.
            </p>
          </section>

          {/* ── Contact ── */}
          <section className="mb-10 pt-12 border-t border-border/30">
            <SectionEyebrow label="Contact" />
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-7 py-7">
              <h2 className="font-display text-xl font-bold text-foreground mb-2">
                Contact &amp; feedback
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6 max-w-lg">
                Questions, bug reports, missing publishers, or feature suggestions?
                Reach out on X (Twitter):
              </p>
              <a
                href="https://x.com/DiscWatchHQ"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-primary hover:bg-primary/90 active:bg-primary/80 transition-colors px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm shadow-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="@DiscWatchHQ on X — opens in new tab"
              >
                @DiscWatchHQ on X <ExternalLink size={13} />
              </a>
            </div>
          </section>

          {/* ── Footer nav links ── */}
          <div className="border-t border-border/30 pt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link href="/"         className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors">Home</Link>
            <Link href="/games"    className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors">Browse Games</Link>
            <Link href="/boutique" className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors">Boutique Tracker</Link>
            <Link href="/consoles" className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors">Consoles</Link>
            <Link href="/privacy"  className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors">Privacy Policy</Link>
            <Link href="/terms"    className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors">Terms of Service</Link>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  )
}
