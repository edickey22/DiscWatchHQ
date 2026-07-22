/**
 * ProfilePage — user's account page.
 * Shows email, tracked item count, alert count, and account deletion.
 * Requires authentication; redirects to home if not logged in.
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { User, Heart, Bell, Trash2, LogOut, AlertTriangle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function ProfilePage() {
  const { user, loading: authLoading, logout, openLogin } = useAuth();
  const [, navigate] = useLocation();
  const queryClient  = useQueryClient();

  const [deleteState,    setDeleteState]    = useState<"idle" | "confirm" | "deleting">("idle");
  const [deleteError,    setDeleteError]    = useState("");

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
      openLogin();
    }
  }, [authLoading, user, navigate, openLogin]);

  const { data: trackingData } = useQuery({
    queryKey: ["tracking"],
    queryFn: async () => {
      const res = await fetch("/api/tracking", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json() as Promise<{ items: { id: number; itemType: string }[] }>;
    },
    enabled: !!user,
  });

  const { data: alertsData } = useQuery({
    queryKey: ["alerts"],
    queryFn: async () => {
      const res = await fetch("/api/alerts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json() as Promise<{ prefs: unknown[] }>;
    },
    enabled: !!user,
  });

  async function handleDeleteAccount() {
    setDeleteState("deleting");
    setDeleteError("");
    try {
      const res = await fetch("/api/auth/account", {
        method:      "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setDeleteError(data.error ?? "Failed to delete account.");
        setDeleteState("confirm");
        return;
      }
      // Clear all cached data and redirect
      queryClient.clear();
      await logout();
      navigate("/");
    } catch {
      setDeleteError("Network error. Please try again.");
      setDeleteState("confirm");
    }
  }

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  if (authLoading || !user) return null;

  const trackedCount = trackingData?.items.length ?? 0;
  const alertCount   = alertsData?.prefs.length  ?? 0;
  const memberSince  = new Date(user.createdAt).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-2xl px-4 py-10">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
            <User size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Profile</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Heart size={15} />
              <span className="text-xs font-semibold uppercase tracking-wide">Tracked</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{trackedCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {trackedCount === 1 ? "item" : "items"} in your watchlist
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Bell size={15} />
              <span className="text-xs font-semibold uppercase tracking-wide">Alerts</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{alertCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">active email alerts</p>
          </div>
        </div>

        {/* Account info */}
        <div className="rounded-xl border border-border bg-card p-5 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Account</h2>
          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-sm font-medium text-foreground">{user.email}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <span className="text-sm text-muted-foreground">Member since</span>
            <span className="text-sm text-foreground">{memberSince}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-muted-foreground">Auth method</span>
            <span className="text-sm text-foreground">Magic link (passwordless)</span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {/* Sign out */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left hover:border-primary/30 hover:bg-primary/5 transition-all group"
          >
            <LogOut size={18} className="text-muted-foreground group-hover:text-primary transition-colors" />
            <div>
              <p className="text-sm font-medium text-foreground">Sign out</p>
              <p className="text-xs text-muted-foreground">Ends your current session</p>
            </div>
          </button>

          {/* Delete account */}
          {deleteState === "idle" && (
            <button
              onClick={() => setDeleteState("confirm")}
              className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left hover:border-red-500/40 hover:bg-red-500/5 transition-all group"
            >
              <Trash2 size={18} className="text-muted-foreground group-hover:text-red-400 transition-colors" />
              <div>
                <p className="text-sm font-medium text-foreground">Delete account</p>
                <p className="text-xs text-muted-foreground">Permanently removes your account and all tracked data</p>
              </div>
            </button>
          )}

          {(deleteState === "confirm" || deleteState === "deleting") && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Delete your account?</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    This will permanently delete your account, watchlist ({trackedCount} items), and all alert preferences.
                    This cannot be undone.
                  </p>
                </div>
              </div>
              {deleteError && (
                <p className="text-xs text-red-400">{deleteError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { setDeleteState("idle"); setDeleteError(""); }}
                  disabled={deleteState === "deleting"}
                  className="flex-1 rounded-lg border border-border bg-background text-sm font-medium py-2 hover:bg-secondary/30 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteState === "deleting"}
                  className="flex-1 rounded-lg bg-red-600 text-white text-sm font-semibold py-2 hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {deleteState === "deleting" ? "Deleting…" : "Yes, delete everything"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
