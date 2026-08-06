/**
 * AuthModal — passwordless magic-link login dialog.
 *
 * The user enters their email, clicks "Send login link", and receives an
 * email with a one-time link.  Clicking the link logs them in and redirects
 * back here.  No password field, no "forgot password" — it's intentionally
 * out of scope since it doesn't apply to magic-link auth.
 */

import { useState } from "react";
import { Mail, Loader2, CheckCircle2, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function AuthModal() {
  const { loginOpen, setLoginOpen } = useAuth();
  const [email,   setEmail]   = useState("");
  const [state,   setState]   = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errMsg,  setErrMsg]  = useState("");

  if (!loginOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setErrMsg("");

    try {
      const res = await fetch("/api/auth/request-link", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim() }),
        credentials: "include",
      });

      const data = await res.json() as { ok?: boolean; error?: string };

      if (res.ok) {
        setState("sent");
      } else {
        setState("error");
        setErrMsg(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setState("error");
      setErrMsg("Network error. Please check your connection and try again.");
    }
  }

  function close() {
    setLoginOpen(false);
    setState("idle");
    setEmail("");
    setErrMsg("");
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-background shadow-2xl p-8">

        {/* Close */}
        <button
          onClick={close}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Wordmark */}
        <div className="flex items-center gap-2 mb-6">
          <span className="font-display font-bold text-lg">
            <span className="text-foreground">Disc</span>
            <span className="text-primary">Watch</span>
          </span>
          <span className="text-[10px] font-bold tracking-wide text-primary border border-primary/40 bg-primary/10 rounded px-1.5 py-0.5">HQ</span>
        </div>

        {state === "sent" ? (
          /* Success state */
          <div className="text-center py-4">
            <CheckCircle2 size={40} className="text-primary mx-auto mb-4" />
            <h2 className="text-lg font-bold text-foreground mb-2">Check your email</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-1">
              We sent a login link to
            </p>
            <p className="text-sm font-semibold text-foreground mb-4">{email}</p>
            <p className="text-xs text-muted-foreground">
              The link expires in 15 minutes and can only be used once.
            </p>
            <button
              onClick={close}
              className="mt-6 text-xs text-muted-foreground hover:text-foreground underline"
            >
              Done
            </button>
          </div>
        ) : (
          /* Email form */
          <>
            <h2 className="text-xl font-bold text-foreground mb-1">Sign in</h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Enter your email and we'll send you a login link — no password needed.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="auth-email" className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                  Email address
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border bg-secondary/30 text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
                    disabled={state === "loading"}
                  />
                </div>
              </div>

              {state === "error" && (
                <p className="text-xs text-red-400 leading-relaxed">{errMsg}</p>
              )}

              <button
                type="submit"
                disabled={state === "loading" || !email.trim()}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm py-2.5 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {state === "loading" ? (
                  <><Loader2 size={15} className="animate-spin" /> Sending…</>
                ) : (
                  "Send login link"
                )}
              </button>
            </form>

            <p className="text-[11px] text-muted-foreground/60 text-center mt-5 leading-relaxed">
              By signing in you agree to our{" "}
              <a href="/terms"  className="underline hover:text-muted-foreground">Terms</a>
              {" "}and{" "}
              <a href="/privacy" className="underline hover:text-muted-foreground">Privacy Policy</a>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
