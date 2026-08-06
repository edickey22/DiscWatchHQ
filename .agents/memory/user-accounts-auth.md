---
name: User accounts & auth architecture
description: Magic-link auth, tracking, alerts — all four phases fully implemented. Key decisions for future consistency.
---

## Auth: magic-link (passwordless)

- Cookie name: `dwsession` (httpOnly, SameSite=Lax, path=/, 30-day TTL)
- Cookie value: 64-char hex raw token (never stored); DB stores SHA-256 hash
- Auth tokens (magic links): 15-min expiry, single-use (`used_at` timestamp)
- Rate limit: 5 requests/IP/15m (express-rate-limit default keyGenerator; never use custom `keyGenerator` with req.ip — throws IPv6 validation error)
- Secondary rate limit: 3 tokens/email/hour (DB check before insert)

**Why:** httpOnly prevents XSS token theft; hash-only storage means a DB leak doesn't expose session values.

**How to apply:** All session operations go through `lib/authMiddleware.ts`. Use `loadUser` globally in app.ts and `requireAuth` per-route.

## Same-origin cookie behavior

- Tracker (port 20338, path `/`) and API server (port 8080, path `/api`) are both proxied under the same Replit domain.
- Cookies with `path=/` are sent to both — no CORS credential complexity needed.
- CORS is set to `origin: true, credentials: true` to handle the vite dev-server cross-port case.

## DB tables added (Phases 1–4)

- `users` — email, id, created_at. Upserted on first login.
- `auth_tokens` — magic-link tokens (hash only, single-use, 15-min expiry)
- `sessions` — persistent login sessions (hash only, 30-day expiry)
- `tracked_items` — user watchlist; unique on (user_id, item_type, item_id). item_data is a JSONB snapshot of display fields at track time.
- `alert_prefs` — email alerts per tracked item; alert_type enum: restock/price_drop/status_change. baseline_value stored at opt-in for change detection.

All child tables have `onDelete: cascade` on user_id FK — deleting a user cleans everything.

## Email

- Uses nodemailer (SMTP) via `lib/email.ts`. Reads SMTP_HOST/PORT/USER/PASS.
- Falls back to console.log stub if SMTP_HOST is not set (dev-safe).
- To switch to Resend: install `resend`, add `RESEND_API_KEY` secret, replace `sendViaSmtp` in email.ts — everything else stays the same.
- `sendAlertEmail()` is the integration point for Phase 3 alert delivery.

## Alert checker

- Runs 2 min after startup, then every 4 hours.
- Release alerts (restock + status_change): fully implemented and SMTP-confirmed via live test.
- Console price-drop alerts: fully implemented. Source = `getConsoleListingsEntry()` lowest BIN price. 10% threshold. SMTP-confirmed via live test (`[DiscWatchHQ] Price drop: ps5-pro` delivered).
- Game price-drop alerts: implemented but no-ops until BESTBUY_API_KEY or AMAZON_PA_API_KEY set. Code is correct — will auto-activate when credentials are added.
- Baseline null handling: first run initialises baseline_value in DB, skips notification. Subsequent runs compare and fire if ≥10% drop. Baseline updated to new lower price after firing (prevents re-spam).
- 24-hour cool-off window between repeated alerts for the same item (uses `last_notified_at`).
- Dev test endpoints: `POST /api/dev/test-price-alert` and `POST /api/dev/test-release-alert` — only mounted in NODE_ENV !== "production".

## Frontend

- `AuthProvider` wraps the app; `useAuth()` gives user/loading/openLogin/logout.
- `AuthModal` renders at App root — any page can call `openLogin()` to show it.
- `TrackButton` is self-contained — auth-gates itself (calls openLogin if not logged in), optimistic toggle, fetches initial state from `/api/tracking/status` when user is logged in.
- TrackButton integrated on: boutique `GameCard`, `ConsoleCard`. CatalogGameCard (Browse Games) has it too.
- Routes added: `/tracking` (TrackingPage), `/profile` (ProfilePage).
- UserMenu in Header: shows email initial + dropdown with Watchlist, Profile, Sign out when logged in; shows "Sign in" button when logged out. Mobile hamburger also has auth actions.
- Alert bell on TrackingPage: shows for ALL item types. Release → status_change alert. Game/console → price_drop alert (baselineValue omitted; checker auto-initialises on first run).

## SMTP confirmed working (live production)

- Magic-link email: confirmed delivered — SMTP log `"Email sent" subject: "Your DiscWatchHQ login link"` appeared in prod logs.
- Console price-drop alert: confirmed delivered via dev test endpoint — `"Email sent" subject: "[DiscWatchHQ] Price drop: ps5-pro"`.
- Release status-change alert: confirmed delivered — `"Email sent" subject: "[DiscWatchHQ] Status update: Castle of Shikigami 2 Nintendo Switch™"`.
