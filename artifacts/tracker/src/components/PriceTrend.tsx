/**
 * PriceTrend — shows a "↓ X% this week" or "7-day low: $N" badge based on
 * price history fetched from /api/price-history/*.
 *
 * Handles three display cases:
 *   - direction + changePercent: "↓ 12% this week" (or ↑ / flat)
 *   - sevenDayLow only: "7-day low: $N" (when we have < 7 days of history
 *     but still have the min price in the window we do have)
 *   - Not enough data: renders nothing (null)
 *
 * The badge intentionally says nothing if the API has no snapshots yet —
 * early in deployment, schedulers may not have run enough times to produce
 * a meaningful trend signal.
 */
import { useQuery } from "@tanstack/react-query"
import { TrendingDown, TrendingUp, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

interface Trend {
  currentPrice:  number | null
  weekAgoPrice:  number | null
  sevenDayLow:   number | null
  sevenDayHigh:  number | null
  changePercent: number | null
  direction:     "up" | "down" | "flat" | null
}

interface PriceHistoryResponse {
  snapshots: unknown[]
  trend: Trend
}

async function fetchPriceHistory(url: string): Promise<PriceHistoryResponse> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

interface PriceTrendProps {
  /** URL to fetch, e.g. /api/price-history/release/42 */
  url: string
  /** Query key elements for react-query deduplication */
  queryKey: unknown[]
  /** Optional extra CSS classes on the outer wrapper */
  className?: string
}

export function PriceTrend({ url, queryKey, className }: PriceTrendProps) {
  const { data } = useQuery({
    queryKey,
    queryFn: () => fetchPriceHistory(url),
    staleTime: 30 * 60_000, // 30 min — data only changes when schedulers run
    retry: false,
  })

  if (!data) return null

  const { trend } = data

  // Need at least one non-null price to show anything meaningful
  if (trend.currentPrice === null && trend.sevenDayLow === null) return null

  const hasWeeklyTrend = trend.direction !== null && trend.changePercent !== null

  if (!hasWeeklyTrend && trend.sevenDayLow === null) return null

  return (
    <div className={cn("flex flex-wrap gap-2 items-center", className)}>
      {hasWeeklyTrend && (
        <TrendBadge direction={trend.direction!} changePercent={trend.changePercent!} />
      )}
      {trend.sevenDayLow !== null && (
        <SevenDayLowBadge
          low={trend.sevenDayLow}
          current={trend.currentPrice}
        />
      )}
    </div>
  )
}

function TrendBadge({ direction, changePercent }: { direction: "up" | "down" | "flat"; changePercent: number }) {
  const abs = Math.abs(changePercent)

  if (direction === "flat") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-secondary/60 border border-border/50 text-muted-foreground text-[11px] font-mono font-semibold px-2.5 py-0.5">
        <Minus size={10} />
        Stable this week
      </span>
    )
  }

  const isDown = direction === "down"
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border text-[11px] font-mono font-semibold px-2.5 py-0.5",
      isDown
        ? "bg-emerald-950/40 border-emerald-800/50 text-emerald-400"
        : "bg-red-950/40 border-red-800/50 text-red-400",
    )}>
      {isDown ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
      {isDown ? "↓" : "↑"} {abs.toFixed(0)}% this week
    </span>
  )
}

function SevenDayLowBadge({ low, current }: { low: number; current: number | null }) {
  const isAtLow = current !== null && Math.abs(current - low) < 0.01
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border text-[11px] font-mono font-semibold px-2.5 py-0.5",
      isAtLow
        ? "bg-emerald-950/40 border-emerald-800/50 text-emerald-400"
        : "bg-secondary/60 border-border/50 text-muted-foreground",
    )}>
      7-day low: ${low.toFixed(2)}
      {isAtLow && " ✓"}
    </span>
  )
}
