/**
 * ProfilePage — user's account page.
 * Shows email, display name (editable), tracked item count, alert count, and account deletion.
 * Requires authentication; redirects to home if not logged in.
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Bell, Trash2, LogOut, AlertTriangle, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Header } from "@/components/Header";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { PRESET_AVATARS, INITIALS_AVATAR } from "@/lib/avatars";

export default function ProfilePage() {
  const { user, loading: authLoading, logout, openLogin, refresh } = useAuth();
  const [, navigate]     = useLocation();
  const queryClient      = useQueryClient();

  const [deleteState, setDeleteState] = useState<"idle" | "confirm" | "deleting">("idle");
  const [deleteError, setDeleteError] = useState("");

  // ── Avatar ────────────────────────────────────────────────────────────────
  const [avatarSaving, setAvatarSaving] = useState(false);

  async function saveAvatar(id: string | null) {
    setAvatarSaving(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ avatarId: id }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        toast.error(data.error ?? "Failed to save avatar.");
        return;
      }
      await refresh();
      toast("Avatar updated");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setAvatarSaving(false);
    }
  }

  // ── Display name editing ──────────────────────────────────────────────────
  const [editingName,  setEditingName]  = useState(false);
  const [nameValue,    setNameValue]    = useState("");
  const [nameSaving,   setNameSaving]   = useState(false);

  // Sync input with current user value when it loads / changes
  useEffect(() => {
    if (user) setNameValue(user.displayName ?? "");
  }, [user?.displayName]);

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

  async function saveName() {
    setNameSaving(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ displayName: nameValue }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        toast.error(data.error ?? "Failed to save name.");
        return;
      }
      await refresh();   // re-fetches /api/auth/me so header updates too
      setEditingName(false);
      toast("Display name saved");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setNameSaving(false);
    }
  }

  function cancelNameEdit() {
    setNameValue(user?.displayName ?? "");
    setEditingName(false);
  }

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
      <Header />
      <div className="container mx-auto max-w-2xl px-4 py-10">

        {/* Page header */}
        <div className="flex items-center gap-3 mb-8">
          <AvatarDisplay size="lg" avatarId={user.avatarId} displayName={user.displayName} email={user.email} />
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Profile</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>

        {/* Avatar picker */}
        <div className="rounded-xl border border-border bg-card p-5 mb-6">
          <h2 className="text-sm font-semibold text-foreground mb-1">Avatar</h2>
          <p className="text-xs text-muted-foreground mb-4">Choose an icon to represent your account</p>
          <div className="grid grid-cols-5 gap-3">

            {/* ── Initials avatar (first slot — user's own initials) ───────── */}
            {(() => {
              const isSelected = user.avatarId === INITIALS_AVATAR.id;
              return (
                <button
                  key={INITIALS_AVATAR.id}
                  onClick={() => void saveAvatar(INITIALS_AVATAR.id)}
                  disabled={avatarSaving}
                  title={INITIALS_AVATAR.label}
                  aria-label="Select Initials avatar"
                  aria-pressed={isSelected}
                  className={`relative flex flex-col items-center gap-1.5 rounded-xl p-2 transition-all disabled:opacity-60 ${
                    isSelected
                      ? "ring-2 ring-primary bg-primary/10"
                      : "hover:bg-secondary/40 hover:ring-1 hover:ring-border"
                  }`}
                >
                  <AvatarDisplay
                    size="xl"
                    avatarId={INITIALS_AVATAR.id}
                    displayName={user.displayName}
                    email={user.email}
                    className={isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""}
                  />
                  <span className="text-[10px] text-muted-foreground leading-tight text-center">
                    Initials
                  </span>
                  {isSelected && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <Check size={9} className="text-background" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })()}

            {/* ── Icon-based presets ──────────────────────────────────────── */}
            {PRESET_AVATARS.map((avatar) => {
              const isSelected = user.avatarId === avatar.id;
              return (
                <button
                  key={avatar.id}
                  onClick={() => void saveAvatar(avatar.id)}
                  disabled={avatarSaving}
                  title={avatar.label}
                  aria-label={`Select ${avatar.label} avatar`}
                  aria-pressed={isSelected}
                  className={`relative flex flex-col items-center gap-1.5 rounded-xl p-2 transition-all disabled:opacity-60 ${
                    isSelected
                      ? "ring-2 ring-primary bg-primary/10"
                      : "hover:bg-secondary/40 hover:ring-1 hover:ring-border"
                  }`}
                >
                  <AvatarDisplay
                    size="xl"
                    avatarId={avatar.id}
                    className={isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""}
                  />
                  <span className="text-[10px] text-muted-foreground leading-tight text-center">
                    {avatar.label}
                  </span>
                  {isSelected && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <Check size={9} className="text-background" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
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
        <div className="rounded-xl border border-border bg-card p-5 mb-6 space-y-1">
          <h2 className="text-sm font-semibold text-foreground mb-3">Account</h2>

          {/* Display name — editable */}
          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <span className="text-sm text-muted-foreground">Display name</span>
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")  void saveName();
                    if (e.key === "Escape") cancelNameEdit();
                  }}
                  maxLength={60}
                  placeholder="Your name"
                  className="w-36 sm:w-48 rounded-md border border-border bg-background px-2.5 py-1 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/60"
                />
                <button
                  onClick={() => void saveName()}
                  disabled={nameSaving}
                  aria-label="Save display name"
                  className="p-1.5 rounded-md text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                >
                  <Check size={15} />
                </button>
                <button
                  onClick={cancelNameEdit}
                  disabled={nameSaving}
                  aria-label="Cancel"
                  className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50"
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {user.displayName ?? <span className="text-muted-foreground/60 italic">Not set</span>}
                </span>
                <button
                  onClick={() => setEditingName(true)}
                  aria-label="Edit display name"
                  className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  <Pencil size={13} />
                </button>
              </div>
            )}
          </div>

          {/* Email */}
          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-sm font-medium text-foreground">{user.email}</span>
          </div>

          {/* Member since */}
          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <span className="text-sm text-muted-foreground">Member since</span>
            <span className="text-sm text-foreground">{memberSince}</span>
          </div>

          {/* Auth method */}
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
