/**
 * GameDetailModal — rich game detail popup for the Browse Games page.
 *
 * Hero behaviour:
 *   - Opens with the static cover image.
 *   - If the game has a trailer, automatically crossfades into a muted
 *     video after 2.5 seconds. The user can unmute with the overlay control.
 *   - Resets to static image whenever a different game is opened.
 *
 * Media gallery:
 *   Screenshots and the trailer appear in a unified thumbnail grid below the
 *   description. Clicking any thumbnail opens MediaLightbox (full-viewport
 *   overlay with navigation, keyboard, swipe, and autoplay).
 *
 * Attribution requirements (API ToS — must always be visible):
 *   RAWG: "Powered by RAWG" link to rawg.io
 *   TGDB: "Data from TheGamesDB" link (courtesy credit)
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui/dialog"
import { RetailerLinks } from "@/components/RetailerLinks"
import {
  ExternalLink, X, Play, Image as ImageIcon,
  ChevronDown, ChevronUp, VolumeX, Volume2,
} from "lucide-react"
import type { CatalogGame } from "@/components/TgdbGameCard"
import { MediaLightbox, type MediaSlide } from "@/components/MediaLightbox"

// ── API response type ─────────────────────────────────────────────────────────

interface GameDetail extends CatalogGame {
  description:       string | null
  screenshots:       string[]
  trailerYoutubeId:  string | null
  trailerUrl:        string | null
  /** Thumbnail URL from clip.preview or movies[0].preview; used as <video poster>. */
  trailerPreviewUrl: string | null
  attribution:       "rawg" | "tgdb"
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function fetchGameDetail(sourceId: string): Promise<GameDetail> {
  const res = await fetch(`/api/games/detail/${encodeURIComponent(sourceId)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Whether this detail object has a usable trailer for the hero / gallery.
 * YouTube always works; mp4 only when the URL explicitly ends in .mp4.
 */
/** Regex: URL path (before any query string) ends with .mp4, case-insensitive. */
const MP4_RE = /\.mp4(?:[?#]|$)/i

function hasTrailer(detail: GameDetail | null): boolean {
  if (!detail) return false
  return !!(detail.trailerYoutubeId || (detail.trailerUrl && MP4_RE.test(detail.trailerUrl)))
}

/** Build the ordered slide list for the lightbox.
 *  Screenshots first, trailer last (so screenshot index === slide index). */
function buildSlides(
  screenshots: string[],
  trailerYoutubeId: string | null,
  trailerUrl: string | null,
): MediaSlide[] {
  const slides: MediaSlide[] = screenshots.map(url => ({ kind: "image", url }))
  if (trailerYoutubeId) {
    slides.push({ kind: "youtube", id: trailerYoutubeId })
  } else if (trailerUrl && MP4_RE.test(trailerUrl)) {
    slides.push({ kind: "mp4", url: trailerUrl })
  }
  return slides
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
        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50 leading-none">
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
        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50 leading-none">
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
 * Unified media gallery — screenshots + trailer thumbnail in one 3-column grid.
 * Each cell is a <button> that opens the lightbox at the correct slide index.
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
  // Must match buildSlides() and hasTrailer() exactly — uses same MP4_RE
  const showTrailer = !!(trailerYoutubeId || (trailerUrl && MP4_RE.test(trailerUrl)))
  const totalItems = screenshots.length + (showTrailer ? 1 : 0)
  if (totalItems === 0) return null

  const trailerSlideIndex = screenshots.length
  const ytThumb = trailerYoutubeId
    ? `https://img.youtube.com/vi/${trailerYoutubeId}/mqdefault.jpg`
    : null

  const sectionLabel =
    screenshots.length > 0 && showTrailer ? "Screenshots & Trailer"
    : screenshots.length > 0 ? "Screenshots"
    : "Trailer"

  return (
    <section>
      <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground/60 mb-3 flex items-center gap-2">
        <ImageIcon size={12} /> {sectionLabel}
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

        {showTrailer && (
          <button
            type="button"
            onClick={() => onOpen(trailerSlideIndex)}
            className="relative aspect-video rounded overflow-hidden bg-secondary group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Watch trailer in full-screen viewer"
          >
            {ytThumb ? (
              <img
                src={ytThumb}
                alt="Trailer thumbnail"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full bg-black/60 flex items-center justify-center">
                <Play size={24} className="text-white/60" />
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition-colors duration-200">
              <div className="w-10 h-10 rounded-full bg-black/70 group-hover:bg-primary/90 border border-white/20 flex items-center justify-center backdrop-blur-sm transition-colors duration-200">
                <Play size={16} className="text-white ml-0.5" fill="white" />
              </div>
            </div>
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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // ── Hero state — static image → muted video after 2.5 s ──
  const [heroMode,  setHeroMode]  = useState<"image" | "video">("image")
  const [heroMuted, setHeroMuted] = useState(true)
  const heroIframeRef = useRef<HTMLIFrameElement>(null)
  const heroVideoRef  = useRef<HTMLVideoElement>(null)

  // Reset all transient state whenever a different game is opened
  useEffect(() => {
    setDetail(null)
    setError(null)
    setLightboxIndex(null)
    setHeroMode("image")
    setHeroMuted(true)

    if (!game) return

    let cancelled = false
    setLoading(true)

    fetchGameDetail(game.id)
      .then(d  => { if (!cancelled) { setDetail(d);  setLoading(false) } })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false) } })

    return () => { cancelled = true }
  }, [game?.id])

  // Auto-play timer: crossfade hero to video 2.5 s after detail loads
  useEffect(() => {
    if (!hasTrailer(detail)) return
    const timer = setTimeout(() => setHeroMode("video"), 2500)
    return () => clearTimeout(timer)
  }, [detail?.trailerYoutubeId, detail?.trailerUrl])

  // Unmute hero video (YouTube via postMessage; mp4 via ref)
  const handleHeroUnmute = useCallback(() => {
    heroIframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func: "unMute", args: "" }),
      "https://www.youtube.com",
    )
    if (heroVideoRef.current) heroVideoRef.current.muted = false
    setHeroMuted(false)
  }, [])

  const displayed = detail ?? (game
    ? { ...game, description: null, screenshots: [], trailerYoutubeId: null, trailerUrl: null, trailerPreviewUrl: null, attribution: game.source } as GameDetail
    : null)

  const year = displayed?.releaseDate
    ? new Date(displayed.releaseDate.replace(/-/g, "/")).getFullYear()
    : null

  const slides: MediaSlide[] = detail
    ? buildSlides(detail.screenshots, detail.trailerYoutubeId, detail.trailerUrl)
    : []

  // Whether the hero is actively showing video (used to decide rendering)
  const showingVideo  = heroMode === "video" && !!detail && hasTrailer(detail)
  const isYouTubeHero = showingVideo && !!detail?.trailerYoutubeId
  const isMp4Hero     = showingVideo && !detail?.trailerYoutubeId && !!(detail?.trailerUrl && MP4_RE.test(detail.trailerUrl))

  return (
    <>
      <Dialog open={!!game} onOpenChange={open => { if (!open) onClose() }}>
        <DialogContent
          className="max-w-2xl w-full p-0 overflow-hidden bg-background border-border/50 gap-0 max-h-[90vh] flex flex-col"
          hideDefaultClose
        >
          <DialogTitle className="sr-only">
            {displayed?.title ?? "Game detail"}
          </DialogTitle>

          <div className="overflow-y-auto flex-1">

            {/* ── Hero area: cover image → auto-plays trailer after 2.5 s ── */}
            <div className="relative">
              <div className="aspect-video bg-black overflow-hidden relative">

                {/* Static cover image — fades out when video takes over */}
                {displayed?.coverImageUrl ? (
                  <img
                    src={displayed.coverImageUrl}
                    alt={displayed.title}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${showingVideo ? "opacity-0" : "opacity-100"}`}
                  />
                ) : (
                  <div className={`absolute inset-0 flex items-center justify-center text-muted-foreground/20 transition-opacity duration-1000 ${showingVideo ? "opacity-0" : "opacity-100"}`}>
                    <ImageIcon size={48} />
                  </div>
                )}

                {/* YouTube hero (autoplay muted, no controls — clean cinematic look) */}
                {isYouTubeHero && (
                  <iframe
                    key={`hero-yt-${detail!.trailerYoutubeId}`}
                    ref={heroIframeRef}
                    src={`https://www.youtube.com/embed/${detail!.trailerYoutubeId}?autoplay=1&mute=1&enablejsapi=1&rel=0&controls=0&modestbranding=1&playsinline=1`}
                    title="Game trailer"
                    className="absolute inset-0 w-full h-full animate-in fade-in duration-700"
                    sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  />
                )}

                {/* mp4 hero — direct RAWG-hosted or movies-endpoint mp4 */}
                {isMp4Hero && (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video
                    key={detail!.trailerUrl!}
                    ref={heroVideoRef}
                    src={detail!.trailerUrl!}
                    poster={detail!.trailerPreviewUrl ?? undefined}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover animate-in fade-in duration-700"
                  />
                )}

                {/* Bottom gradient — sits above the video for readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent pointer-events-none" />

                {/* "TRAILER" label — appears when video is playing */}
                {showingVideo && (
                  <div className="absolute top-3 left-3 pointer-events-none">
                    <span className="text-[9px] font-mono uppercase tracking-widest text-white/60 bg-black/50 px-2 py-1 rounded-full backdrop-blur-sm">
                      Trailer
                    </span>
                  </div>
                )}

                {/* Unmute control */}
                {showingVideo && heroMuted && (
                  <button
                    onClick={handleHeroUnmute}
                    className="absolute bottom-4 left-4 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 text-white text-xs font-mono px-3 py-1.5 rounded-full transition-colors backdrop-blur-sm border border-white/20"
                    aria-label="Unmute trailer"
                  >
                    <VolumeX size={13} /> Unmute
                  </button>
                )}
                {showingVideo && !heroMuted && (
                  <div className="absolute bottom-4 left-4 flex items-center gap-1.5 bg-black/40 text-white/50 text-xs font-mono px-3 py-1.5 rounded-full pointer-events-none">
                    <Volume2 size={13} /> Sound on
                  </div>
                )}
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

                {displayed && <ScoreBadge game={displayed} />}
              </div>

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

            {/* ── Rich content: description + media gallery ── */}
            {detail && !loading && (
              <div className="px-5 pb-2 space-y-6 mt-2">
                {detail.description && (
                  <section>
                    <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground/60 mb-3">
                      About this game
                    </h3>
                    <Description text={detail.description} />
                  </section>
                )}

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
