/**
 * AvatarDisplay — renders a user's preset avatar, the "initials" avatar,
 * or falls back to initials-from-email / generic User icon when nothing
 * has been selected yet.
 *
 * Sizes:
 *   xs  = 20 px  (header trigger button)
 *   sm  = 28 px
 *   md  = 40 px
 *   lg  = 48 px  (profile page header)
 *   xl  = 56 px  (profile picker grid)
 */

import { User } from "lucide-react";
import { findAvatar, INITIALS_AVATAR } from "@/lib/avatars";

interface AvatarDisplayProps {
  avatarId?:    string | null
  displayName?: string | null
  /** Used when avatarId="initials" and no displayName is set — falls back to email username initials. */
  email?:       string | null
  /** xs=20px (header) · sm=28px · md=40px · lg=48px · xl=56px */
  size?:        "xs" | "sm" | "md" | "lg" | "xl"
  className?:   string
}

const SIZE_MAP = {
  xs: { cls: "w-5 h-5",   iconPx: 10, textCls: "text-[7px]"  },
  sm: { cls: "w-7 h-7",   iconPx: 13, textCls: "text-[9px]"  },
  md: { cls: "w-10 h-10", iconPx: 17, textCls: "text-xs"     },
  lg: { cls: "w-12 h-12", iconPx: 20, textCls: "text-sm"     },
  xl: { cls: "w-14 h-14", iconPx: 24, textCls: "text-base"   },
} as const;

function getInitials(name: string | null | undefined): string {
  if (!name?.trim()) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] ?? "").toUpperCase();
  return ((parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "")).toUpperCase();
}

function getEmailInitials(email: string | null | undefined): string {
  if (!email) return "";
  const username = email.split("@")[0];
  const parts = username.split(/[._-]/);
  if (parts.length >= 2) return ((parts[0][0] ?? "") + (parts[1][0] ?? "")).toUpperCase();
  return (username[0] ?? "").toUpperCase();
}

export function AvatarDisplay({
  avatarId,
  displayName,
  email,
  size = "md",
  className = "",
}: AvatarDisplayProps) {
  const { cls, iconPx, textCls } = SIZE_MAP[size];

  // ── Explicitly-chosen "initials" avatar ───────────────────────────────────
  if (avatarId === "initials") {
    const initials =
      getInitials(displayName) ||
      getEmailInitials(email)  ||
      "?";
    return (
      <div
        className={`${cls} rounded-full flex items-center justify-center font-bold text-white shrink-0 leading-none ${textCls} ${className}`}
        style={{ backgroundColor: INITIALS_AVATAR.bg }}
      >
        {initials}
      </div>
    );
  }

  // ── Icon-based preset avatar ──────────────────────────────────────────────
  const preset = findAvatar(avatarId);
  if (preset) {
    const { Icon, bg, label } = preset;
    return (
      <div
        aria-label={label}
        className={`${cls} rounded-full flex items-center justify-center shrink-0 ${className}`}
        style={{ backgroundColor: bg }}
      >
        <Icon size={iconPx} className="text-white" strokeWidth={2} />
      </div>
    );
  }

  // ── Fallbacks (no avatar chosen yet) ─────────────────────────────────────
  const initials = getInitials(displayName) || getEmailInitials(email);
  if (initials) {
    return (
      <div
        className={`${cls} rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center font-bold text-primary shrink-0 leading-none ${textCls} ${className}`}
      >
        {initials}
      </div>
    );
  }

  return (
    <div
      className={`${cls} rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0 ${className}`}
    >
      <User size={iconPx} className="text-primary" />
    </div>
  );
}
