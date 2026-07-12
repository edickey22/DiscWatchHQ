/**
 * GameDetailModal — rich game detail popup for the Browse Games page.
 *
 * Hero:
 *   Shows the static cover image. No trailer/video — RAWG's movies endpoint
 *   returns empty results for virtually the entire catalog (confirmed via
 *   live API diagnostics), so the video crossfade has been removed.
 *
 * Media gallery:
 *   Screenshots appear in a 3-column thumbnail grid. Clicking any thumbnail
 *   opens MediaLightbox (full-viewport overlay with navigation, keyboard,
 *   swipe, and autoplay).
 *
 * Attribution requirements (API ToS — must always be visible):
 *   RAWG: "Powered by RAWG" link to rawg.io
 *   TGDB: "Data from TheGamesDB" link (courtesy credit)
 */

import { useCallback, useEffect, useState } from "react"
import {
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui/dialog"
import { RetailerLinks } from "@/components/RetailerLinks"
import {
  ExternalLink, X, Image as ImageIcon,
  ChevronDown, ChevronUp,
} from "lucide-react"
import type { CatalogGame } from "@/components/TgdbGameCard"
import { MediaLightbox, type MediaSlide } from "@/components/MediaLightbox"

// ── API response types ────────────────────────────────────────────────────────

interface GameDetail extends CatalogGame {
  description: string | null
  screenshots: string[]
  attribution: "rawg" | "tgdb"
}

interface LiveListing {
  price:    number   // current asking price in USD
  url:      string   // direct product/listing URL with affiliate params applied
  cachedAt: number   // ms epoch
}

/** Shape of GET /api/games/live-pricing/:sourceId response */
interface LivePricing {
  ebay?:    LiveListing | null   // absent = not configured; null = configured, no result
  bestbuy?: LiveListing | null
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchGameDetail(sourceId: string): Promise<GameDetail> {
  const res = await fetch(`/api/games/detail/${encodeURIComponent(sourceId)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function fetchPricing(sourceId: string, title: string): Promise<LivePricing> {
  const params = new URLSearchParams({ title })
  const res    = await fetch(
    `/api/games/live-pricing/${encodeURIComponent(sourceId)}?${params}`,
  )
  if (!res.ok) return {}
  return res.json()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build the ordered slide list for the lightbox — screenshots only. */
function buildSlides(screenshots: string[]): MediaSlide[] {
  return screenshots.map(url => ({ kind: "image", url }))
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Labeled score block — numeric rating with a clear source label so visitors
 * immediately understand what the number means.
 *
 * Metacritic: colour-coded score (green ≥75, yellow ≥50, red <50)
 * ESRB:       rating letter (fallback when no Metacritic score)
 */
function ScoreBadge({ game }: { game: CatalogGame }) {
  if (game.metacritic !== null) {
    const colour =
      game.metacritic >= 75 ? "bg-primary text-primary-foreground"
      : game.metacritic >= 50 ? "bg-yellow-500 text-black"
      : "bg-red-500 text-white"
    return (
      <div className="flex flex-col items-center gap-1 shrink-0">
        <span
          className={`inline-flex items-center justify-center w-12 h-10 rounded-lg text-base font-mono font-black ${colour}`}
          aria-label={`Metacritic score: ${game.metacritic} out of 100`}
        >
          {game.metacritic}
        </span>
        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/90 leading-none">
          Metacritic
        </span>
      </div>
    )
  }
  if (game.esrbRating && game.esrbRating !== "Not Rated") {
    const letter = game.esrbRating.includes(" - ")
      ? game.esrbRating.split(" - ")[0].trim()
      : game.esrbRating.charAt(0)
    return (
      <div className="flex flex-col items-center gap-1 shrink-0">
        <span
          className="inline-flex items-center justify-center w-12 h-10 rounded-lg text-base font-mono font-black bg-secondary text-muted-foreground border border-border/50"
          title={`ESRB rating: ${game.esrbRating}`}
          aria-label={`ESRB rating: ${game.esrbRating}`}
        >
          {letter}
        </span>
        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/90 leading-none">
          ESRB
        </span>
      </div>
    )
  }
  return null
}

/** Collapsible description — shows ~8 lines, expand to full. */
function Description({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const paragraphs = text
    .split(/\n+/)
    .map(p => p.trim())
    .filter(Boolean)
    .slice(0, expanded ? undefined : 4)

  return (
    <div>
      <div className={`space-y-3 text-sm text-muted-foreground leading-relaxed ${!expanded ? "line-clamp-[8]" : ""}`}>
        {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      </div>
      {text.length > 600 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          {expanded ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Read more</>}
        </button>
      )}
    </div>
  )
}

/**
 * Screenshot gallery — 3-column grid.
 * Each cell opens the lightbox at the correct slide index.
 */
function Gallery({
  screenshots,
  onOpen,
}: {
  screenshots: string[]
  onOpen:      (index: number) => void
}) {
  if (screenshots.length === 0) return null

  return (
    <section>
      <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground/90 mb-3 flex items-center gap-2">
        <ImageIcon size={12} /> Screenshots
      </h3>

      <div className="grid grid-cols-3 gap-1.5">
        {screenshots.map((url, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onOpen(i)}
            className="relative aspect-video rounded overflow-hidden bg-secondary group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`Open screenshot ${i + 1} in viewer`}
          >
            <img
              src={url}
              alt={`Screenshot ${i + 1}`}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
                  <ImageIcon size={14} className="text-white" />
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

/** Required attribution block — shown on every modal with sourced data. */
function Attribution({ source }: { source: "rawg" | "tgdb" }) {
  return (
    <div className="border-t border-border/20 pt-4 mt-2">
      <p className="text-xs text-muted-foreground/90 flex flex-wrap items-center gap-1.5">
        {source === "rawg" ? (
          <>
            <span>Powered by</span>
            <a
              href="https://rawg.io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-primary hover:text-primary/80 underline underline-offset-2 font-semibold transition-colors"
            >
              RAWG <ExternalLink size={10} />
            </a>
            <span className="text-muted-foreground/40">—</span>
            <span>game data, descriptions, screenshots, and media provided by RAWG.io</span>
          </>
        ) : (
          <>
            <span>Data provided by</span>
            <a
              href="https://thegamesdb.net"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-primary hover:text-primary/80 underline underline-offset-2 font-semibold transition-colors"
            >
              TheGamesDB <ExternalLink size={10} />
            </a>
            <span className="text-muted-foreground/40">—</span>
            <span>community-maintained open game database</span>
          </>
        )}
      </p>
    </div>
  )
}

// ── Modal skeleton ────────────────────────────────────────────────────────────

function ModalSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-video bg-secondary/60 rounded-t-lg" />
      <div className="p-5 space-y-4">
        <div className="h-7 bg-secondary rounded w-2/3" />
        <div className="h-4 bg-secondary rounded w-1/3" />
        <div className="grid grid-cols-2 gap-2 mt-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 bg-secondary rounded" />
          ))}
        </div>
        <div className="space-y-2 mt-4">
          <div className="h-3 bg-secondary rounded" />
          <div className="h-3 bg-secondary rounded w-5/6" />
          <div className="h-3 bg-secondary rounded w-4/6" />
        </div>
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface GameDetailModalProps {
  game:    CatalogGame | null
  onClose: () => void
}

export function GameDetailModal({ game, onClose }: GameDetailModalProps) {
  const [detail,        setDetail]        = useState<GameDetail | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [pricing,       setPricing]       = useState<LivePricing | null>(null)
  // Selected platform tag — threads into the retailer search URLs below so
  // outbound searches are platform-qualified. No selection = today's default.
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null)

  // Reset all transient state whenever a different game is opened
  useEffect(() => {
    setDetail(null)
    setError(null)
    setLightboxIndex(null)
    setPricing(null)
    setSelectedPlatform(null)

    if (!game) return

    let cancelled = false
    setLoading(true)

    fetchGameDetail(game.id)
      .then(d  => { if (!cancelled) { setDetail(d);  setLoading(false) } })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false) } })

    // Fire pricing in parallel using the title from the card (no need to wait
    // for detail). Silent failure — search URLs remain the fallback.
    fetchPricing(game.id, game.title)
      .then(p => { if (!cancelled) setPricing(p) })
      .catch(() => {/* no-op: search URLs are the fallback */})

    return () => { cancelled = true }
  }, [game?.id])

  const handleClose = useCallback(() => onClose(), [onClose])

  const displayed = detail ?? (game
    ? { ...game, description: null, screenshots: [], attribution: game.source } as GameDetail
    : null)

  const year = displayed?.releaseDate
    ? new Date(displayed.releaseDate.replace(/-/g, "/")).getFullYear()
    : null

  const slides: MediaSlide[] = detail ? buildSlides(detail.screenshots) : []

  return (
    <>
      <Dialog open={!!game} onOpenChange={open => { if (!open) handleClose() }}>
        <DialogContent
          className="max-w-2xl p-0 overflow-hidden bg-background border-border gap-0 max-h-[90vh] flex flex-col"
          hideDefaultClose
        >
          <DialogTitle className="sr-only">
            {displayed?.title ?? "Game detail"}
          </DialogTitle>

          <div className="overflow-y-auto flex-1">

            {/* ── Hero area: static cover image ── */}
            <div className="relative">
              <div className="aspect-video bg-black overflow-hidden relative">

                {displayed?.coverImageUrl ? (
                  <img
                    src={displayed.coverImageUrl}
                    alt={displayed.title}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/20">
                    <ImageIcon size={48} />
                  </div>
                )}

                {/* Bottom gradient for readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent pointer-events-none" />
              </div>

              {/* Close button */}
              <button
                onClick={handleClose}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-background/70 backdrop-blur-sm flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-background/90 transition-colors"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            {/* ── Game info + retailer buttons ── */}
            <div className="px-5 pt-4 pb-2">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <h2 className="font-display font-black text-xl sm:text-2xl text-foreground leading-tight">
                    {displayed?.title}
                  </h2>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5">
                    {displayed?.publisherName && (
                      <span className="text-xs font-mono text-primary/95">
                        {displayed.publisherName}
                      </span>
                    )}
                    {displayed?.publisherName && year && (
                      <span className="text-muted-foreground/30 text-xs">·</span>
                    )}
                    {year && (
                      <span className="text-xs font-mono text-muted-foreground/90">{year}</span>
                    )}
                  </div>

                  {displayed && displayed.platforms.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {displayed.platforms.map(p => {
                        const isSelected = selectedPlatform === p
                        return (
                          <button
                            key={p}
                            type="button"
                            aria-pressed={isSelected}
                            title={isSelected ? `Clear ${p} filter` : `Search retailers for ${displayed.title} on ${p}`}
                            onClick={() => setSelectedPlatform(cur => (cur === p ? null : p))}
                            className={`text-[11px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded border transition-colors ${
                              isSelected
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-secondary border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                            }`}
                          >
                            {p}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {displayed && <ScoreBadge game={displayed} />}
              </div>

              {displayed && (() => {
                const platformUrls = selectedPlatform
                  ? displayed.retailerSearchUrlsByPlatform?.[selectedPlatform]
                  : undefined
                return (
                  <div className="mt-3">
                    <RetailerLinks
                      urls={platformUrls ?? {
                        ...displayed.retailerSearchUrls,
                        // Override search URLs with direct listing URLs when live
                        // pricing returned a specific product match. Falls back to
                        // the search URL automatically when pricing is null/absent.
                        // Skipped entirely once a platform tag is selected — the
                        // platform-qualified search takes priority over the
                        // unqualified live-pricing match.
                        ...(pricing?.ebay?.url    ? { ebay:    pricing.ebay.url    } : {}),
                        ...(pricing?.bestbuy?.url ? { bestbuy: pricing.bestbuy.url } : {}),
                      }}
                      prices={platformUrls ? {} : {
                        ebay:    pricing?.ebay?.price    ?? null,
                        bestbuy: pricing?.bestbuy?.price ?? null,
                      }}
                      platforms={displayed.platforms}
                      variant="detail"
                      guideUrls={displayed.guideSearchUrls}
                    />
                  </div>
                )
              })()}
            </div>

            {/* ── Loading / error states ── */}
            {loading && (
              <div className="px-5 py-4">
                <ModalSkeleton />
              </div>
            )}

            {error && !loading && (
              <div className="px-5 py-2 text-xs text-muted-foreground/90">
                Could not load additional details.
              </div>
            )}

            {/* ── Rich content: description + screenshot gallery ── */}
            {detail && !loading && (
              <div className="px-5 pb-2 space-y-6 mt-2">
                {detail.description && (
                  <section>
                    <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground/90 mb-3">
                      About this game
                    </h3>
                    <Description text={detail.description} />
                  </section>
                )}

                <Gallery
                  screenshots={detail.screenshots}
                  onOpen={setLightboxIndex}
                />
              </div>
            )}

            {/* ── Attribution (required — always visible) ── */}
            {displayed && (
              <div className="px-5 pb-5">
                <Attribution source={displayed.attribution ?? displayed.source} />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {lightboxIndex !== null && slides.length > 0 && (
        <MediaLightbox
          slides={slides}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}
