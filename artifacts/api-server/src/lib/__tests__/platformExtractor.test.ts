/**
 * Unit tests for extractPlatformsFromTitle.
 *
 * Run with: pnpm --filter @workspace/api-server run test:platforms
 */

import { extractPlatformsFromTitle } from "../platformExtractor";

// ─── helpers ─────────────────────────────────────────────────────────────────

function only(title: string, expected: string[]): void {
  const got = extractPlatformsFromTitle(title);
  const ok  = expected.length === got.length && expected.every((p) => got.includes(p));
  if (ok) {
    console.log(`  ✅  ${JSON.stringify(title)} → ${JSON.stringify(got)}`);
  } else {
    console.error(`  ❌  ${JSON.stringify(title)}`);
    console.error(`       expected: ${JSON.stringify(expected)}`);
    console.error(`       got:      ${JSON.stringify(got)}`);
    process.exitCode = 1;
  }
}

// ─── PlayStation family ───────────────────────────────────────────────────────
console.log("\nPlayStation family:");
only("Some Game (PlayStation 5)",                  ["PS5"]);
only("Some Game (PlayStation 4)",                  ["PS4"]);
only("Some Game (PlayStation 3)",                  ["PS3"]);
only("Some Game (PS Vita)",                        ["PS Vita"]);
only("Some Game (PSP)",                            ["PSP"]);
// Generic "PlayStation" suppressed when specific variant present
only("Bomb Rush Cyberfunk (PlayStation Exclusive Edition)", ["PlayStation"]);
// Must NOT add "PlayStation" on top of PS5/PS4
only("Dual Platform PS4/PS5 Edition",              ["PS4", "PS5"]);

// ─── Xbox family ─────────────────────────────────────────────────────────────
console.log("\nXbox family:");
only("Slime Rancher 2 (Xbox Exclusive Edition)",   ["Xbox"]);
only("LEGO® Party! (Xbox)",                        ["Xbox"]);
only("UNBEATABLE (iam8bit Xbox Exclusive Edition)", ["Xbox"]);
only("Some Game (Xbox Series)",                    ["Xbox Series"]);
only("Some Game (Xbox One)",                       ["Xbox One"]);
// Specific variants must suppress generic "Xbox"
only("Some Game (Xbox Series Edition)",            ["Xbox Series"]);
only("Some Game (Xbox One Edition)",               ["Xbox One"]);

// ─── Nintendo handhelds ───────────────────────────────────────────────────────
console.log("\nNintendo handhelds:");
only("Ninja JajaMaru: The Great World Adventure (Game Boy Color)", ["Game Boy Color"]);
only("Rod Land (GameBoy) - Collector's Edition",   ["Game Boy"]);
only("Some Game (GBA)",                            ["GBA"]);
only("Some Game (Game Boy Advance)",               ["GBA"]);
only("Some Game (3DS)",                            ["3DS"]);
only("Some Game (DS)",                             ["DS"]);
// "Game Boy Color" must NOT also emit "Game Boy"
only("Game Boy Color game",                        ["Game Boy Color"]);
// "3DS" must NOT also emit "DS"
only("3DS title",                                  ["3DS"]);

// ─── Nintendo home consoles ───────────────────────────────────────────────────
console.log("\nNintendo home consoles:");
only("Xcavator 2025 (NES Cartridge)",              ["NES"]);
only("Rod Land (NES) - Collector's Edition",       ["NES"]);
only("Over Horizon (NES NTSC Compatible Game)",    ["NES"]);
only("Super Ninja-kid (SNES® NTSC)",               ["SNES"]);
only("Some Game (Switch 2)",                       ["Switch 2"]);
only("Some Game (Nintendo Switch)",                ["Switch"]);
// "Switch 2" must NOT also emit "Switch"
only("Switch 2 title",                             ["Switch 2"]);
// "Wii U" must NOT also emit "Wii"
only("Wii U game",                                 ["Wii U"]);
only("Wii game",                                   ["Wii"]);

// ─── Sega ─────────────────────────────────────────────────────────────────────
console.log("\nSega:");
only("Undeadline Collector's Edition (Genesis/Mega Drive)",     ["Mega Drive", "Genesis"]);
only("Toaplan Shooters Volume 2 (Genesis/Mega Drive)",          ["Mega Drive", "Genesis"]);
only("Steel Empire (Mega Drive Compatible Game)",               ["Mega Drive"]);
only("Steel Empire (Genesis Compatible Game)",                  ["Genesis"]);
only("P-47 II (Genesis/Mega Drive)",                            ["Mega Drive", "Genesis"]);

// ─── Non-game items — must return [] ─────────────────────────────────────────
console.log("\nNon-game items (expect empty):");
only("Mayhem Brawler Soundtrack 2 Vinyl LPs",                  []);
only("Gunborg: Dark Matters Soundtrack 2 Vinyl LPs",           []);
only("The Mooseman Soundtrack Vinyl LP",                       []);
only("Irem Collection Volume 3 Art Card",                      []);
only("Rainbow Cotton (Art Card)",                               []);
only("Shadow of the Ninja - Reborn Art Card",                  []);
only("Over Horizon - aluminium plate",                         []);
only("BloodRayne: Definitive Collection - Deluxe Edition (No Game)", []);
only("ENDLESS Legend II - Collector's Edition (No Game)",      []);
only("Phoenix Edition V - Vol. 1 (Hardcover)",                 []);
only("Hollow Knight: Silksong Standard Edition",               []);
only("Blue Prince Showroom Bundle",                            []);
only("Annapurna Interactive Deluxe Limited Edition",           []);
only("Battletoads - Legacy Cartridge Collection",              []);

// ─── PC ───────────────────────────────────────────────────────────────────────
console.log("\nPC:");
only("Some Game PC Edition",                       ["PC"]);
only("Some Game (Steam)",                          ["PC"]);

console.log("\nDone.");
