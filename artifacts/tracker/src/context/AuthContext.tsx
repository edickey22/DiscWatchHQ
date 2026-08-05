/**
 * AuthContext — provides current user state to the entire React tree.
 *
 * On mount, calls GET /api/auth/me to restore the session from the httpOnly
 * cookie.  Exposes login helpers (openLogin, logout) so any component can
 * trigger the auth flow without prop-drilling.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id:          number;
  email:       string;
  displayName: string | null;
  createdAt:   string;
}

interface AuthContextValue {
  user:        AuthUser | null;
  loading:     boolean;
  /** Trigger the login modal to open. */
  openLogin:   () => void;
  /** Sign out and clear session. */
  logout:      () => Promise<void>;
  /** Re-fetch /api/auth/me (call after successful login redirect). */
  refresh:     () => Promise<void>;
  /** Internal: controls whether the login modal is shown. */
  loginOpen:   boolean;
  setLoginOpen:(open: boolean) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<AuthUser | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json() as AuthUser;
        setUser(data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Check for ?auth=success in the URL (redirect back from magic-link verify)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "success") {
      // Clean the URL without reloading
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
    }
    void fetchMe();
  }, [fetchMe]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch { /* ignore */ }
    setUser(null);
  }, []);

  const openLogin = useCallback(() => setLoginOpen(true), []);

  return (
    <AuthContext.Provider value={{
      user, loading, openLogin, logout, refresh: fetchMe,
      loginOpen, setLoginOpen,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
