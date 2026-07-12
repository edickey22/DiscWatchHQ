import { useQuery } from "@tanstack/react-query"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { ConsoleCard, ConsoleCardSkeleton, type ConsoleWithListing } from "@/components/ConsoleCard"
import { useDocumentHead } from "@/hooks/useDocumentHead"
import { buildCanonicalUrl } from "@/lib/seo"

interface ConsolesResponse {
  configured: boolean
  consoles:   ConsoleWithListing[]
}

async function fetchConsoles(): Promise<ConsolesResponse> {
  const res = await fetch("/api/consoles")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const SECTIONS: { generation: ConsoleWithListing["generation"]; label: string; blurb: string }[] = [
  { generation: "current",  label: "Current-Gen",  blurb: "This generation's flagship hardware" },
  { generation: "previous", label: "Previous-Gen",  blurb: "Still in wide circulation, secondhand and new" },
  { generation: "retro",    label: "Retro",         blurb: "Every era, from the 16-bit years to the last generation" },
]

export default function Consoles() {
  useDocumentHead({
    title:       "Consoles — Live eBay Listings for Every Platform | DiscWatchHQ",
    description: "Browse live eBay listings for game consoles spanning every generation — PS5, Xbox Series X, Switch, and retro hardware like the N64, Genesis, and PS1. Condition always clearly labeled.",
    canonical:   buildCanonicalUrl("/consoles"),
    jsonLd:      null,
  })

  const { data, isLoading } = useQuery({
    queryKey: ["consoles"],
    queryFn:  fetchConsoles,
    staleTime: 60 * 60_000, // 1h client-side — server already caches 4h
  })

  const consoles = data?.consoles ?? []

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Header />

      <main className="flex-1">
        <section className="bg-card border-b">
          <div className="container mx-auto max-w-6xl px-4 py-8">
            <h1 className="text-2xl md:text-3xl font-bold font-display tracking-tight text-foreground flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-40" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
              </span>
              Consoles
            </h1>
            <p className="text-muted-foreground mt-1 font-mono text-sm">
              Live eBay listings for hardware, every platform and every era. Condition is always shown — never broken, never for parts.
            </p>
          </div>
        </section>

        <div className="container mx-auto max-w-6xl px-4 py-8 space-y-16">
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
                    <p className="text-muted-foreground mt-1 font-mono text-sm">{section.blurb}</p>
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
