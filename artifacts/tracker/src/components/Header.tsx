import { Link } from "wouter"
import { ControllerIcon } from "@/components/ControllerIcon"
import { useGetReleaseStats } from "@workspace/api-client-react"

export function Header() {
  const { data: stats } = useGetReleaseStats()

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container mx-auto max-w-6xl px-4 flex h-16 items-center justify-between">

        {/* ── Wordmark ─────────────────────────────────────────────────── */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <ControllerIcon size={30} />
          <span className="flex items-center gap-1.5 leading-none">
            <span className="font-display text-[1.2rem] font-bold tracking-tight">
              <span className="text-foreground">Disc</span>
              <span className="text-primary">Watch</span>
            </span>
            <span className="
              text-[10px] font-bold tracking-wide leading-none
              text-primary border border-primary/40 bg-primary/10
              rounded px-1.5 py-0.5 select-none
            ">
              HQ
            </span>
          </span>
        </Link>

        {/* ── Live stats (desktop) ──────────────────────────────────────── */}
        {stats && (
          <div className="hidden md:flex items-center gap-6 text-sm font-mono tracking-tight">
            <div className="flex flex-col items-center">
              <span className="text-muted-foreground text-[10px] uppercase">Available</span>
              <span className="text-primary font-bold">{stats.available}</span>
            </div>
            <div className="w-px h-6 bg-border" />
            <div className="flex flex-col items-center">
              <span className="text-muted-foreground text-[10px] uppercase">Coming Soon</span>
              <span className="text-foreground font-semibold">{stats.comingSoon}</span>
            </div>
            <div className="w-px h-6 bg-border" />
            <div className="flex flex-col items-center">
              <span className="text-muted-foreground text-[10px] uppercase">Tracked</span>
              <span className="text-foreground/80">{stats.totalTracked}</span>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
