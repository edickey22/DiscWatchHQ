/**
 * authMiddleware.ts — session cookie validation and req.user attachment.
 *
 * Session cookie name: "dwsession"
 * Value in cookie:     raw 64-char hex token (32 random bytes)
 * Value in DB:         SHA-256 of the raw token (never the raw token itself)
 */

import { createHash, randomBytes } from "crypto";
import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sessionsTable, usersTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import type { User } from "@workspace/db/schema";

// ── Augment Express Request ────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionId?: number;
    }
  }
}

// ── Cookie helpers ─────────────────────────────────────────────────────────────

export const SESSION_COOKIE = "dwsession";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function cookieOptions(req: Request) {
  return {
    httpOnly: true,
    secure:   req.secure || process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge:   SESSION_TTL_MS,
    path:     "/",
  };
}

// ── Session lookup ────────────────────────────────────────────────────────────

export async function getUserFromCookie(req: Request): Promise<{ user: User; sessionId: number } | null> {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (!raw || typeof raw !== "string") return null;

  const hash = hashToken(raw);
  const now  = new Date();

  const rows = await db
    .select({ session: sessionsTable, user: usersTable })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(
      and(
        eq(sessionsTable.tokenHash, hash),
        gt(sessionsTable.expiresAt, now),
      ),
    )
    .limit(1);

  if (!rows[0]) return null;
  return { user: rows[0].user, sessionId: rows[0].session.id };
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Populates req.user if the session cookie is valid. Does NOT reject the
 * request — routes that require auth should call requireAuth.
 */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const result = await getUserFromCookie(req);
  if (result) {
    req.user      = result.user;
    req.sessionId = result.sessionId;
  }
  next();
}

/**
 * Rejects requests from unauthenticated users with 401.
 * Must be used after loadUser (or it does the lookup itself).
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.user) return next();

  const result = await getUserFromCookie(req);
  if (!result) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.user      = result.user;
  req.sessionId = result.sessionId;
  next();
}
