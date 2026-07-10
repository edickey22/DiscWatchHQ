/**
 * tgdbBudget — hard daily call-budget enforcement for TheGamesDB API.
 *
 * Background
 * ----------
 * TGDB free tier: 1 000 requests / month ≈ 33 / day.
 * We cap at DAILY_TOTAL = 28 (28 × 31 = 868 < 1 000) which leaves ~5 calls/day
 * as headroom so the monthly cap is never at risk even in a longer month.
 *
 * The 28 slots are split:
 *   BACKFILL_ALLOC = 10  — reserved for the background enrichment backfill
 *   SEARCH_ALLOC   = 18  — available for live user-driven searches
 *
 * Persistence
 * -----------
 * Budget state is stored in the `system_kv` table so restarts don't reset the
 * counter mid-day. An in-memory `_mem` reference is kept for the warm path.
 * All writes are fire-and-forget from the caller's perspective — _mem is updated
 * synchronously first, then persisted async.
 *
 * Concurrency safety
 * ------------------
 * checkAndReserveTgdbCall() is the single public entry point for check + reserve.
 * It awaits the state load exactly once, then performs the budget check and
 * in-memory increment SYNCHRONOUSLY (no intermediate await). In Node.js, one
 * microtask runs to completion before the next, so mutating `_mem` before any
 * further await means concurrent callers' microtasks see the updated counter.
 * This prevents the "both pass the check before either records" double-spend.
 *
 * Failure modes
 * -------------
 * DB read failure  → pessimistic block for THIS CALL ONLY; _mem is left null
 *                    so the next call retries the DB (not sticky all day).
 * DB write failure → _mem is already updated; call proceeds; loss is at most
 *                    one slot if the server restarts before the DB write retries.
 */

import { eq } from "drizzle-orm";
import { db, systemKv } from "@workspace/db";
import { logger } from "./logger";

// ── Constants ─────────────────────────────────────────────────────────────────

export const DAILY_TOTAL    = 28;                           // max TGDB calls per UTC day
export const BACKFILL_ALLOC = 10;                           // backfill's share of those 28
export const SEARCH_ALLOC   = DAILY_TOTAL - BACKFILL_ALLOC; // 18 for live searches

const KV_KEY = "tgdb_budget";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CallType = "search" | "backfill";

interface BudgetState {
  date:          string;  // UTC date "YYYY-MM-DD" — resets at UTC midnight
  totalCalls:    number;  // all TGDB calls today (search + backfill)
  backfillCalls: number;  // subset used by backfill
}

// ── In-memory state ───────────────────────────────────────────────────────────

/** null = not loaded yet (or last load failed — triggers a DB retry next call) */
let _mem: BudgetState | null = null;

function utcToday(): string {
  // Slice ISO string to "YYYY-MM-DD" — always UTC
  return new Date().toISOString().slice(0, 10);
}

function freshState(): BudgetState {
  return { date: utcToday(), totalCalls: 0, backfillCalls: 0 };
}

// ── DB I/O ────────────────────────────────────────────────────────────────────

async function loadFromDb(): Promise<BudgetState> {
  const rows = await db.select().from(systemKv).where(eq(systemKv.key, KV_KEY)).limit(1);
  if (!rows.length) return freshState();
  const stored = rows[0].value as BudgetState;
  // Date has rolled over → treat as fresh day regardless of stored counters
  return stored.date === utcToday() ? stored : freshState();
}

/** Async fire-and-forget persist — _mem must already be updated before calling this. */
function persistAsync(state: BudgetState): void {
  const value = state as unknown as Record<string, unknown>;
  db.insert(systemKv)
    .values({ key: KV_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemKv.key, set: { value, updatedAt: new Date() } })
    .catch(err => logger.warn({ err }, "tgdbBudget: DB persist failed — in-memory counter still current"));
}

// ── State loader ──────────────────────────────────────────────────────────────

/**
 * Return current budget state.
 *
 * Hot path (date matches _mem): returns _mem directly — no DB round-trip.
 * Cold/error path: loads from DB. On failure, returns a pessimistic "full"
 * state WITHOUT caching it in _mem, so the next call retries the DB.
 */
async function getState(): Promise<BudgetState> {
  if (_mem && _mem.date === utcToday()) return _mem;
  try {
    _mem = await loadFromDb();
    return _mem;
  } catch (err) {
    logger.warn({ err }, "tgdbBudget: DB read failed — pessimistic block for this call only (will retry)");
    // Return pessimistic value WITHOUT storing in _mem so the next call retries
    return { date: utcToday(), totalCalls: DAILY_TOTAL, backfillCalls: BACKFILL_ALLOC };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Atomically check whether a TGDB call is allowed and, if so, reserve the slot.
 *
 * Returns true  → caller may proceed with a TGDB API call.
 * Returns false → budget exhausted; caller should skip TGDB gracefully.
 *
 * Concurrency guarantee:
 *   The budget check and _mem mutation are synchronous (no intermediate await).
 *   In Node.js, a microtask runs to completion before the next one starts.
 *   Because getState() returns the shared _mem reference on the hot path,
 *   mutating state.totalCalls here is immediately visible to the next microtask,
 *   preventing concurrent requests from both "passing" the same budget slot.
 */
export async function checkAndReserveTgdbCall(type: CallType): Promise<boolean> {
  // Single await — state load (DB on cold path, instant on warm path)
  const state = await getState();

  // ── Synchronous from here: no awaits until function returns ───────────────
  if (state.totalCalls >= DAILY_TOTAL)                              return false;
  if (type === "backfill" && state.backfillCalls >= BACKFILL_ALLOC) return false;

  // Reserve the slot: mutate _mem synchronously so concurrent microtasks see it
  state.totalCalls  += 1;
  if (type === "backfill") state.backfillCalls += 1;

  logger.debug(
    { type, totalCalls: state.totalCalls, remaining: DAILY_TOTAL - state.totalCalls },
    "TGDB call reserved",
  );

  // Persist asynchronously — _mem is already correct
  persistAsync({ ...state });

  return true;
}

/**
 * Read-only budget peek — does NOT reserve a slot.
 * Use checkAndReserveTgdbCall() for actual call gating.
 */
export async function canCallTgdb(type: CallType): Promise<boolean> {
  try {
    const state = await getState();
    if (state.totalCalls >= DAILY_TOTAL) return false;
    if (type === "backfill" && state.backfillCalls >= BACKFILL_ALLOC) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Return a full budget snapshot for the monitoring endpoint.
 */
export async function getTgdbBudgetStatus() {
  const state = await getState();
  const searchCalls = state.totalCalls - state.backfillCalls;
  return {
    date:           state.date,
    totalCalls:     state.totalCalls,
    totalBudget:    DAILY_TOTAL,
    totalRemaining: Math.max(0, DAILY_TOTAL - state.totalCalls),
    backfillCalls:  state.backfillCalls,
    backfillBudget: BACKFILL_ALLOC,
    searchCalls,
    searchBudget:   SEARCH_ALLOC,
    exhausted:      state.totalCalls >= DAILY_TOTAL,
  };
}
