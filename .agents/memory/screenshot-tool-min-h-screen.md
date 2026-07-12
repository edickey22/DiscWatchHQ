---
name: Screenshot tool can't see past a min-h-screen hero
description: Why the appPreview Screenshot tool only ever shows the hero section on pages with a min-h-[100vh]-style hero, no matter what viewportSize is passed.
---

The `Screenshot` tool sets the browser viewport to the exact `viewportSize` given and captures only that visible area — it does not scroll or capture the full page.

If a section uses Tailwind `min-h-screen` / `min-h-[calc(100vh-Npx)]`, that section's height is tied to the viewport height you request. Since the section is *at least* 100vh, it always fills the entire requested viewport, so content below it (e.g. a "pathway cards" section further down the page) can never appear in the screenshot — increasing `viewportSize.height` does not help, because the hero grows to match.

**Why:** discovered while trying to visually verify a card added below the DiscWatch tracker homepage hero; every height from 900 to 3000 came back as 100% hero content.

**How to apply:** for pages with a full-viewport hero, don't try to screenshot-verify sections below it — verify by reading the component source/grid classes instead, or screenshot a page/route that renders the target section without a competing min-h-screen sibling above it (e.g. link directly to an anchor, or check it on a page where it's not preceded by a full-height hero).
