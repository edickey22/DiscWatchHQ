/**
 * Central place for sending custom GA4 events from the app.
 *
 * Exists so there is exactly one spot that resolves the gtag function,
 * rather than every call site guessing at where it lives. The standard GA4
 * loader snippet in index.html defines `gtag` as a global function
 * declaration, which browsers also expose as `window.gtag` — but some
 * container/GTM setups only ever expose a bare global `gtag` without an
 * explicit `window.gtag` assignment. This checks both explicitly instead of
 * assuming one or the other.
 */
function resolveGtag(): ((...args: unknown[]) => void) | undefined {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    return window.gtag
  }
  const globalGtag = (globalThis as Record<string, unknown>).gtag
  return typeof globalGtag === "function"
    ? (globalGtag as (...args: unknown[]) => void)
    : undefined
}

/**
 * Sends a GA4 "search" event with the user's actual, trimmed search phrase.
 *
 * No-ops silently (never throws) when:
 *   - the term is blank/whitespace-only — a blank search is never reported.
 *   - gtag isn't available (GA4 blocked, ad blocker, script not yet loaded).
 */
export function trackSearchEvent(term: string): void {
  const trimmed = term.trim()
  if (!trimmed) return

  const gtagFn = resolveGtag()
  if (!gtagFn) return

  gtagFn("event", "search", { search_term: trimmed })
}
