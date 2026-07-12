---
name: Dark theme text contrast
description: Why low-opacity muted/primary/white text on this app's near-black dark theme fails WCAG AA, and the safe opacity floor.
---

The dark theme's background/card colors are near-black (`hsl(0 0% 5%)` / `hsl(0 0% 7%)`). Their own base text colors (`--muted-foreground: 120 5% 60%`, `--primary: 142 69% 42%`) already clear 4.5:1 at full opacity. But this codebase had a widespread pattern of applying Tailwind opacity modifiers (`/50`, `/40`, `/35`, `/60`) to those colors for visual de-emphasis on small caption/meta text (badges, attribution lines, secondary labels).

**Why:** alpha-blending any of these colors toward a near-black background drags relative luminance down fast. Computed contrast ratios: `text-muted-foreground/50` ≈ 2.6:1, `/60` ≈ 3.2:1, `/40` ≈ 2.1:1, `/35` ≈ 1.8:1, `text-primary/60` ≈ 3.2:1, `text-primary/70` ≈ 4.0:1 — all fail the 4.5:1 AA floor for normal-size text even though they look "intentionally subtle" in the editor. `/80` on muted-foreground barely clears (~4.85:1); `/90`+ is the comfortable safe floor for real content text (not decorative dividers/icons) on this theme's background and card surfaces.

**How to apply:** when adding or reviewing de-emphasized text on this dark theme, only use opacity modifiers below 90% on purely decorative elements (punctuation separators like "·"/"—"/"&", icon placeholders, arrow glyphs paired with visible link text). Any opacity-faded text that itself conveys information (labels, captions, attribution, years, links) should stay at ≥90% opacity of its base token, or use the full-opacity token outright.
