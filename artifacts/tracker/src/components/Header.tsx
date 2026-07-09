import { Link } from "wouter"
import { Disc3 } from "lucide-react"
import { useGetReleaseStats } from "@workspace/api-client-react"
import { useTheme } from "@/context/ThemeContext"

export function Header() {
  const { data: stats } = useGetReleaseStats()
  const { accent, setAccent } = useTheme()

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

        <div className="flex items-center gap-5">
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

          {/* Theme toggle — two accent-colour dots */}
          <div
            className="flex items-center gap-1.5 bg-secondary/60 border border-border/50 rounded-full px-2 py-1.5"
            title="Switch accent colour"
            aria-label="Switch colour theme"
          >
            <button
              onClick={() => setAccent("red")}
              aria-label="Red theme"
              className={`
                w-3.5 h-3.5 rounded-full bg-[hsl(348,83%,47%)] transition-all duration-200
                ${accent === "red"
                  ? "ring-2 ring-offset-1 ring-offset-secondary ring-[hsl(348,83%,47%)] scale-110"
                  : "opacity-50 hover:opacity-80"}
              `}
            />
            <button
              onClick={() => setAccent("green")}
              aria-label="Green theme"
              className={`
                w-3.5 h-3.5 rounded-full bg-[hsl(142,69%,42%)] transition-all duration-200
                ${accent === "green"
                  ? "ring-2 ring-offset-1 ring-offset-secondary ring-[hsl(142,69%,42%)] scale-110"
                  : "opacity-50 hover:opacity-80"}
              `}
            />
          </div>
        </div>
      </div>
    </header>
  )
}
