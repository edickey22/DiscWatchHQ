/**
 * GameDetailModal — rich game detail popup for the Browse Games page.
 *
 * Fetches RAWG-enriched data (description, screenshots, trailer) on open.
 *
 * Media gallery: screenshots and the trailer are displayed as a unified
 * thumbnail grid. Clicking any thumbnail opens MediaLightbox — a full-viewport
 * overlay with left/right navigation, keyboard arrow keys, swipe, and
 * auto-advancing dot indicators. Trailers autoplay muted inside the lightbox.
 *
 * Attribution requirements (per API ToS — must always be visible):
 *   RAWG: "Powered by RAWG" link to rawg.io
 *   TGDB: "Data from TheGamesDB" link (courtesy credit)
 */

import { useEffect, useState } from "react"
import {
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { RetailerLinks } from "@/components/RetailerLinks"
import {
  ExternalLink, X, Play, Image as ImageIcon, ChevronDown, ChevronUp,
} from "lucide-react"
import type { CatalogGame } from "@/components/TgdbGameCard"
import { MediaLightbox, type MediaSlide } from "@/components/MediaLightbox"

// ── API response type ─────────────────────────────────────────────────────────

interface GameDetail extends CatalogGame {
  description:      string | null
  screenshots:      string[]
  trailerYoutubeId: string | null
  trailerUrl:       string | null
  attribution:      "rawg" | "tgdb"
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function fetchGameDetail(sourceId: string): Promise<GameDetail> {
  const res = await fetch(`/api/games/detail/${encodeURIComponent(sourceId)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build the ordered slide list that the lightbox will display.
 *  Screenshots first, trailer last (so screenshot grid index === slide index). */
function buildSlides(
  screenshots: string[],
  trailerYoutubeId: string | null,
  trailerUrl: string | null,
): MediaSlide[] {
  const slides: MediaSlide[] = screenshots.map(url => ({ kind: "image", url }))
  if (trailerYoutubeId) {
    slides.push({ kind: "youtube", id: trailerYoutubeId })
  } else if (trailerUrl && (trailerUrl.includes(".mp4"))) {
    slides.push({ kind: "mp4", url: trailerUrl })
  }
  return slides
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Score/rating badge reused from TgdbGameCard at larger size. */
function ScoreBadge({ game }: { game: CatalogGame }) {
  if (game.metacritic !== null) {
    const colour =
      game.metacritic >= 75 ? "bg-primary text-primary-foreground"
      : game.metacritic >= 50 ? "bg-yellow-500 text-black"
      : "bg-red-500 text-white"
    return (
      <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-sm font-mono font-black ${colour}`}>
        {game.metacritic}
      </span>
    )
  }
  if (game.esrbRating && game.esrbRating !== "Not Rated") {
    const label = game.esrbRating.includes(" - ")
      ? game.esrbRating.split(" - ")[0].trim()
      : game.esrbRating.charAt(0)
    return (
      <span
        className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-sm font-mono font-black bg-secondary text-muted-foreground border border-border/50"
        title={`ESRB: ${game.esrbRating}`}
      >
        {label}
      </span>
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
 * Unified media gallery — screenshots + trailer thumbnail in one grid.
 *
 * Each cell is a <button> that fires onOpen(slideIndex). Screenshots occupy
 * indices 0…N-1; the trailer (if present) is always the last slide and gets
 * its own thumbnail cell showing either the YouTube max-res thumbnail or a
 * dark ▶ card for mp4 sources.
 */
function Gallery({
  screenshots,
  trailerYoutubeId,
  trailerUrl,
  onOpen,
}: {
  screenshots:      string[]
  trailerYoutubeId: string | null
  trailerUrl:       string | null
  onOpen:           (index: number) => void
}) {
  // Must match buildSlides() eligibility exactly — only include trailer tile
  // when a slide will actually be generated for it.
  const hasTrailer = !!(
    trailerYoutubeId ||
    (trailerUrl && trailerUrl.includes(".mp4"))
  )
  const totalItems = screenshots.length + (hasTrailer ? 1 : 0)
  if (totalItems === 0) return null

  const trailerSlideIndex = screenshots.length

  // YouTube gives us a free thumbnail we can use without any API call
  const ytThumb = trailerYoutubeId
    ? `https://img.youtube.com/vi/${trailerYoutubeId}/mqdefault.jpg`
    : null

  const sectionLabel =
    screenshots.length > 0 && hasTrailer ? "Screenshots & Trailer"
    : screenshots.length > 0 ? "Screenshots"
    : "Trailer"

  return (
    <section>
      <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground/60 mb-3 flex items-center gap-2">
        <ImageIcon size={12} /> {sectionLabel}
      </h3>

      <div className="grid grid-cols-3 gap-1.5">
        {/* Screenshot thumbnails */}
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
            {/* Hover overlay hint */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
                  <ImageIcon size={14} className="text-white" />
                </div>
              </div>
            </div>
          </button>
        ))}

        {/* Trailer thumbnail cell */}
        {hasTrailer && (
          <button
            type="button"
            onClick={() => onOpen(trailerSlideIndex)}
            className="relative aspect-video rounded overflow-hidden bg-secondary group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Watch trailer"
          >
            {ytThumb ? (
              <img
                src={ytThumb}
                alt="Trailer thumbnail"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            ) : (
              /* mp4 or unknown — show a branded dark card */
              <div className="w-full h-full bg-black/60 flex items-center justify-center">
                <Play size={24} className="text-white/60" />
              </div>
            )}
            {/* Always-visible ▶ badge */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition-colors duration-200">
              <div className="w-10 h-10 rounded-full bg-black/70 group-hover:bg-primary/90 border border-white/20 flex items-center justify-center backdrop-blur-sm transition-colors duration-200">
                <Play size={16} className="text-white ml-0.5" fill="white" />
              </div>
            </div>
            {/* "Trailer" label */}
            <div className="absolute bottom-1.5 left-0 right-0 flex justify-center pointer-events-none">
              <span className="text-[9px] font-mono uppercase tracking-widest text-white/70 bg-black/60 px-2 py-0.5 rounded-full">
                Trailer
              </span>
            </div>
          </button>
        )}
      </div>
    </section>
  )
}

/** Required attribution block — shown on every modal with sourced data. */
function Attribution({ source }: { source: "rawg" | "tgdb" }) {
  return (
    <div className="border-t border-border/20 pt-4 mt-2">
      <p className="text-xs text-muted-foreground/70 flex flex-wrap items-center gap-1.5">
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
  // Lightbox: null = closed, number = active slide index
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // Fetch enriched detail whenever a new game is selected
  useEffect(() => {
    if (!game) {
      setDetail(null)
      setError(null)
      setLightboxIndex(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setDetail(null)
    setError(null)
    setLightboxIndex(null)

    fetchGameDetail(game.id)
      .then(d  => { if (!cancelled) { setDetail(d);  setLoading(false) } })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false) } })

    return () => { cancelled = true }
  }, [game?.id])

  const displayed = detail ?? (game
    ? { ...game, description: null, screenshots: [], trailerYoutubeId: null, trailerUrl: null, attribution: game.source } as GameDetail
    : null)

  const year = displayed?.releaseDate
    ? new Date(displayed.releaseDate.replace(/-/g, "/")).getFullYear()
    : null

  // Build slides once detail is loaded
  const slides: MediaSlide[] = detail
    ? buildSlides(detail.screenshots, detail.trailerYoutubeId, detail.trailerUrl)
    : []

  return (
    <>
      <Dialog open={!!game} onOpenChange={open => { if (!open) onClose() }}>
        <DialogContent
          className="max-w-2xl w-full p-0 overflow-hidden bg-background border-border/50 gap-0 max-h-[90vh] flex flex-col"
          hideDefaultClose
        >
          {/* Visually-hidden title for screen readers */}
          <DialogTitle className="sr-only">
            {displayed?.title ?? "Game detail"}
          </DialogTitle>

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1">

            {/* ── Cover art hero ── */}
            <div className="relative">
              <div className="aspect-video bg-secondary overflow-hidden">
                {displayed?.coverImageUrl ? (
                  <img
                    src={displayed.coverImageUrl}
                    alt={displayed.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
                    <ImageIcon size={48} />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
              </div>

              {/* Close button */}
              <button
                onClick={onClose}
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

                  {/* Publisher · Year */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5">
                    {displayed?.publisherName && (
                      <span className="text-xs font-mono text-primary/70">
                        {displayed.publisherName}
                      </span>
                    )}
                    {displayed?.publisherName && year && (
                      <span className="text-muted-foreground/30 text-xs">·</span>
                    )}
                    {year && (
                      <span className="text-xs font-mono text-muted-foreground/60">{year}</span>
                    )}
                  </div>

                  {/* Platform chips */}
                  {displayed && displayed.platforms.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {displayed.platforms.map(p => (
                        <span
                          key={p}
                          className="text-[9px] font-mono uppercase tracking-wide bg-secondary border border-border/50 text-muted-foreground px-1.5 py-0.5 rounded"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Score badge */}
                {displayed && <ScoreBadge game={displayed} />}
              </div>

              {/* Retailer affiliate buttons */}
              {displayed && (
                <div className="mt-3">
                  <RetailerLinks
                    urls={displayed.retailerSearchUrls}
                    platforms={displayed.platforms}
                    variant="detail"
                  />
                </div>
              )}
            </div>

            {/* ── Loading / error states ── */}
            {loading && (
              <div className="px-5 py-4">
                <ModalSkeleton />
              </div>
            )}

            {error && !loading && (
              <div className="px-5 py-2 text-xs text-muted-foreground/60">
                Could not load additional details.
              </div>
            )}

            {/* ── Rich content: description + unified media gallery ── */}
            {detail && !loading && (
              <div className="px-5 pb-2 space-y-6 mt-2">

                {/* Description */}
                {detail.description && (
                  <section>
                    <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground/60 mb-3">
                      About this game
                    </h3>
                    <Description text={detail.description} />
                  </section>
                )}

                {/* Unified media gallery — screenshots + trailer thumbnail */}
                <Gallery
                  screenshots={detail.screenshots}
                  trailerYoutubeId={detail.trailerYoutubeId}
                  trailerUrl={detail.trailerUrl}
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

      {/* ── Media lightbox — rendered as a portal above the dialog ── */}
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
