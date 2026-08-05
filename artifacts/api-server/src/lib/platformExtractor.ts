/**
 * platformExtractor.ts
 *
 * Parses platform keywords from a boutique release title string.
 *
 * Returns an array of canonical platform names found in the title,
 * or an empty array if no platform can be identified (art cards, vinyl LPs,
 * books, no-game collector items, etc.).
 *
 * Never returns ["Unknown"] — callers that need a fallback must add it themselves.
 *
 * ## Family deduplication
 * When a more-specific platform in a family is matched, the generic family
 * member is suppressed. E.g. "Xbox Series" suppresses "Xbox"; "PS5" suppresses
 * "PlayStation"; "Wii U" suppresses "Wii"; "3DS" suppresses "DS".
 */

interface PlatformRule {
  /** Regex to test against the title (case-insensitive) */
  pattern: RegExp;
  /** Canonical platform name to emit when matched */
  canonical: string;
}

/**
 * Ordered list of platform detection rules.
 * More-specific patterns must come before less-specific ones within the same
 * family — the family-deduplication pass uses this ordering.
 */
const PLATFORM_RULES: PlatformRule[] = [
  // --- Nintendo handhelds ---
  { pattern: /\bGame\s*Boy\s*(?:Color|Colour)\b/i,  canonical: "Game Boy Color" },
  { pattern: /\bGame\s*Boy\s*Advance\b|\bGBA\b/i,   canonical: "GBA" },
  // "Game Boy" only when NOT immediately followed by Color/Colour/Advance
  { pattern: /\bGame\s*Boy(?!\s*(?:Color|Colour|Advance))\b/i, canonical: "Game Boy" },
  { pattern: /\b3DS\b/i,                             canonical: "3DS" },
  // "DS" only when NOT preceded by "3" (avoid matching inside "3DS")
  { pattern: /(?<!3)\bDS\b/i,                        canonical: "DS" },
  // --- Nintendo home consoles ---
  { pattern: /\bSwitch\s*2\b/i,                      canonical: "Switch 2" },
  // "Switch" only when NOT followed by " 2"
  { pattern: /\bNintendo\s*Switch\b|\bSwitch(?!\s*2)\b/i, canonical: "Switch" },
  { pattern: /\bNintendo\s*64\b|\bN64\b/i,           canonical: "N64" },
  { pattern: /\bGameCube\b/i,                        canonical: "GameCube" },
  { pattern: /\bWii\s*U\b/i,                         canonical: "Wii U" },
  // "Wii" only when NOT followed by " U" (already matched above)
  { pattern: /\bWii(?!\s*U)\b/i,                     canonical: "Wii" },
  { pattern: /\bSNES\b|Super\s*Nintendo\b/i,         canonical: "SNES" },
  { pattern: /\bNES\b/i,                             canonical: "NES" },
  // --- PlayStation handhelds (before generic PS rules) ---
  { pattern: /\bPS\s*Vita\b/i,                       canonical: "PS Vita" },
  { pattern: /\bPSP\b/i,                             canonical: "PSP" },
  // --- PlayStation home consoles ---
  { pattern: /\bPS\s*5\b|\bPlayStation\s*5\b/i,      canonical: "PS5" },
  { pattern: /\bPS\s*4\b|\bPlayStation\s*4\b/i,      canonical: "PS4" },
  { pattern: /\bPS\s*3\b|\bPlayStation\s*3\b/i,      canonical: "PS3" },
  // Generic "PlayStation" — only emitted when no specific PS variant was found
  // (handled by family deduplication below, not by the pattern itself)
  { pattern: /\bPlayStation\b/i,                     canonical: "PlayStation" },
  // --- Xbox ---
  { pattern: /\bXbox\s*Series\b/i,                   canonical: "Xbox Series" },
  { pattern: /\bXbox\s*One\b/i,                      canonical: "Xbox One" },
  // Generic Xbox — only emitted when no specific Xbox variant was found
  { pattern: /\bXbox\b/i,                            canonical: "Xbox" },
  // --- Sega ---
  { pattern: /\bMega\s*Drive\b/i,                    canonical: "Mega Drive" },
  { pattern: /\bSega\s*Genesis\b|\bGenesis\b/i,      canonical: "Genesis" },
  { pattern: /\bDreamcast\b/i,                       canonical: "Dreamcast" },
  // --- Other retro ---
  { pattern: /\bNeo\s*Geo\b/i,                       canonical: "Neo Geo" },
  { pattern: /\bAtari\b/i,                           canonical: "Atari" },
  // --- PC ---
  { pattern: /\bPC\b|\bSteam\b|\bWindows\b/i,        canonical: "PC" },
];

/**
 * Within-family deduplication: maps a generic canonical → set of specific
 * canonicals that suppress it.
 *
 * If ANY of the "specific" platforms is present in the found set,
 * the "generic" is removed.
 */
const FAMILY_SUPPRESSION: Record<string, string[]> = {
  "PlayStation": ["PS5", "PS4", "PS3", "PS Vita", "PSP"],
  "Xbox":        ["Xbox Series", "Xbox One"],
  "Wii":         ["Wii U"],
  "Switch":      ["Switch 2"],
  "DS":          ["3DS"],
  "Game Boy":    ["Game Boy Color", "GBA"],
};

/**
 * Extract canonical platform names from a release title.
 *
 * @param title - The release title string to parse.
 * @returns     Deduplicated array of platform names, or [] if none detected.
 */
export function extractPlatformsFromTitle(title: string): string[] {
  const found: string[] = [];

  for (const rule of PLATFORM_RULES) {
    if (rule.pattern.test(title)) {
      if (!found.includes(rule.canonical)) {
        found.push(rule.canonical);
      }
    }
  }

  // Apply family suppression: remove generic entries when a more-specific
  // member of the same family was already matched.
  const suppressed = new Set<string>();
  for (const [generic, specifics] of Object.entries(FAMILY_SUPPRESSION)) {
    if (found.includes(generic) && specifics.some((s) => found.includes(s))) {
      suppressed.add(generic);
    }
  }

  return found.filter((p) => !suppressed.has(p));
}
