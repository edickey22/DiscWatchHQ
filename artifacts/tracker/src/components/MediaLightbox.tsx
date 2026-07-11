/**
 * MediaLightbox — full-viewport overlay gallery for screenshots and trailers.
 *
 * Renders via React portal (z-[500]) so it sits above the game detail Dialog.
 *
 * Supported slide types:
 *   "image"   — full-res screenshot, letterboxed to fit viewport
 *   "youtube" — autoplay muted iframe; postMessage unmute control
 *   "mp4"     — autoplay muted <video>; ref-based unmute control
 *
 * Navigation:
 *   • Arrow buttons (left/right)
 *   • ← → keyboard arrow keys
 *   • Touch swipe (horizontal, 50 px threshold)
 *   • Mouse-wheel horizontal scroll (deltaX, 40 px threshold)
 *
 * Closing:
 *   • Escape key
 *   • Click on backdrop outside the slide
 *   • ✕ button (top-right)
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, Volume2, VolumeX, X } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

export type MediaSlide =
  | { kind: "image";   url: string }
  | { kind: "youtube"; id: string  }
  | { kind: "mp4";     url: string }

interface MediaLightboxProps {
  slides:       MediaSlide[]
  initialIndex: number
  onClose:      () => void
}

// ── Slide renderers ───────────────────────────────────────────────────────────

function ImageSlide({ url, alt }: { url: string; alt: string }) {
  return (
    <img
      src={url}
      alt={alt}
      className="max-h-[85vh] max-w-full object-contain rounded-sm select-none"
      draggable={false}
    />
  )
}

function YoutubeSlide({
  id,
  muted,
  onUnmute,
}: {
  id: string
  muted: boolean
  onUnmute: () => void
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Attempt postMessage unmute without reloading the iframe
  const handleUnmute = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func: "unMute", args: "" }),
      "https://www.youtube.com",
    )
    onUnmute()
  }, [onUnmute])

  return (
    <div className="relative w-full max-w-4xl">
      <div className="relative aspect-video w-full rounded-sm overflow-hidden bg-black">
        {/* key forces remount (and stops video) when slide changes */}
        <iframe
          key={`yt-${id}`}
          ref={iframeRef}
          src={`https://www.youtube.com/embed/${id}?autoplay=1&mute=1&enablejsapi=1&rel=0`}
          title="Game trailer"
          className="absolute inset-0 w-full h-full"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
      {muted && (
        <button
          onClick={handleUnmute}
          className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/70 hover:bg-black/90 text-white text-xs font-mono px-3 py-1.5 rounded-full transition-colors backdrop-blur-sm border border-white/20"
          aria-label="Unmute"
        >
          <VolumeX size={13} />
          Unmute
        </button>
      )}
      {!muted && (
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/50 text-white/60 text-xs font-mono px-3 py-1.5 rounded-full pointer-events-none">
          <Volume2 size={13} />
          Unmuted
        </div>
      )}
    </div>
  )
}

