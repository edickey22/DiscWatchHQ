/**
 * TrackButton — heart/bookmark toggle for adding items to the user's watchlist.
 *
 * Renders a small heart icon button.  When the user is not logged in, clicking
 * opens the auth modal instead.  When logged in, it toggles the tracked state
 * with optimistic UI and syncs to the API.
 *
 * Usage:
 *   <TrackButton
 *     itemType="release"
 *     itemId="42"
 *     itemData={{ title: "Hollow Knight", image: "...", ... }}
 *   />
 */

import { useState, useEffect, useCallback } from "react";
import { Heart } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ItemType = "game" | "release" | "console";

export interface TrackButtonProps {
  itemType: ItemType;
  itemId:   string;
  itemData: Record<string, unknown>;
  /** Optional: if caller already knows the tracked state, provide it to skip the status fetch. */
  initialTracked?: boolean;
  className?: string;
  size?: number;
}

// ── Hook: useTrackedState ─────────────────────────────────────────────────────
// Manages the tracked state for a single item, handling async toggle and
// auth-gating. Shared by TrackButton and any other UI that needs this state.

export function useTrackedState(itemType: ItemType, itemId: string, initialTracked?: boolean) {
  const { user, openLogin } = useAuth();
  const [tracked,  setTracked]  = useState(initialTracked ?? false);
  const [loading,  setLoading]  = useState(false);
  const [trackedId, setTrackedId] = useState<number | null>(null);

  // Fetch actual state when user logs in (or on mount if already logged in)
  useEffect(() => {
    if (!user || initialTracked !== undefined) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(
          `/api/tracking/status?type=${itemType}&ids=${encodeURIComponent(itemId)}`,
          { credentials: "include" },
        );
        if (!res.ok || cancelled) return;
        const data = await res.json() as { tracked: string[] };
        if (!cancelled) setTracked(data.tracked.includes(itemId));
      } catch { /* ignore */ }
    })();

    return () => { cancelled = true; };
  }, [user, itemType, itemId, initialTracked]);

  const toggle = useCallback(async (itemData: Record<string, unknown>) => {
    if (!user) {
      openLogin();
      return;
    }
    if (loading) return;

    setLoading(true);
    const wasTracked = tracked;

    // Optimistic update
    setTracked(!wasTracked);

    try {
      if (wasTracked && trackedId) {
        const res = await fetch(`/api/tracking/${trackedId}`, {
          method:      "DELETE",
          credentials: "include",
        });
        if (!res.ok) setTracked(wasTracked); // revert on failure
        else setTrackedId(null);
      } else if (wasTracked && !trackedId) {
        // We know it's tracked but don't have the ID yet — fetch it
        const res = await fetch(
          `/api/tracking/status?type=${itemType}&ids=${encodeURIComponent(itemId)}`,
          { credentials: "include" },
        );
        if (res.ok) {
          const list = await fetch("/api/tracking", { credentials: "include" });
          if (list.ok) {
            const { items } = await list.json() as { items: { id: number; itemType: string; itemId: string }[] };
            const found = items.find((i) => i.itemType === itemType && i.itemId === itemId);
            if (found) {
              await fetch(`/api/tracking/${found.id}`, {
                method: "DELETE", credentials: "include",
              });
              setTracked(false);
            }
          }
        }
      } else {
        const res = await fetch("/api/tracking", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ itemType, itemId, itemData }),
        });
        if (res.ok) {
          const { item } = await res.json() as { item: { id: number } };
          setTrackedId(item.id);
          setTracked(true);
        } else {
          setTracked(wasTracked);
        }
      }
    } catch {
      setTracked(wasTracked);
    } finally {
      setLoading(false);
    }
  }, [user, openLogin, loading, tracked, trackedId, itemType, itemId]);

  return { tracked, loading, toggle };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TrackButton({
  itemType, itemId, itemData, initialTracked, className = "", size = 16,
}: TrackButtonProps) {
  const { tracked, loading, toggle } = useTrackedState(itemType, itemId, initialTracked);

  return (
    <button
      type="button"
      title={tracked ? "Remove from watchlist" : "Add to watchlist"}
      aria-label={tracked ? "Remove from watchlist" : "Add to watchlist"}
      aria-pressed={tracked}
      disabled={loading}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggle(itemData);
      }}
      className={`
        inline-flex items-center justify-center rounded-full transition-all
        ${tracked
          ? "text-red-500 bg-red-500/10 hover:bg-red-500/20"
          : "text-white/80 bg-black/40 hover:text-red-400 hover:bg-red-500/10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
        }
        ${loading ? "opacity-50 cursor-wait" : "cursor-pointer"}
        w-8 h-8
        ${className}
      `}
    >
      <Heart
        size={size}
        className={`transition-transform ${tracked ? "scale-110" : "scale-100"}`}
        fill={tracked ? "currentColor" : "none"}
      />
    </button>
  );
}
