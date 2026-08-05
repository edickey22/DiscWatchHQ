/**
 * PriceTrend — shows trend badges + a 30/90-day area chart based on price
 * history fetched from /api/price-history/*.
 *
 * Handles three display cases:
 *   - direction + changePercent: "↓ 12% this week" (or ↑ / flat)
 *   - sevenDayLow only: "7-day low: $N" (when we have < 7 days of history
 *     but still have the min price in the window we do have)
 *   - Not enough data: renders nothing for badges; shows empty-state for chart
 *
 * The badge intentionally says nothing if the API has no snapshots yet —
 * early in deployment, schedulers may not have run enough times to produce
 * a meaningful trend signal.
 *
 * The chart shows the primary price series (eBay resale for releases, min BIN
 * for consoles) over time. At < 2 data points the chart section shows a soft
 * "Trend data accumulates over time" message instead.
 */
import { useQuery } from "@tanstack/react-query"
import { TrendingDown, TrendingUp, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

// ── Types ──────────────────────────────────────────────────────────────────

interface Trend {
  currentPrice:  number | null
  weekAgoPrice:  number | null
  sevenDayLow:   number | null
  sevenDayHigh:  number | null
  changePercent: number | null
  direction:     "up" | "down" | "flat" | null
}

interface Snapshot {
  itemType:  string
  source:    string
  priceUsd:  number | null
  snappedAt: string
}

interface PriceHistoryResponse {
  snapshots: Snapshot[]
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

// ── Main export ────────────────────────────────────────────────────────────

export function PriceTrend({ url, queryKey, className }: PriceTrendProps) {
  const { data } = useQuery({
    queryKey,
    queryFn: () => fetchPriceHistory(url),
    staleTime: 30 * 60_000, // 30 min — data only changes when schedulers run
    retry: false,
  })

  if (!data) return null

  const { trend, snapshots } = data

  // Derive primary series for chart: prefer eBay series; fall back to all.
  // Release endpoints return both "release_ebay" and "release_list"; we want
  // eBay resale.  Console endpoint only returns "console_ebay".
  const ebaySeries = snapshots.filter(
    s => s.itemType === "release_ebay" || s.itemType === "console_ebay",
  )
  const primarySeries = ebaySeries.length > 0 ? ebaySeries : snapshots

  // Chart data: priced points only, sorted oldest→newest for left-to-right rendering.
  const chartPoints = primarySeries
    .filter(s => s.priceUsd !== null)
    .slice()                              // don't mutate the original (newest-first)
    .sort((a, b) => new Date(a.snappedAt).getTime() - new Date(b.snappedAt).getTime())
    .map(s => ({
      date:     s.snappedAt,
      price:    s.priceUsd as number,
      dateMs:   new Date(s.snappedAt).getTime(),
    }))

  const hasBadgeData =
    (trend.currentPrice !== null || trend.sevenDayLow !== null) &&
    (trend.direction !== null || trend.sevenDayLow !== null)

  const hasChart = chartPoints.length >= 2

  // Nothing to render at all
  if (!hasBadgeData && !hasChart) return null

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* ── Badges ── */}
      {hasBadgeData && (
        <div className="flex flex-wrap gap-2 items-center">
          {trend.direction !== null && trend.changePercent !== null && (
            <TrendBadge direction={trend.direction} changePercent={trend.changePercent} />
          )}
          {trend.sevenDayLow !== null && (
            <SevenDayLowBadge
              low={trend.sevenDayLow}
              current={trend.currentPrice}
            />
          )}
        </div>
      )}

      {/* ── Chart ── */}
      {hasChart ? (
        <PriceChart points={chartPoints} />
      ) : (
        // We have badge data but not enough history for a chart yet
        hasBadgeData && (
          <p className="text-[10px] font-mono text-muted-foreground/50 leading-snug">
            Trend data accumulates over time
          </p>
        )
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

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

// ── Chart ──────────────────────────────────────────────────────────────────

interface ChartPoint {
  date:   string
  price:  number
  dateMs: number
}

function formatChartDate(iso: string): string {
  const d = new Date(iso)
  // Short locale date: "Jan 5", "Dec 31", etc.
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function PriceChart({ points }: { points: ChartPoint[] }) {
  // Determine axis tick count based on how many points span how much time.
  const spanDays =
    points.length > 1
      ? (points[points.length - 1].dateMs - points[0].dateMs) / (86_400_000)
      : 0

  // Only show x-axis ticks at reasonable density — pick ~4-6 evenly spaced points.
  const tickCount = Math.min(points.length, spanDays > 60 ? 6 : spanDays > 14 ? 5 : 4)

  const prices   = points.map(p => p.price)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  // Add 8% padding so the line isn't flush with the top/bottom edges.
  const range    = maxPrice - minPrice || maxPrice * 0.1 || 10
  const yMin     = Math.max(0, minPrice - range * 0.08)
  const yMax     = maxPrice + range * 0.08

  return (
    <div className="w-full rounded-lg border border-border/30 bg-card/50 px-2 pt-3 pb-1">
      <p className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest mb-2 px-1">
        eBay Price History
      </p>
      <ResponsiveContainer width="100%" height={100}>
        <AreaChart data={points} margin={{ top: 2, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.25} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}    />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", fill: "hsl(var(--muted-foreground))", opacity: 0.6 }}
            tickFormatter={formatChartDate}
            tickCount={tickCount}
            interval="preserveStartEnd"
            minTickGap={24}
          />

          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", fill: "hsl(var(--muted-foreground))", opacity: 0.6 }}
            tickFormatter={formatUsd}
            domain={[yMin, yMax]}
            width={44}
            tickCount={3}
          />

          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1, strokeDasharray: "3 3" }}
          />

          <Area
            type="monotone"
            dataKey="price"
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            fill="url(#priceGradient)"
            dot={false}
            activeDot={{ r: 3, fill: "hsl(var(--primary))", strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// Recharts custom tooltip
function ChartTooltip({ active, payload, label }: {
  active?:  boolean
  payload?: Array<{ value: number }>
  label?:   string
}) {
  if (!active || !payload?.length || payload[0].value == null) return null
  return (
    <div className="rounded-md border border-border/50 bg-popover px-2.5 py-1.5 shadow-md">
      <p className="text-[10px] font-mono text-muted-foreground">{label ? formatChartDate(label) : ""}</p>
      <p className="text-[12px] font-mono font-semibold text-foreground">
        {formatUsd(payload[0].value)}
      </p>
    </div>
  )
}
