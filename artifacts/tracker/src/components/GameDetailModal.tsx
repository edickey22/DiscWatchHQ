/**
 * GameDetailModal — rich game detail popup for the Browse Games page.
 *
 * Fetches RAWG-enriched data (description, screenshots, trailer) on open.
 * Attribution requirements:
 *   - RAWG source: "Powered by RAWG" with live link to rawg.io (API ToS requirement)
 *   - TGDB source: "Data from TheGamesDB" with live link (applied as a courtesy)
 *
 * Graceful degradation: missing description, screenshots, or trailer sections
 * are simply omitted — no broken/empty placeholders are shown.
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
      <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-sm font-mono font-black bg-secondary text-muted-foreground border border-border/50"
        title={`ESRB: ${game.esrbRating}`}>
        {label}
      </span>
    )
  }
  return null
}

/** Collapsible description — shows 5 lines, expand to full. */
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

/** Screenshot gallery — up to 6, each opens full-res in new tab. */
function Screenshots({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null
  return (
    <section>
      <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground/60 mb-3 flex items-center gap-2">
        <ImageIcon size={12} /> Screenshots
      </h3>
      <div className="grid grid-cols-3 gap-1.5">
        {urls.map((url, i) => (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="relative aspect-video rounded overflow-hidden bg-secondary block group"
          >
            <img
              src={url}
              alt={`Screenshot ${i + 1}`}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          </a>
        ))}
      </div>
    </section>
  )
}

/** YouTube embed, mp4 embed, or fallback link depending on what RAWG returns. */
function Trailer({
  youtubeId,
  url,
}: {
  youtubeId: string | null
  url: string | null
}) {
  if (!youtubeId && !url) return null

  const isMp4 = !youtubeId && url && (url.endsWith(".mp4") || url.includes(".mp4?"))

  return (
    <section>
      <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground/60 mb-3 flex items-center gap-2">
        <Play size={12} /> Trailer
      </h3>
      {youtubeId ? (
        <div className="relative aspect-video rounded overflow-hidden bg-black">
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}`}
            title="Game trailer"
            className="absolute inset-0 w-full h-full"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      ) : isMp4 ? (
        <div className="rounded overflow-hidden bg-black aspect-video">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={url!}
            controls
            preload="metadata"
            className="w-full h-full"
          />
        </div>
      ) : url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <Play size={14} /> Watch trailer <ExternalLink size={12} />
        </a>
      ) : null}
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
  const [detail,  setDetail]  = useState<GameDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // Fetch enriched detail whenever a new game is selected
  useEffect(() => {
    if (!game) {
      setDetail(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setDetail(null)
    setError(null)

    fetchGameDetail(game.id)
      .then(d  => { if (!cancelled) { setDetail(d);  setLoading(false) } })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false) } })

    return () => { cancelled = true }
  }, [game?.id])

  const displayed = detail ?? (game ? { ...game, description: null, screenshots: [], trailerYoutubeId: null, trailerUrl: null, attribution: game.source } as GameDetail : null)

  const year = displayed?.releaseDate
    ? new Date(displayed.releaseDate.replace(/-/g, "/")).getFullYear()
    : null

  return (
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
              {/* Gradient for readability */}
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

            {/* Retailer affiliate buttons — primary CTA, detail variant = large solid */}
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

          {/* ── Rich content (description, screenshots, trailer) ── */}
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

              {/* Screenshots */}
              <Screenshots urls={detail.screenshots} />

              {/* Trailer */}
              <Trailer youtubeId={detail.trailerYoutubeId} url={detail.trailerUrl} />
            </div>
          )}

          {/* ── Attribution (required) ── */}
          {displayed && (
            <div className="px-5 pb-5">
              <Attribution source={displayed.attribution ?? displayed.source} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
