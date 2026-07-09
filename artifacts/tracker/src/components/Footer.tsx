import { useGetScrapeStatus } from "@workspace/api-client-react"
import { ControllerIcon } from "@/components/ControllerIcon"

export function Footer() {
  const { data: status } = useGetScrapeStatus()

  const lastScraped = status?.reduce((latest, current) => {
    if (!current.lastRunAt) return latest
    const t = new Date(current.lastRunAt).getTime()
    return t > latest ? t : latest
  }, 0)

  return (
    <footer className="border-t bg-card/30 mt-auto">
      <div className="container mx-auto max-w-6xl px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-4">

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
    </footer>
  )
}
