/**
 * avatars.ts — Preset avatar definitions for the DiscWatchHQ profile picker.
 *
 * Each avatar is a Lucide icon inside a colored circle. Background colors are
 * intentionally varied (not all green) so users can distinguish their selection
 * at a glance. Icons are chosen for gaming/collector theme.
 */

import {
  Gamepad2, Disc3, Trophy, Star, Zap,
  Shield, Cpu, Crosshair, Gem, Rocket,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface PresetAvatar {
  id:    string
  label: string
  Icon:  LucideIcon
  /** Hex background color for the avatar circle. */
  bg:    string
}

export const PRESET_AVATARS: PresetAvatar[] = [
  { id: "gamepad",   label: "Controller", Icon: Gamepad2,   bg: "#14532d" }, // deep green
  { id: "disc",      label: "Disc",       Icon: Disc3,      bg: "#1e3a8a" }, // deep blue
  { id: "trophy",    label: "Trophy",     Icon: Trophy,     bg: "#78350f" }, // amber
  { id: "star",      label: "Star",       Icon: Star,       bg: "#4c1d95" }, // deep purple
  { id: "zap",       label: "Power Up",   Icon: Zap,        bg: "#155e75" }, // dark cyan
  { id: "shield",    label: "Shield",     Icon: Shield,     bg: "#881337" }, // dark rose
  { id: "cpu",       label: "Chip",       Icon: Cpu,        bg: "#064e3b" }, // dark emerald
  { id: "crosshair", label: "Aim",        Icon: Crosshair,  bg: "#581c87" }, // dark violet
  { id: "gem",       label: "Gem",        Icon: Gem,        bg: "#7c2d12" }, // dark orange
  { id: "rocket",    label: "Rocket",     Icon: Rocket,     bg: "#831843" }, // dark pink
];

export function findAvatar(id: string | null | undefined): PresetAvatar | undefined {
  if (!id) return undefined;
  return PRESET_AVATARS.find((a) => a.id === id);
}
