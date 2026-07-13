/**
 * consoleListingsCache — in-process store for live eBay console listings,
 * keyed per console model.
 *
 * This module holds NO scheduling logic and makes NO eBay API calls itself —
 * it is a read/write cache. Population happens exclusively in
 * consoleListingsScheduler.ts's background interval. Visitor-facing routes
 * (routes/consoles.ts) only ever read from here, so no amount of site
 * traffic can trigger an eBay API call.
 *
 * ── Persistence ──────────────────────────────────────────────────────────
 * The cache is also mirrored to `system_kv` (key "console_listings_cache").
 * This is NOT for visitor-facing durability alone — it's what lets the
 * scheduler tell "still fresh from an earlier run today" apart from "never
 * fetched", which matters because this in-memory Map is wiped on every
 * process restart. Without persistence, every dev restart looked like a
 * cold start to the scheduler, so it re-fetched all ~26 models from
 * scratch regardless of how recently they'd actually been refreshed —
 * burning through the shared daily eBay call budget (ebayBudget.ts) many
 * times over in a single day of normal restarts, and starving whichever
 * models happened to be last in CONSOLE_MODELS once the budget ran out
 * (observed as those models permanently showing "no listings" for the
 * rest of the day). Loading the persisted snapshot at startup means a
 * restart can recognize recently-fetched models as fresh and skip
 * re-fetching them entirely.
 */

import { eq } from "drizzle-orm";
import { db, systemKv } from "@workspace/db";
import { CONSOLE_MODELS, type ConsoleModel } from "./consoleModels";
import type { ConsoleListing } from "./ebayConsolesClient";
import { buildEbaySearchUrl } from "./affiliateConfig";
import { logger } from "./logger";

interface CacheEntry {
  listings:  ConsoleListing[];
  updatedAt: number; // ms epoch, null-ish (0) until the first refresh completes
}

const _cache = new Map<string, CacheEntry>();

const KV_KEY = "console_listings_cache";

export function setConsoleListings(id: string, listings: ConsoleListing[]): void {
  _cache.set(id, { listings, updatedAt: Date.now() });
  persistCacheAsync();
}

export function getConsoleListingsEntry(id: string): CacheEntry | null {
  return _cache.get(id) ?? null;
}

/**
 * Load the persisted snapshot from `system_kv` into the in-memory cache.
 * Call once at startup, before the scheduler's first run, so a restart can
 * recognize still-fresh models instead of treating every model as never
 * fetched. Safe to call even if no snapshot exists yet (first-ever boot).
 */
export async function loadPersistedConsoleListings(): Promise<void> {
  try {
    const rows = await db.select().from(systemKv).where(eq(systemKv.key, KV_KEY)).limit(1);
    if (!rows.length) return;
    const stored = rows[0].value as Record<string, CacheEntry>;
    for (const [id, entry] of Object.entries(stored)) {
      if (entry && Array.isArray(entry.listings) && typeof entry.updatedAt === "number") {
        _cache.set(id, entry);
      }
    }
    logger.info({ restoredModels: _cache.size }, "Console listings cache restored from system_kv");
  } catch (err) {
    logger.warn({ err }, "consoleListingsCache: failed to load persisted snapshot — starting cold");
  }
}

function persistCacheAsync(): void {
  const value = Object.fromEntries(_cache.entries()) as unknown as Record<string, unknown>;
  db.insert(systemKv)
    .values({ key: KV_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemKv.key, set: { value, updatedAt: new Date() } })
    .catch(err => logger.warn({ err }, "consoleListingsCache: DB persist failed — in-memory cache still current"));
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
