import { useGetScrapeStatus } from "@workspace/api-client-react"
import { getGetScrapeStatusQueryKey } from "@workspace/api-client-react"

export function Footer() {
  const { data: status } = useGetScrapeStatus()
  
  // Find the most recent scrape time
  const lastScraped = status?.reduce((latest, current) => {
    if (!current.lastRunAt) return latest
    const currentDate = new Date(current.lastRunAt).getTime()
    return currentDate > latest ? currentDate : latest
  }, 0)

  return (
    <footer className="border-t bg-card/30 mt-auto">
      <div className="container mx-auto max-w-6xl px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground font-medium">
          © {new Date().getFullYear()} Press Run. Not affiliated with any publisher.
        </p>
        
        {lastScraped ? (
          <p className="text-xs font-mono text-muted-foreground/60 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-40"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Last index: {new Date(lastScraped).toLocaleString()}
          </p>
        ) : null}
      </div>
    </footer>
  )
}
