import { Link } from "wouter"
import { Disc3 } from "lucide-react"
import { useGetReleaseStats } from "@workspace/api-client-react"
import { getGetReleaseStatsQueryKey } from "@workspace/api-client-react"

export function Header() {
  const { data: stats } = useGetReleaseStats()

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container mx-auto max-w-6xl px-4 flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="bg-primary/10 p-1.5 rounded-md group-hover:bg-primary/20 transition-colors">
            <Disc3 className="h-5 w-5 text-primary" />
          </div>
          <span className="font-display text-xl font-bold tracking-tight text-foreground">
            PRESS<span className="text-primary">RUN</span>
          </span>
        </Link>
        
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
