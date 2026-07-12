---
name: Unsplash image sourcing for product photos
description: How to reliably find and verify real, self-hostable product photos from Unsplash when accurate model-specific depiction matters
---

When sourcing real photos per specific product model (e.g. one photo per console/device model) via `imageSearch` restricted to `site:unsplash.com`:

- The tool's auto-generated titles are frequently wrong or mismatched (e.g. a Switch 2 photo titled "Switch Lite", a PS1 photo turning up under a PS4 query). Never trust the title — always download the candidate and visually view it before use.
- Expect roughly half of niche/specific queries (older or less-photographed hardware revisions) to have no clean Unsplash match at all. Budget for a real fallback path (e.g. a generic icon) rather than forcing a wrong photo.
- A photo of a rebranded/regional variant of the same underlying hardware (e.g. Sega Mega Drive photographed for a "Sega Genesis" slot) is an acceptable substitute — it's the same physical console, not a different model.
- Unsplash Standard License permits free commercial use with no attribution once the file is downloaded and self-hosted; do not hotlink images.unsplash.com or call Unsplash's API with a key — download once, compress (imagemagick `convert -resize -strip -quality`), and serve from the app's own static assets.

**Why:** silent title-trusting produced several confident-looking but wrong matches (Switch Lite/Switch 2 mixups, a Master System photo under Genesis) that would have shipped as visibly incorrect product photos.
**How to apply:** any task asking for "real/authentic photo of X specific model" — search, download candidates to a scratch dir, view each with an image-capable read tool, and only keep verified matches.
