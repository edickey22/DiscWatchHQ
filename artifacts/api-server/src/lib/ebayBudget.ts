/**
 * ebayBudget — hard daily call-budget enforcement for the eBay Browse API,
 * shared across every caller (price-backfill scheduler, console-listings
 * scheduler, and on-demand catalog live-pricing lookups).
 *
 * Background
 * ----------
 * Prior to this module, the eBay Browse API had NO enforced ceiling anywhere
 * in the codebase — only a comment ("eBay Browse API quota: 5,000 calls /
 * month") asserting a budget that was never actually verified against eBay's
 * developer dashboard or read from eBay's own rate-limit response headers.
 * That number should be treated as an unverified placeholder, not a fact —
 * eBay's published default limits for the Browse API are typically expressed
 * per DAY, not per month, and the real ceiling depends on your account's
 * approved application tier.
 *
 * Rather than keep guessing at eBay's real number, this module enforces our
 * OWN conservative daily ceiling — the actual runaway-usage protection this
 * codebase needs is a self-imposed cap that's always active, not a guess at
 * eBay's exact enforcement threshold. Override via EBAY_DAILY_CALL_BUDGET if
 * you confirm your account's real limit and want to raise (or lower) it.
 *
 * DAILY_TOTAL = 500, split three ways to match current observed usage with
 * headroom for catalog growth (see per-type allocations below):
 *   PRICE_ALLOC   = 400 — boutique sold-out price backfill (~331 titles/run
 *                         today; see ebayPriceScheduler.ts's own per-run cap
 *                         for the independent ceiling on catalog growth)
 *   CONSOLE_ALLOC =  50 — console-listings refresh (24 models/day today,
 *                         one call each)
 *   CATALOG_ALLOC =  50 — on-demand catalog game live-pricing (visitor-
 *                         triggered via catalogLivePricing.ts, previously
 *                         completely unbounded aside from its 4h result cache)
 *
 * Persistence
 * -----------
 * Same pattern as tgdbBudget.ts: state lives in `system_kv` so restarts
 * don't reset the counter mid-day, with an in-memory `_mem` reference for
 * the warm path and the same synchronous check+reserve concurrency guard.
 */

import { eq } from "drizzle-orm";
import { db, systemKv } from "@workspace/db";
import { logger } from "./logger";

// ── Constants ─────────────────────────────────────────────────────────────────

export const DAILY_TOTAL = parseInt(process.env.EBAY_DAILY_CALL_BUDGET ?? "") || 500;

export const PRICE_ALLOC   = Math.round(DAILY_TOTAL * 0.8);  // 400 @ default
export const CONSOLE_ALLOC = Math.round(DAILY_TOTAL * 0.1);  // 50  @ default
export const CATALOG_ALLOC = DAILY_TOTAL - PRICE_ALLOC - CONSOLE_ALLOC; // 50 @ default

const KV_KEY = "ebay_budget";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EbayCallType = "price" | "console" | "catalog";

interface BudgetState {
  date:         string;  // UTC date "YYYY-MM-DD" — resets at UTC midnight
  totalCalls:   number;  // all eBay Browse API search calls today
  priceCalls:   number;
  consoleCalls: number;
  catalogCalls: number;
}

const ALLOC: Record<EbayCallType, number> = {
  price:   PRICE_ALLOC,
  console: CONSOLE_ALLOC,
  catalog: CATALOG_ALLOC,
};

// ── In-memory state ───────────────────────────────────────────────────────────

let _mem: BudgetState | null = null;

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function freshState(): BudgetState {
  return { date: utcToday(), totalCalls: 0, priceCalls: 0, consoleCalls: 0, catalogCalls: 0 };
}

function typeCount(state: BudgetState, type: EbayCallType): number {
  return type === "price" ? state.priceCalls : type === "console" ? state.consoleCalls : state.catalogCalls;
}

function bumpType(state: BudgetState, type: EbayCallType): void {
  if (type === "price") state.priceCalls += 1;
  else if (type === "console") state.consoleCalls += 1;
  else state.catalogCalls += 1;
}

// ── DB I/O ────────────────────────────────────────────────────────────────────

async function loadFromDb(): Promise<BudgetState> {
  const rows = await db.select().from(systemKv).where(eq(systemKv.key, KV_KEY)).limit(1);
  if (!rows.length) return freshState();
  const stored = rows[0].value as BudgetState;
  return stored.date === utcToday() ? stored : freshState();
}

function persistAsync(state: BudgetState): void {
  const value = state as unknown as Record<string, unknown>;
  db.insert(systemKv)
    .values({ key: KV_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemKv.key, set: { value, updatedAt: new Date() } })
    .catch(err => logger.warn({ err }, "ebayBudget: DB persist failed — in-memory counter still current"));
}

// ── State loader ──────────────────────────────────────────────────────────────

async function getState(): Promise<BudgetState> {
  if (_mem && _mem.date === utcToday()) return _mem;
  try {
    _mem = await loadFromDb();
    return _mem;
  } catch (err) {
    logger.warn({ err }, "ebayBudget: DB read failed — pessimistic block for this call only (will retry)");
    return { date: utcToday(), totalCalls: DAILY_TOTAL, priceCalls: PRICE_ALLOC, consoleCalls: CONSOLE_ALLOC, catalogCalls: CATALOG_ALLOC };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Atomically check whether an eBay Browse API search call is allowed and,
 * if so, reserve the slot.
 *
 * Returns true  → caller may proceed with the API call.
 * Returns false → daily budget (total or per-type) exhausted; caller must
 *                 skip the call and degrade gracefully (return null/[]).
 *
 * Concurrency guarantee: same as tgdbBudget.checkAndReserveTgdbCall — the
 * check and _mem mutation are synchronous with no intermediate await, so
 * concurrent callers can't both "pass" the same budget slot.
 */
export async function checkAndReserveEbayCall(type: EbayCallType): Promise<boolean> {
  const state = await getState();

  // ── Synchronous from here: no awaits until function returns ───────────────
  if (state.totalCalls >= DAILY_TOTAL) return false;
  if (typeCount(state, type) >= ALLOC[type]) return false;

  state.totalCalls += 1;
  bumpType(state, type);

  logger.debug(
    { type, totalCalls: state.totalCalls, remaining: DAILY_TOTAL - state.totalCalls },
    "eBay Browse API call reserved",
  );

  persistAsync({ ...state });
  return true;
}

/** Read-only budget peek — does NOT reserve a slot. */
export async function canCallEbay(type: EbayCallType): Promise<boolean> {
  try {
    const state = await getState();
    if (state.totalCalls >= DAILY_TOTAL) return false;
    return typeCount(state, type) < ALLOC[type];
  } catch {
    return false;
  }
}

/** Full budget snapshot for the monitoring endpoint. */
export async function getEbayBudgetStatus() {
  const state = await getState();
  return {
    date:            state.date,
    totalCalls:      state.totalCalls,
    totalBudget:     DAILY_TOTAL,
    totalRemaining:  Math.max(0, DAILY_TOTAL - state.totalCalls),
    priceCalls:      state.priceCalls,
    priceBudget:     PRICE_ALLOC,
    consoleCalls:    state.consoleCalls,
    consoleBudget:   CONSOLE_ALLOC,
    catalogCalls:    state.catalogCalls,
    catalogBudget:   CATALOG_ALLOC,
    exhausted:       state.totalCalls >= DAILY_TOTAL,
  };
}
