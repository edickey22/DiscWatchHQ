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
}

export const CONSOLE_MODELS: ConsoleModel[] = [
  // ── Current-gen ──────────────────────────────────────────────────────────
  { id: "ps5",          name: "PlayStation 5",         generation: "current", query: "PlayStation 5 console" },
  { id: "xbox-series-x", name: "Xbox Series X",        generation: "current", query: "Xbox Series X console" },
  { id: "xbox-series-s", name: "Xbox Series S",        generation: "current", query: "Xbox Series S console" },
  { id: "switch-oled",  name: "Nintendo Switch OLED",  generation: "current", query: "Nintendo Switch OLED console" },
  { id: "switch-lite",  name: "Nintendo Switch Lite",  generation: "current", query: "Nintendo Switch Lite console" },
  { id: "steam-deck",   name: "Steam Deck",            generation: "current", query: "Steam Deck console" },

  // ── Previous-gen ─────────────────────────────────────────────────────────
  { id: "ps4",          name: "PlayStation 4",         generation: "previous", query: "PlayStation 4 console" },
  { id: "xbox-one",     name: "Xbox One",              generation: "previous", query: "Xbox One console" },
  { id: "switch",       name: "Nintendo Switch",       generation: "previous", query: "Nintendo Switch console -OLED -Lite" },

  // ── Retro ────────────────────────────────────────────────────────────────
  { id: "n64",          name: "Nintendo 64",           generation: "retro", query: "Nintendo 64 console" },
  { id: "snes",         name: "Super Nintendo",        generation: "retro", query: "Super Nintendo SNES console" },
  { id: "genesis",      name: "Sega Genesis",          generation: "retro", query: "Sega Genesis console" },
  { id: "dreamcast",    name: "Sega Dreamcast",        generation: "retro", query: "Sega Dreamcast console" },
  { id: "gamecube",     name: "Nintendo GameCube",     generation: "retro", query: "Nintendo GameCube console" },
  { id: "wii",          name: "Nintendo Wii",          generation: "retro", query: "Nintendo Wii console -\"Wii U\"" },
  { id: "wii-u",        name: "Wii U",                 generation: "retro", query: "Nintendo Wii U console" },
  { id: "ps1",          name: "PlayStation",           generation: "retro", query: "Sony PlayStation PS1 console" },
  { id: "ps2",          name: "PlayStation 2",         generation: "retro", query: "PlayStation 2 console" },
  { id: "ps3",          name: "PlayStation 3",         generation: "retro", query: "PlayStation 3 console" },
  { id: "xbox-360",     name: "Xbox 360",              generation: "retro", query: "Xbox 360 console" },
  { id: "xbox",         name: "Xbox",                  generation: "retro", query: "Microsoft Xbox console -360 -\"Series\" -\"One\"" },
  { id: "gba",          name: "Game Boy Advance",      generation: "retro", query: "Game Boy Advance console" },
];
