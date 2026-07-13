/**
 * Curated console model list for the "Consoles" section — spans generations
 * to match the site's "every platform, every era" positioning.
 *
 * `query` is tuned per model for the eBay Browse API search (category
 * already scopes results to Video Game Consoles, so queries stay short;
 * `-` exclusions disambiguate models with overlapping names).
 */

export type ConsoleGeneration = "current" | "previous" | "retro";

export interface ConsoleModel {
  id:         string;
  name:       string;
  generation: ConsoleGeneration;
  query:      string;
  /**
   * At least one of these substrings (case-insensitive, word-boundary
   * aware) must appear in a listing's title for it to count as this model
   * — list acceptable phrasing variants of the same model name (e.g.
   * "5 pro" / "5pro"), not unrelated required facts. Query `-"term"`
   * exclusions alone aren't reliable — eBay's relevance search still
   * surfaces semantically-related sibling models (a "Series X" search
   * returning "Series S", a "Switch 2" search returning the original
   * Switch) — this is a second, server-side gate applied after the fetch.
   */
  requireTerms?: string[];
  /**
   * Case-insensitive substrings that disqualify a listing even if it
   * otherwise matches — for sibling models sharing most keywords (a real
   * PS5 Pro listing will never say "PS4" or "Slim").
   */
  excludeTerms?: string[];
}

export const CONSOLE_MODELS: ConsoleModel[] = [
  // ── Current-gen ──────────────────────────────────────────────────────────
  { id: "switch-2",      name: "Nintendo Switch 2",     generation: "current", query: "Nintendo Switch 2 console -OLED -Lite -HAC-001 -\"V2\"",
    requireTerms: ["switch 2"], excludeTerms: ["oled", "lite"] },
  { id: "ps5-pro",       name: "PlayStation 5 Pro",     generation: "current", query: "PlayStation 5 Pro console -\"PS4\" -\"PS3\" -Slim",
    // Bare "pro" alone is unsafe — regular PS5 listings bundled with a "Pro"
    // branded accessory (e.g. a "PS Nova Pro" headset) contain the word
    // "pro" without being an actual PS5 Pro console. Require the digit and
    // "pro" adjacent ("5 Pro"/"5Pro") so only the real model name matches.
    requireTerms: ["5 pro", "5pro"], excludeTerms: ["ps4", "playstation 4", "ps3", "slim"] },
  { id: "ps5",          name: "PlayStation 5",         generation: "current", query: "PlayStation 5 console -Vita -\"PS4\" -\"PS3\" -\"PS2\" -\"PS1\"",
    excludeTerms: ["vita", "ps4", "playstation 4", "ps3", "ps2", "ps1"] },
  { id: "xbox-series-x", name: "Xbox Series X",        generation: "current", query: "Xbox Series X console -\"Series S\"",
    requireTerms: ["series x"], excludeTerms: ["series s"] },
  { id: "xbox-series-s", name: "Xbox Series S",        generation: "current", query: "Xbox Series S console -\"Series X\"",
    requireTerms: ["series s"], excludeTerms: ["series x"] },
  { id: "switch-oled",  name: "Nintendo Switch OLED",  generation: "current", query: "Nintendo Switch OLED console -Lite -\"Switch 2\"",
    requireTerms: ["oled"], excludeTerms: ["lite", "switch 2"] },
  { id: "switch-lite",  name: "Nintendo Switch Lite",  generation: "current", query: "Nintendo Switch Lite console -OLED -\"Switch 2\"",
    requireTerms: ["lite"], excludeTerms: ["oled", "switch 2"] },
  { id: "steam-deck",   name: "Steam Deck",            generation: "current", query: "Steam Deck console" },

  // ── Previous-gen ─────────────────────────────────────────────────────────
  { id: "ps4",          name: "PlayStation 4",         generation: "previous", query: "PlayStation 4 console -\"PS5\" -\"PS3\"",
    excludeTerms: ["ps5", "playstation 5", "ps3"] },
  { id: "xbox-one",     name: "Xbox One",              generation: "previous", query: "Xbox One console -\"Series\"",
    excludeTerms: ["series x", "series s"] },
  { id: "switch",       name: "Nintendo Switch",       generation: "previous", query: "Nintendo Switch console -OLED -Lite -\"Switch 2\"",
    excludeTerms: ["oled", "lite", "switch 2"] },

  // ── Retro ────────────────────────────────────────────────────────────────
  { id: "n64",          name: "Nintendo 64",           generation: "retro", query: "Nintendo 64 console" },
  { id: "snes",         name: "Super Nintendo",        generation: "retro", query: "Super Nintendo SNES console" },
  { id: "genesis",      name: "Sega Genesis",          generation: "retro", query: "Sega Genesis console" },
  { id: "dreamcast",    name: "Sega Dreamcast",        generation: "retro", query: "Sega Dreamcast console" },
  { id: "gamecube",     name: "Nintendo GameCube",     generation: "retro", query: "Nintendo GameCube console" },
  { id: "wii",          name: "Nintendo Wii",          generation: "retro", query: "Nintendo Wii console -\"Wii U\"",
    excludeTerms: ["wii u"] },
  { id: "wii-u",        name: "Wii U",                 generation: "retro", query: "Nintendo Wii U console",
    requireTerms: ["wii u"] },
  { id: "ps1",          name: "PlayStation",           generation: "retro", query: "Sony PlayStation PS1 console -\"PS2\" -\"PS3\"",
    excludeTerms: ["ps2", "ps3", "ps4", "ps5"] },
  { id: "ps2",          name: "PlayStation 2",         generation: "retro", query: "PlayStation 2 console -\"PS3\"",
    requireTerms: ["2"], excludeTerms: ["ps3", "ps4", "ps5"] },
  { id: "ps3",          name: "PlayStation 3",         generation: "retro", query: "PlayStation 3 console -\"PS4\"",
    requireTerms: ["3"], excludeTerms: ["ps4", "ps5"] },
  { id: "xbox-360",     name: "Xbox 360",              generation: "retro", query: "Xbox 360 console",
    requireTerms: ["360"] },
  { id: "xbox",         name: "Xbox",                  generation: "retro", query: "Microsoft Xbox console -360 -\"Series\" -\"One\"",
    excludeTerms: ["360", "series x", "series s", "xbox one"] },
  { id: "gba",          name: "Game Boy Advance",      generation: "retro", query: "Game Boy Advance console" },
  { id: "3ds",          name: "Nintendo 3DS",          generation: "retro", query: "Nintendo 3DS console" },
  { id: "ds",           name: "Nintendo DS",           generation: "retro", query: "Nintendo DS console -3DS",
    excludeTerms: ["3ds"] },
];
