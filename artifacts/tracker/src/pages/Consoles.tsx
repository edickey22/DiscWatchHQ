import { useQuery } from "@tanstack/react-query"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { ConsoleCard, ConsoleCardSkeleton, type ConsoleSummary } from "@/components/ConsoleCard"
import { ConsoleHeroMarquee } from "@/components/ConsoleHeroMarquee"
import { useDocumentHead } from "@/hooks/useDocumentHead"
import { buildCanonicalUrl } from "@/lib/seo"

interface ConsolesResponse {
  configured: boolean
  consoles:   ConsoleSummary[]
}

async function fetchConsoles(): Promise<ConsolesResponse> {
  const res = await fetch("/api/consoles")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const SECTIONS: { generation: ConsoleSummary["generation"]; label: string; blurb: string }[] = [
  { generation: "current",  label: "Current-Gen",  blurb: "This generation's flagship hardware" },
  { generation: "previous", label: "Previous-Gen",  blurb: "Still in wide circulation, secondhand and new" },
  { generation: "retro",    label: "Retro",         blurb: "Every era, from the 16-bit years to the last generation" },
]

export default function Consoles() {
  useDocumentHead({
    title:       "Consoles — Live eBay Listings for Every Platform | DiscWatchHQ",
    description: "Browse live eBay listings for game consoles spanning every generation — PS5, Xbox Series X, Switch 2, and retro hardware like N64, Genesis, and PS1.",
    canonical:   buildCanonicalUrl("/consoles"),
    jsonLd: {
      "@context":    "https://schema.org",
      "@type":       "CollectionPage",
      "name":        "Game Consoles — Live eBay Listings | DiscWatchHQ",
      "description": "Live eBay listings for game consoles spanning every generation, from PS5 Pro and Xbox Series X to retro hardware. Condition always clearly labeled.",
      "url":         "https://discwatchhq.com/consoles",
      "isPartOf":    { "@id": "https://discwatchhq.com/#website" },
    },
  })

  const { data, isLoading } = useQuery({
    queryKey: ["consoles"],
    queryFn:  fetchConsoles,
    staleTime: 60 * 60_000, // 1h client-side — server-side scheduler refreshes every 24h
  })

  const consoles = data?.consoles ?? []

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Header />

      <main className="flex-1">
        <section className="relative overflow-hidden border-b bg-card">
          <ConsoleHeroMarquee className="opacity-90" />
          <div className="container relative mx-auto max-w-[1600px] px-4 py-10 md:py-14">
            <h1 className="text-2xl md:text-3xl font-bold font-display tracking-tight text-foreground flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-40" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
              </span>
              Consoles
            </h1>
            <p className="text-muted-foreground mt-1 font-mono text-base">
              Live eBay listings for hardware, every platform and every era. Condition is always shown — never broken, never for parts.
            </p>
          </div>
        </section>

        <div className="container mx-auto max-w-[1600px] px-4 pt-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1.5 text-xs font-mono text-primary/90">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-50" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
            </span>
            Tap any console to see multiple current listings — real hardware only, never manuals, parts, or accessories.
          </div>
        </div>

        <div className="container mx-auto max-w-[1600px] px-4 py-8 space-y-16">
          {SECTIONS.map(section => {
            const items = consoles.filter(c => c.generation === section.generation)
            if (!isLoading && items.length === 0) return null

            return (
              <section key={section.generation}>
                <div className="flex items-baseline justify-between mb-6">
                  <div>
                    <h2 className="text-xl md:text-2xl font-bold font-display tracking-tight text-foreground">
                      {section.label}
                    </h2>
                    <p className="text-muted-foreground mt-1 font-mono text-base">{section.blurb}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                  {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => <ConsoleCardSkeleton key={i} />)
                  ) : (
                    items.map(c => <ConsoleCard key={c.id} console={c} />)
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </main>

      <Footer />
    </div>
  )
}
