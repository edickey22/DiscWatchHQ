import { Link } from "wouter"
import { Badge } from "@/components/ui/badge"
import { Release, ReleaseStatus } from "@workspace/api-client-react"
import { daysUntil } from "@/lib/utils"
import { Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { RetailerLinks } from "@/components/RetailerLinks"
import { ControllerIcon } from "@/components/ControllerIcon"

interface GameCardProps {
  release: Release
}

export function GameCard({ release }: GameCardProps) {
  const isAvailable = release.status === ReleaseStatus.available
  const isSoldOut = release.status === ReleaseStatus.sold_out
  const isComingSoon = release.status === ReleaseStatus.coming_soon

  const daysLeft = isAvailable ? daysUntil(release.preorderCloseDate) : null
  const isClosingSoon = daysLeft !== null && daysLeft <= 7 && daysLeft >= 0

  return (
    <div className={cn(
      "group relative flex flex-col space-y-3 rounded-lg p-3 transition-all hover:bg-card/50",
      isSoldOut && "opacity-75"
    )}>
      {/* Cover Image — navigates to detail page */}
      <Link href={`/releases/${release.id}`} className="block">
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-muted shadow-sm">
          {release.coverImageUrl ? (
            <img
              src={release.coverImageUrl}
              alt={`${release.title} cover`}
              className={cn(
                "h-full w-full object-cover transition-transform duration-500 group-hover:scale-105",
                isSoldOut && "grayscale-[50%]"
              )}
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-secondary">
              <ControllerIcon size={48} className="opacity-20" />
            </div>
          )}

          {/* Overlays */}
          {isSoldOut && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
              <span className="font-display text-lg font-bold tracking-widest text-white border-y-2 border-white/50 py-1 px-4 rotate-[-12deg]">
                SOLD OUT
              </span>
            </div>
          )}
          {isComingSoon && (
            <div className="absolute top-2 right-2">
              <Badge variant="secondary" className="bg-black/80 text-white backdrop-blur-md border-transparent">
                Coming Soon
              </Badge>
            </div>
          )}
          {isAvailable && isClosingSoon && (
            <div className="absolute top-2 right-2">
              <Badge variant="destructive" className="animate-pulse shadow-md">
                <Clock className="mr-1 h-3 w-3" />
                {daysLeft === 0 ? "Closes Today" : `${daysLeft} Days Left`}
              </Badge>
            </div>
          )}
        </div>
      </Link>

      {/* Details */}
      <div className="flex flex-col flex-1 space-y-1">
        <div className="flex flex-wrap gap-1.5 mb-1">
          {release.platforms?.slice(0, 3).map(p => (
            <span key={p} className="text-[10px] font-mono font-medium uppercase tracking-wider text-muted-foreground border border-border/50 px-1.5 py-0.5 rounded-sm bg-background/50">
              {p}
            </span>
          ))}
          {(release.platforms?.length ?? 0) > 3 && (
            <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-muted-foreground border border-border/50 px-1.5 py-0.5 rounded-sm bg-background/50">
              +{(release.platforms?.length ?? 0) - 3}
            </span>
          )}
        </div>

        <Link href={`/releases/${release.id}`} className="block">
          <h3 className="font-display font-bold leading-tight text-foreground group-hover:text-primary transition-colors line-clamp-2">
            {release.title}
          </h3>
        </Link>

        <p className="text-xs text-muted-foreground font-medium truncate">
          {release.publisherName}
        </p>

        <div className="mt-auto pt-2 flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-semibold text-foreground/90 shrink-0">
            {release.price || "TBA"}
          </span>
          {isAvailable && (
            <Link
              href={`/releases/${release.id}`}
              className="text-xs font-semibold text-primary uppercase tracking-wider hover:underline underline-offset-4 shrink-0"
            >
              Order Now →
            </Link>
          )}
        </div>

        {/* Retailer search buttons — every card, every status */}
        <RetailerLinks
          urls={release.retailerSearchUrls}
          prices={release.retailerPrices}
          variant="card"
        />
      </div>
    </div>
  )
}

export function GameCardSkeleton() {
  return (
    <div className="flex flex-col space-y-3 p-3">
      <div className="aspect-[3/4] w-full animate-pulse rounded-md bg-muted/60" />
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="h-4 w-12 animate-pulse rounded-sm bg-muted/60" />
          <div className="h-4 w-12 animate-pulse rounded-sm bg-muted/60" />
        </div>
        <div className="h-5 w-full animate-pulse rounded bg-muted/60" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted/60" />
        <div className="flex justify-between pt-2">
          <div className="h-4 w-16 animate-pulse rounded bg-muted/60" />
        </div>
        {/* Skeleton for the 2×2 button grid */}
        <div className="grid grid-cols-2 gap-1.5 mt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded bg-muted/40" />
          ))}
        </div>
      </div>
    </div>
  )
}
