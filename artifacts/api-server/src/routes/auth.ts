/**
 * auth.ts — magic-link authentication routes.
 *
 * POST /api/auth/request-link  Rate-limited. Sends a magic-link email.
 * GET  /api/auth/verify        Validates a token, creates session, redirects.
 * GET  /api/auth/me            Returns the current user (or 401).
 * POST /api/auth/logout        Clears the session cookie and DB row.
 * DELETE /api/auth/account     Deletes the user account and all their data.
 */

import { Router } from "express";
import { createHash } from "crypto";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import {
  usersTable, authTokensTable, sessionsTable,
  trackedItemsTable, alertPrefsTable,
} from "@workspace/db/schema";
import { eq, and, gt, lt, count } from "drizzle-orm";
import { sendMagicLinkEmail } from "../lib/email";
import { logger } from "../lib/logger";
import {
  SESSION_COOKIE, SESSION_TTL_MS,
  generateToken, hashToken, cookieOptions, requireAuth,
} from "../lib/authMiddleware";

const router = Router();

// ── Rate limiter — 5 link requests per IP per 15 minutes ─────────────────────

const requestLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit:    5,
  standardHeaders: "draft-8",
  legacyHeaders:   false,
  message: { error: "Too many login requests. Please wait 15 minutes before trying again." },
  // No custom keyGenerator — express-rate-limit uses the IP by default with
  // proper IPv6 handling via its internal ipKeyGenerator.
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** App base URL used for building magic-link and redirect URLs. */
function appUrl(): string {
  return process.env.APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN ?? "discwatchhq.com"}`;
}

/** Clears expired auth_tokens older than 1 hour (opportunistic cleanup). */
async function pruneExpiredTokens() {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await db.delete(authTokensTable).where(lt(authTokensTable.expiresAt, oneHourAgo));
  } catch { /* non-critical */ }
}

// ── POST /api/auth/request-link ───────────────────────────────────────────────

router.post("/auth/request-link", requestLinkLimiter, async (req, res) => {
  const { email } = req.body as { email?: string };

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "email is required" });
    return;
  }

  // Normalise and basic-validate email
  const normalised = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised)) {
    res.status(400).json({ error: "Invalid email address" });
    return;
  }

  // Secondary rate limit: max 3 tokens per email per hour (guards against IP-rotation abuse)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  try {
    // Check if user exists and how many recent tokens they've had
    const existingUser = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalised))
      .limit(1);

    if (existingUser[0]) {
      const [{ value: recentCount }] = await db
        .select({ value: count() })
        .from(authTokensTable)
        .where(
          and(
            eq(authTokensTable.userId, existingUser[0].id),
            gt(authTokensTable.createdAt, oneHourAgo),
          ),
        );
      if (recentCount >= 3) {
        res.status(429).json({ error: "Too many login links sent to this address. Please wait an hour." });
        return;
      }
    }
  } catch (err) {
    logger.error({ err }, "Error checking email rate limit");
  }

  try {
    // Upsert user (create on first login)
    const [user] = await db
      .insert(usersTable)
      .values({ email: normalised })
      .onConflictDoUpdate({ target: usersTable.email, set: { email: normalised } })
      .returning();

    // Generate token
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await db.insert(authTokensTable).values({
      userId:    user.id,
      tokenHash,
      expiresAt,
    });

    // Build verify link — points at the API verify endpoint which sets the
    // cookie and redirects back to the frontend.
    const base = appUrl();
    const verifyUrl = `${base}/api/auth/verify?token=${rawToken}`;

    logger.info({ base, to: normalised }, "Magic-link base URL (confirm this is the production domain in prod)");
    await sendMagicLinkEmail(normalised, verifyUrl, user.displayName);

    // Opportunistic cleanup (fire-and-forget)
    void pruneExpiredTokens();

    res.json({ ok: true, message: "Login link sent. Check your email." });
  } catch (err) {
    logger.error({ err }, "Error creating magic link");
    res.status(500).json({ error: "Failed to send login link. Please try again." });
  }
});

// ── GET /api/auth/verify ──────────────────────────────────────────────────────

router.get("/auth/verify", async (req, res) => {
  const raw = typeof req.query.token === "string" ? req.query.token : null;

  const errorRedirect = (msg: string) => {
    const url = new URL("/", appUrl());
    url.searchParams.set("auth_error", msg);
    res.redirect(url.toString());
  };

  if (!raw) {
    errorRedirect("missing_token");
    return;
  }

  const tokenHash = hashToken(raw);
  const now = new Date();

  try {
    // Look up token — must exist, not expired, not already used
    const [token] = await db
      .select()
      .from(authTokensTable)
      .where(
        and(
          eq(authTokensTable.tokenHash, tokenHash),
          gt(authTokensTable.expiresAt, now),
        ),
      )
      .limit(1);

    if (!token) {
      errorRedirect("invalid_or_expired");
      return;
    }
    if (token.usedAt) {
      errorRedirect("already_used");
      return;
    }

    // Mark token used (single-use guarantee)
    await db
      .update(authTokensTable)
      .set({ usedAt: now })
      .where(eq(authTokensTable.id, token.id));

    // Create session
    const rawSession = generateToken();
    const sessionHash = hashToken(rawSession);
    const sessionExpires = new Date(Date.now() + SESSION_TTL_MS);

    await db.insert(sessionsTable).values({
      userId:    token.userId,
      tokenHash: sessionHash,
      expiresAt: sessionExpires,
    });

    // Set httpOnly session cookie
    res.cookie(SESSION_COOKIE, rawSession, cookieOptions(req));

    // Redirect to frontend
    res.redirect(appUrl() + "/?auth=success");
  } catch (err) {
    logger.error({ err }, "Error verifying magic link");
    errorRedirect("server_error");
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

router.get("/auth/me", requireAuth, (req, res) => {
  res.json({
    id:          req.user!.id,
    email:       req.user!.email,
    displayName: req.user!.displayName ?? null,
    createdAt:   req.user!.createdAt,
  });
});

// ── PATCH /api/auth/profile ───────────────────────────────────────────────────

router.patch("/auth/profile", requireAuth, async (req, res) => {
  const { displayName } = req.body as { displayName?: string };
  // Sanitise: trim whitespace, cap at 60 chars, treat blank as null (clear)
  const trimmed = typeof displayName === "string"
    ? displayName.trim().slice(0, 60) || null
    : null;

  try {
    const [updated] = await db
      .update(usersTable)
      .set({ displayName: trimmed })
      .where(eq(usersTable.id, req.user!.id))
      .returning({ displayName: usersTable.displayName });

    res.json({ ok: true, displayName: updated.displayName });
  } catch (err) {
    logger.error({ err }, "Error updating profile");
    res.status(500).json({ error: "Failed to update profile. Please try again." });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

router.post("/auth/logout", requireAuth, async (req, res) => {
  try {
    if (req.sessionId) {
      await db.delete(sessionsTable).where(eq(sessionsTable.id, req.sessionId));
    }
  } catch (err) {
    logger.error({ err }, "Error deleting session on logout");
  }

  res.clearCookie(SESSION_COOKIE, { path: "/", httpOnly: true, sameSite: "lax" });
  res.json({ ok: true });
});

// ── DELETE /api/auth/account ──────────────────────────────────────────────────

router.delete("/auth/account", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  try {
    // Cascade: alert_prefs → tracked_items → sessions → auth_tokens → user
    // (FK onDelete cascade handles the child rows; we just delete the user)
    await db.delete(usersTable).where(eq(usersTable.id, userId));

    res.clearCookie(SESSION_COOKIE, { path: "/", httpOnly: true, sameSite: "lax" });
    res.json({ ok: true, message: "Account deleted." });
  } catch (err) {
    logger.error({ err, userId }, "Error deleting account");
    res.status(500).json({ error: "Failed to delete account. Please try again." });
  }
});

export default router;
