/**
 * TrackingPage — "My Watchlist" — shows everything the logged-in user
 * has saved across Browse Games, Boutique Tracker, and Consoles.
 * Requires authentication; redirects to home with login modal open if not.
 *
 * Alert types per content type:
 *   release  → Bell (status_change)  + DollarSign (price_drop on eBay resale price)
 *   game     → Bell (price_drop via Best Buy / Amazon — no-ops until API key added)
 *   console  → Bell (price_drop via eBay BIN listings)
 */

import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Heart, Gamepad2, Package, Monitor,
  Trash2, Bell, BellOff, Tag, ArrowDownToLine,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrackedItem {
  id:       number;
  userId:   number;
  itemType: "game" | "release" | "console";
  itemId:   string;
  itemData: {
    title?:         string;
    image?:         string;
    coverImageUrl?: string;
    publisher?:     string;
    status?:        string;
    platforms?:     string[];
  };
  createdAt: string;
}

interface AlertEntry {
  id:            number;
  alertType:     string;
  enabled:       boolean;
  lastNotifiedAt?: string;
}

interface AlertPref {
  alert: AlertEntry;
  item:  TrackedItem;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_ICONS = {
  game:    <Gamepad2 size={14} />,
  release: <Package  size={14} />,
  console: <Monitor  size={14} />,
};

const TYPE_LABELS = {
  game:    "Browse Games",
  release: "Boutique",
  console: "Consoles",
};

const TYPE_LINKS: Record<string, (itemId: string) => string> = {
  game:    (id) => `/games?q=${encodeURIComponent(id)}`,
  release: (_id) => `/boutique`,
  console: (id) => `/consoles/${id}`,
};

function itemImage(item: TrackedItem): string | undefined {
  return item.itemData.image ?? item.itemData.coverImageUrl;
}

function itemTitle(item: TrackedItem): string {
  return item.itemData.title ?? "Untitled";
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TrackingPage() {
  const { user, loading: authLoading, openLogin } = useAuth();
  const [, navigate] = useLocation();
  const queryClient  = useQueryClient();

  // Redirect unauthenticated users
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
      openLogin();
    }
  }, [authLoading, user, navigate, openLogin]);

  const { data: trackingData, isLoading } = useQuery({
    queryKey: ["tracking"],
    queryFn: async () => {
      const res = await fetch("/api/tracking", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json() as Promise<{ items: TrackedItem[] }>;
    },
    enabled: !!user,
  });

  const { data: alertsData } = useQuery({
    queryKey: ["alerts"],
    queryFn: async () => {
      const res = await fetch("/api/alerts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json() as Promise<{ prefs: AlertPref[] }>;
    },
    enabled: !!user,
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tracking/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tracking"] });
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  const toggleAlertMutation = useMutation({
    mutationFn: async ({
      trackedItemId,
      itemData,
      alertType,
      existingAlertId,
      currentEnabled,
    }: {
      trackedItemId:    number;
      itemData:         TrackedItem["itemData"];
      alertType:        "status_change" | "price_drop" | "price_drop_low";
      existingAlertId?: number;
      currentEnabled?:  boolean;
    }) => {
      if (existingAlertId !== undefined) {
        // Toggle enabled state on existing pref
        await fetch(`/api/alerts/${existingAlertId}`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ enabled: !currentEnabled }),
        });
      } else {
        // Create new pref.
        // status_change → store current status as baseline so first change fires.
        // price_drop    → omit baseline; checker auto-initialises on its first run
        //                 (records current price, skips notify, fires on ≥10% drop).
        const baselineValue =
          alertType === "status_change" ? (itemData.status ?? "unknown") : undefined;
        await fetch("/api/alerts", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ trackedItemId, alertType, baselineValue }),
        });
      }
    },
    onSuccess: (_, variables) => {
      // Toast for mobile/touch where hover tooltips don't exist.
      const nowEnabled =
        variables.existingAlertId !== undefined
          ? !variables.currentEnabled   // toggled existing
          : true;                       // newly created → enabled

      const labels: Record<string, string> = {
        status_change:  "Restock / status alerts",
        price_drop:     "Price-drop alerts",
        price_drop_low: "30-day low alerts",
      };
      const label = labels[variables.alertType] ?? "Alert";
      toast(nowEnabled ? `${label} on` : `${label} off`, {
        description: nowEnabled ? "We'll email you when this triggers." : "You won't be notified.",
        duration: 2500,
      });

      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  if (authLoading || !user) return null;

  const items = trackingData?.items ?? [];

  // Build three alert maps keyed by trackedItem.id — one per alert type.
  // Releases can have all three simultaneously.
  const statusAlertMap   = new Map<number, AlertEntry>();
  const priceAlertMap    = new Map<number, AlertEntry>();
  const priceLowAlertMap = new Map<number, AlertEntry>();
  for (const p of (alertsData?.prefs ?? [])) {
    if (p.alert.alertType === "status_change" || p.alert.alertType === "restock") {
      statusAlertMap.set(p.item.id, p.alert);
    } else if (p.alert.alertType === "price_drop") {
      priceAlertMap.set(p.item.id, p.alert);
    } else if (p.alert.alertType === "price_drop_low") {
      priceLowAlertMap.set(p.item.id, p.alert);
    }
  }

  const grouped = {
    game:    items.filter((i) => i.itemType === "game"),
    release: items.filter((i) => i.itemType === "release"),
    console: items.filter((i) => i.itemType === "console"),
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-10">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Heart size={24} className="text-primary" fill="currentColor" />
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">My Watchlist</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {items.length === 0
                ? "Nothing tracked yet"
                : `${items.length} item${items.length === 1 ? "" : "s"} tracked`}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-20 rounded-xl bg-secondary/30 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Heart size={48} className="text-muted-foreground/30 mb-4" />
            <p className="text-lg font-semibold text-foreground mb-2">Nothing saved yet</p>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              Hit the heart icon on any game, boutique release, or console to save it here.
            </p>
            <div className="flex gap-3 flex-wrap justify-center">
              <Link href="/games"    className="rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-medium px-4 py-2 hover:bg-primary/20 transition-colors">Browse Games</Link>
              <Link href="/boutique" className="rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-medium px-4 py-2 hover:bg-primary/20 transition-colors">Boutique</Link>
              <Link href="/consoles" className="rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-medium px-4 py-2 hover:bg-primary/20 transition-colors">Consoles</Link>
            </div>
          </div>
        ) : (
          /* Item list, grouped by type */
          <div className="space-y-8">
            {(["release", "game", "console"] as const).map((type) => {
              const typeItems = grouped[type];
              if (typeItems.length === 0) return null;
              return (
                <section key={type}>
                  <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                    {TYPE_ICONS[type]}
                    {TYPE_LABELS[type]}
                    <span className="text-primary/70 font-bold">{typeItems.length}</span>
                  </h2>
                  <div className="space-y-2">
                    {typeItems.map((item) => {
                      const img          = itemImage(item);
                      const title        = itemTitle(item);
                      const statusAlert  = statusAlertMap.get(item.id);
                      const priceAlert   = priceAlertMap.get(item.id);
                      const priceLowAlert = priceLowAlertMap.get(item.id);

                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-4 rounded-xl border border-border bg-card p-3 hover:border-primary/30 transition-colors group"
                        >
                          {/* Thumbnail */}
                          <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-secondary/50 flex items-center justify-center">
                            {img ? (
                              <img src={img} alt={title} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-muted-foreground/40">{TYPE_ICONS[type]}</span>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <Link
                              href={TYPE_LINKS[type](item.itemId)}
                              className="font-semibold text-sm text-foreground hover:text-primary transition-colors truncate block"
                            >
                              {title}
                            </Link>
                            <div className="flex items-center gap-2 mt-0.5">
                              {item.itemData.publisher && (
                                <span className="text-xs text-muted-foreground">{item.itemData.publisher as string}</span>
                              )}
                              {item.itemData.status && (
                                <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                                  item.itemData.status === "in_stock"    ? "bg-primary/20 text-primary" :
                                  item.itemData.status === "coming_soon" ? "bg-yellow-500/20 text-yellow-400" :
                                  "bg-muted/40 text-muted-foreground"
                                }`}>
                                  {(item.itemData.status as string).replace("_", " ")}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1.5 shrink-0">

                            {/* ── Status / restock bell — releases only ───── */}
                            {item.itemType === "release" && (() => {
                              const on = statusAlert?.enabled;
                              const label = on
                                ? "Turn off restock & status alerts"
                                : "Alert me when status changes (restock, sold out, etc.)";
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      aria-label={label}
                                      onClick={() => toggleAlertMutation.mutate({
                                        trackedItemId:   item.id,
                                        itemData:        item.itemData,
                                        alertType:       "status_change",
                                        existingAlertId: statusAlert?.id,
                                        currentEnabled:  statusAlert?.enabled,
                                      })}
                                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                                        on
                                          ? "text-primary bg-primary/10 hover:bg-primary/20"
                                          : "text-muted-foreground bg-secondary/40 hover:bg-primary/10 hover:text-primary"
                                      }`}
                                    >
                                      {on ? <Bell size={14} /> : <BellOff size={14} />}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">{label}</TooltipContent>
                                </Tooltip>
                              );
                            })()}

                            {/* ── 30-day eBay low alert — releases only ────── */}
                            {item.itemType === "release" && (() => {
                              const on = priceLowAlert?.enabled;
                              const label = on
                                ? "Turn off 30-day low alert"
                                : "Alert me when resale hits a new 30-day eBay low";
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      aria-label={label}
                                      onClick={() => toggleAlertMutation.mutate({
                                        trackedItemId:   item.id,
                                        itemData:        item.itemData,
                                        alertType:       "price_drop_low",
                                        existingAlertId: priceLowAlert?.id,
                                        currentEnabled:  priceLowAlert?.enabled,
                                      })}
                                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                                        on
                                          ? "text-primary bg-primary/10 hover:bg-primary/20"
                                          : "text-muted-foreground bg-secondary/40 hover:bg-primary/10 hover:text-primary"
                                      }`}
                                    >
                                      {/* ArrowDownToLine = "new floor" is more legible than
                                          TrendingDown which could mean general price direction */}
                                      <ArrowDownToLine size={14} />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">{label}</TooltipContent>
                                </Tooltip>
                              );
                            })()}

                            {/* ── Price-drop toggle ──────────────────────────
                                Releases: Tag icon (price tag → price alert).
                                Games / consoles: Bell/BellOff (single alert type). */}
                            {(() => {
                              const on = priceAlert?.enabled;
                              const label = on
                                ? "Turn off price-drop alert"
                                : item.itemType === "release"
                                  ? "Alert me when eBay resale price drops ≥10%"
                                  : "Alert me when price drops ≥10%";
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      aria-label={label}
                                      onClick={() => toggleAlertMutation.mutate({
                                        trackedItemId:   item.id,
                                        itemData:        item.itemData,
                                        alertType:       "price_drop",
                                        existingAlertId: priceAlert?.id,
                                        currentEnabled:  priceAlert?.enabled,
                                      })}
                                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                                        on
                                          ? "text-primary bg-primary/10 hover:bg-primary/20"
                                          : "text-muted-foreground bg-secondary/40 hover:bg-primary/10 hover:text-primary"
                                      }`}
                                    >
                                      {item.itemType === "release"
                                        ? <Tag size={14} />           /* price tag = price alert */
                                        : on
                                          ? <Bell size={14} />
                                          : <BellOff size={14} />
                                      }
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">{label}</TooltipContent>
                                </Tooltip>
                              );
                            })()}

                            {/* ── Remove from watchlist ─────────────────────── */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  aria-label="Remove from watchlist"
                                  onClick={() => {
                                    removeMutation.mutate(item.id);
                                    toast("Removed from watchlist", { duration: 2000 });
                                  }}
                                  disabled={removeMutation.isPending}
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">Remove from watchlist</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
