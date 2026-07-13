/**
 * consoleListingsCache — in-process store for live eBay console listings,
 * keyed per console model.
 *
 * This module holds NO scheduling logic and makes NO API calls itself — it
 * is a plain read/write cache. Population happens exclusively in
 * consoleListingsScheduler.ts's background interval. Visitor-facing routes
 * (routes/consoles.ts) only ever read from here, so no amount of site
 * traffic can trigger an eBay API call.
 */

import { CONSOLE_MODELS, type ConsoleModel } from "./consoleModels";
import type { ConsoleListing } from "./ebayConsolesClient";
import { buildEbaySearchUrl } from "./affiliateConfig";

interface CacheEntry {
  listings:  ConsoleListing[];
  updatedAt: number; // ms epoch, null-ish (0) until the first refresh completes
}

const _cache = new Map<string, CacheEntry>();

export function setConsoleListings(id: string, listings: ConsoleListing[]): void {
  _cache.set(id, { listings, updatedAt: Date.now() });
}

export function getConsoleListingsEntry(id: string): CacheEntry | null {
  return _cache.get(id) ?? null;
}

export interface ConsoleSummary extends ConsoleModel {
  /** Static, EPN-tagged eBay search URL — always present, used as the
   *  fallback CTA whenever no live listings are cached yet for this model. */
  searchUrl: string;
  /** True once at least one refresh cycle has completed for this model. */
  hasFetched: boolean;
  /** Number of live listings currently cached (0 if none yet or fetch found nothing). */
  listingCount: number;
}

/** Lightweight per-console summary for the main Consoles grid — no listing
 *  payloads, just enough to render a card and link to the detail page. */
export function getConsoleSummaries(): ConsoleSummary[] {
  return CONSOLE_MODELS.map(model => {
    const entry = _cache.get(model.id);
    return {
      ...model,
      searchUrl:    buildEbaySearchUrl(model.query, "139971"),
      hasFetched:   !!entry,
      listingCount: entry?.listings.length ?? 0,
    };
  });
}

export interface ConsoleDetail extends ConsoleModel {
  searchUrl:  string;
  listings:   ConsoleListing[];
  updatedAt:  number | null;
}

/** Full detail payload for a single console's detail page. Returns null if
 *  the id doesn't match a known console model. */
export function getConsoleDetail(id: string): ConsoleDetail | null {
  const model = CONSOLE_MODELS.find(m => m.id === id);
  if (!model) return null;

  const entry = _cache.get(id);
  return {
    ...model,
    searchUrl: buildEbaySearchUrl(model.query, "139971"),
    listings:  entry?.listings ?? [],
    updatedAt: entry?.updatedAt ?? null,
  };
}