function Mp4Slide({
  url,
  muted,
  onUnmute,
}: {
  url: string
  muted: boolean
  onUnmute: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  const handleUnmute = useCallback(() => {
    if (videoRef.current) videoRef.current.muted = false
    onUnmute()
  }, [onUnmute])

  return (
    <div className="relative w-full max-w-4xl">
      <div className="relative aspect-video w-full rounded-sm overflow-hidden bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          key={url}
          ref={videoRef}
          src={url}
          autoPlay
          muted
          controls
          preload="metadata"
          className="absolute inset-0 w-full h-full"
        />
      </div>
      {muted && (
        <button
          onClick={handleUnmute}
          className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/70 hover:bg-black/90 text-white text-xs font-mono px-3 py-1.5 rounded-full transition-colors backdrop-blur-sm border border-white/20"
          aria-label="Unmute"
        >
          <VolumeX size={13} />
          Unmute
        </button>
      )}
    </div>
  )
}

// ── Main lightbox ─────────────────────────────────────────────────────────────

export function MediaLightbox({ slides, initialIndex, onClose }: MediaLightboxProps) {
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(initialIndex, slides.length - 1)),
  )
  const [muted, setMuted] = useState(true)

  const backdropRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const wheelCooldown = useRef(false)

  // Reset muted state whenever the active slide changes
  useEffect(() => {
    setMuted(true)
  }, [index])

  // Steal focus so keyboard events work immediately
  useEffect(() => {
    backdropRef.current?.focus()
  }, [])

  // Stable nav callbacks
  const prev = useCallback(() =>
    setIndex(i => (i - 1 + slides.length) % slides.length), [slides.length])
  const next = useCallback(() =>
    setIndex(i => (i + 1) % slides.length), [slides.length])

  // Keyboard navigation
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft")  { e.preventDefault(); prev() }
      if (e.key === "ArrowRight") { e.preventDefault(); next() }
      if (e.key === "Escape")     { e.preventDefault(); onClose() }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [prev, next, onClose])

  // Horizontal mouse-wheel navigation (throttled)
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (wheelCooldown.current) return
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      wheelCooldown.current = true
      setTimeout(() => { wheelCooldown.current = false }, 400)
      if (e.deltaX > 40) next()
      if (e.deltaX < -40) prev()
    }
    window.addEventListener("wheel", onWheel, { passive: true })
    return () => window.removeEventListener("wheel", onWheel)
  }, [prev, next])

  // Touch-swipe handlers
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }
  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0) next(); else prev()
    }
  }

  const slide = slides[index]
  const isVideo = slide.kind === "youtube" || slide.kind === "mp4"

  return createPortal(
    <div
      ref={backdropRef}
      tabIndex={-1}
      // pointer-events-auto is required here: Radix Dialog sets `pointer-events: none`
      // on <body> while its own dialog is open (scoping interaction to its content),
      // and this lightbox is a separate document.body portal — a sibling, not a
      // descendant, of the Radix dialog content — so it inherits that `none` and
      // silently ignores all touch/click input unless explicitly re-enabled here.
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/92 outline-none pointer-events-auto"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      aria-modal="true"
      role="dialog"
      aria-label="Media viewer"
    >
      {/* ── Slide content — stops backdrop click from propagating ── */}
      <div
        className="relative flex items-center justify-center px-14 w-full h-full"
        onClick={e => e.stopPropagation()}
      >
        {/* Current slide */}
        <div className="flex items-center justify-center w-full">
          {slide.kind === "image" && (
            <ImageSlide url={slide.url} alt={`Screenshot ${index + 1}`} />
          )}
          {slide.kind === "youtube" && (
            <YoutubeSlide
              id={slide.id}
              muted={muted}
              onUnmute={() => setMuted(false)}
            />
          )}
          {slide.kind === "mp4" && (
            <Mp4Slide
              url={slide.url}
              muted={muted}
              onUnmute={() => setMuted(false)}
            />
          )}
        </div>

        {/* ── Prev arrow ── */}
        {slides.length > 1 && (
          <button
            onClick={e => { e.stopPropagation(); prev() }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 border border-white/10 flex items-center justify-center text-white/80 hover:text-white transition-all backdrop-blur-sm"
            aria-label="Previous"
          >
            <ChevronLeft size={22} />
          </button>
        )}

        {/* ── Next arrow ── */}
        {slides.length > 1 && (
          <button
            onClick={e => { e.stopPropagation(); next() }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 border border-white/10 flex items-center justify-center text-white/80 hover:text-white transition-all backdrop-blur-sm"
            aria-label="Next"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {/* ── Close button ── */}
      <button
        onClick={e => { e.stopPropagation(); onClose() }}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all backdrop-blur-sm"
        aria-label="Close lightbox"
      >
        <X size={16} />
      </button>

      {/* ── Slide counter + type label ── */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-3 pointer-events-none">
        {/* Dot indicators */}
        {slides.length > 1 && slides.length <= 12 && (
          <div className="flex items-center gap-1.5">
            {slides.map((s, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); setIndex(i) }}
                className={`w-1.5 h-1.5 rounded-full transition-all pointer-events-auto ${
                  i === index
                    ? "bg-white scale-125"
                    : "bg-white/35 hover:bg-white/60"
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        )}
        {/* Numeric counter for long galleries */}
        {slides.length > 12 && (
          <span className="text-xs font-mono text-white/50">
            {index + 1} / {slides.length}
          </span>
        )}
        {/* Video label */}
        {isVideo && (
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">
            trailer
          </span>
        )}
      </div>
    </div>,
    document.body,
  )
}
