import { ExternalLink } from "lucide-react"
import { useGetScrapeStatus } from "@workspace/api-client-react"
import { ControllerIcon } from "@/components/ControllerIcon"

interface FooterProps {
  /**
   * Show attribution credits for the game catalog sources
   * (TheGamesDB + RAWG) on pages that display their data.
   * RAWG credit is required by their free-tier terms.
   * TheGamesDB credit is a courtesy for the community database.
   */
  showCatalogAttribution?: boolean
}

export function Footer({ showCatalogAttribution = false }: FooterProps) {
  const { data: status } = useGetScrapeStatus()

  const lastScraped = status?.reduce((latest, current) => {
    if (!current.lastRunAt) return latest
    const t = new Date(current.lastRunAt).getTime()
    return t > latest ? t : latest
  }, 0)

  return (
    <footer className="border-t bg-card/30 mt-auto">
      <div className="container mx-auto max-w-6xl px-4 py-8 flex flex-col gap-3">

        {/* ── Main footer row ── */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ControllerIcon size={18} />
            <span>
              © {new Date().getFullYear()}{" "}
              <span className="font-semibold text-foreground/70">DiscWatchHQ</span>
              {" "}— not affiliated with any publisher.
            </span>
          </div>

          {lastScraped ? (
            <p className="text-xs font-mono text-muted-foreground/60 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-40" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              Last index: {new Date(lastScraped).toLocaleString()}
            </p>
          ) : null}
        </div>

        {/* ── Catalog attribution (shown on Browse Games page) ── */}
        {showCatalogAttribution && (
          <p className="text-[11px] text-muted-foreground/50 text-center md:text-left flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            Game catalog data provided by{" "}
            <a
              href="https://thegamesdb.net"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-primary/60 hover:text-primary/90 underline underline-offset-2 transition-colors font-medium"
              aria-label="TheGamesDB — community-run open game database (opens in new tab)"
            >
              TheGamesDB <ExternalLink size={9} />
            </a>
            <span className="text-muted-foreground/30">&amp;</span>
            <a
              href="https://rawg.io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-primary/60 hover:text-primary/90 underline underline-offset-2 transition-colors font-medium"
              aria-label="RAWG Video Games Database (opens in new tab)"
            >
              RAWG <ExternalLink size={9} />
            </a>
          </p>
        )}
      </div>
    </footer>
  )
}
