/**
 * AboutPage — E-E-A-T signal page covering mission, features, data sources,
 * and contact info. Critical for Google's quality assessment of the site.
 */

import { Link } from "wouter"
import { ExternalLink, Search, ShoppingBag, Bell } from "lucide-react"
import { ControllerIcon } from "@/components/ControllerIcon"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { useDocumentHead } from "@/hooks/useDocumentHead"
import { buildCanonicalUrl } from "@/lib/seo"

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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1">
        <div className="container mx-auto max-w-3xl px-4 py-16">

          {/* ── Page header ── */}
          <div className="flex items-center gap-2 text-[11px] font-bold font-mono uppercase tracking-widest text-primary mb-6">
            <ControllerIcon size={14} />
            About
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-black tracking-tight text-foreground mb-6">
            About DiscWatchHQ
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed mb-14 max-w-2xl">
            DiscWatchHQ is a free physical video game tracker and price comparison tool
            built for collectors, completionists, and fans of physical media. Search
            900,000+ games, compare prices across four major retailers, and track
            limited-run boutique releases before they sell out.
          </p>

          {/* ── What it does ── */}
          <section className="mb-14">
            <h2 className="font-display text-2xl font-bold text-foreground mb-6">
              What DiscWatchHQ does
            </h2>
            <div className="grid sm:grid-cols-3 gap-6">
              {[
                {
                  icon:    <Search size={18} className="text-primary" />,
                  heading: "Physical game catalog search",
                  body:    "Search 900,000+ physical video games spanning every platform — NES, Atari, and Game Boy through PS5, Xbox Series X, and Nintendo Switch 2. Filter by platform or genre and sort by Metacritic score or release date. Powered by RAWG and TheGamesDB.",
                },
                {
                  icon:    <ShoppingBag size={18} className="text-primary" />,
                  heading: "Game price comparison",
                  body:    "Compare buy links across GameStop, Amazon, eBay, and Best Buy on every game card. Live pricing from Best Buy for supported titles. Find the best deal without switching between storefronts.",
                },
                {
                  icon:    <Bell size={18} className="text-primary" />,
                  heading: "Boutique release tracker",
                  body:    "Real-time tracking of limited-run physical game releases from boutique publishers — currently available, coming soon, and sold out. Updated every 2 hours with preorder deadlines and secondary-market eBay links for sold-out titles.",
                },
              ].map(item => (
                <div key={item.heading} className="space-y-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                    {item.icon}
                  </div>
                  <h3 className="font-semibold text-foreground text-sm">{item.heading}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Who it's for ── */}
          <section className="mb-14 border-t border-border/30 pt-10 space-y-4">
            <h2 className="font-display text-2xl font-bold text-foreground">
              Who it's for
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              DiscWatchHQ is built for anyone who prefers owning physical copies of video
              games. That includes game collectors building complete platform libraries,
              buyers comparing retail prices before purchasing, and fans of limited-edition
              physical releases who want to catch preorder windows before they close.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              If you've ever searched multiple retailer websites to find a physical copy of
              a game, missed a Limited Run Games preorder window, or wanted to know whether
              a sold-out boutique title has shown up on the secondary market — DiscWatchHQ
              was built to solve exactly those problems.
            </p>
          </section>

          {/* ── Boutique publishers ── */}
          <section className="mb-14 border-t border-border/30 pt-10 space-y-4">
            <h2 className="font-display text-2xl font-bold text-foreground">
              Boutique publishers we track
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
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
                  className="text-xs font-mono text-muted-foreground/90 border border-border/30 px-3 py-1.5 rounded-full"
                >
                  {p}
                </span>
              ))}
            </div>
          </section>

          {/* ── Console listings ── */}
          <section className="mb-14 border-t border-border/30 pt-10 space-y-4">
            <h2 className="font-display text-2xl font-bold text-foreground">
              Console price tracking
            </h2>
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
          <section className="mb-14 border-t border-border/30 pt-10 space-y-4">
            <h2 className="font-display text-2xl font-bold text-foreground">
              Data sources
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Game catalog data is sourced from{" "}
              <a
                href="https://rawg.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors inline-flex items-center gap-0.5"
                aria-label="RAWG Video Games Database (opens in new tab)"
              >
                RAWG <ExternalLink size={11} />
              </a>{" "}
              and{" "}
              <a
                href="https://thegamesdb.net"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors inline-flex items-center gap-0.5"
                aria-label="TheGamesDB — community-run open game database (opens in new tab)"
              >
                TheGamesDB <ExternalLink size={11} />
              </a>
              , two of the most comprehensive open video game databases available. Boutique
              release data is scraped directly from publisher storefronts every 2 hours.
              Console listings come from the eBay Browse API and are refreshed daily.
              Retail pricing (where available) comes from the Best Buy Products API.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              DiscWatchHQ is an independent tool and is not affiliated with any publisher,
              retailer, or platform holder. Affiliate links to GameStop, Amazon, eBay, and
              Best Buy may earn a small commission at no additional cost to you.
            </p>
          </section>

          {/* ── Contact ── */}
          <section className="mb-14 border-t border-border/30 pt-10 space-y-4">
            <h2 className="font-display text-2xl font-bold text-foreground">
              Contact &amp; feedback
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Questions, bug reports, missing publishers, or feature suggestions? Reach out
              on X (Twitter):
            </p>
            <a
              href="https://x.com/DiscWatchHQ"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-primary font-semibold underline underline-offset-2 hover:text-primary/80 transition-colors"
              aria-label="@DiscWatchHQ on X — opens in new tab"
            >
              @DiscWatchHQ on X <ExternalLink size={14} />
            </a>
          </section>

          {/* ── Nav links ── */}
          <div className="border-t border-border/30 pt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link href="/" className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors">Home</Link>
            <Link href="/games" className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors">Browse Games</Link>
            <Link href="/boutique" className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors">Boutique Tracker</Link>
            <Link href="/consoles" className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors">Consoles</Link>
            <Link href="/privacy" className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors">Terms of Service</Link>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  )
}
