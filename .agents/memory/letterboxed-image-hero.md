---
name: Letterboxed image containers show background in the gaps
description: How to handle fixed-aspect card containers with images that have different aspect ratios, without visible background gaps or zoom/crop.
---

**The pattern for card grids (e.g. ConsoleCard, ConsoleListingCard):**
Use `object-contain` + `bg-transparent` on the fixed-aspect container. Any small gaps where the image doesn't fill the box will be transparent, blending into the card's own background (`bg-card/40`) — visually invisible.

**Why:** `object-cover` + `scale-110` was used to fill the box edge-to-edge and hide letterbox gaps, but this zooms/crops the image — users notice and dislike it. `object-contain` + `bg-transparent` is the right fix: the image shows fully, gaps are transparent, and nothing looks like an odd colored box.

**What NOT to do:**
- `object-cover scale-110 group-hover:scale-100` — zooms/crops and users will complain
- `bg-muted` on a container with `object-contain` — reveals a distinctly-colored bar around the image wherever it doesn't fill the box

**How to apply:** In any card with a fixed `aspect-[N/M]` image container:
1. `<div className="... bg-transparent">` (not `bg-muted` or any colored bg)
2. `<img className="h-full w-full object-contain">` (no scale, no cover)
