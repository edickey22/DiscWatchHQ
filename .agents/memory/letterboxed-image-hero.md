---
name: Letterboxed image containers show background in the gaps
description: A fixed-aspect box around an object-contain image reveals the box's own background color wherever the image doesn't fill it.
---

A hero image was wrapped in a fixed-aspect-ratio box (e.g. `aspect-[5/4]`) with `object-contain`
so the photo wouldn't get cropped. Whenever the photo's real aspect ratio didn't match the box,
the leftover space showed the box's own background color/class as a visible bar or shading next
to the image — even after setting that background to "transparent," because the box still sat on
top of (or adjacent to) a differently-shaded parent section.

**Why:** "transparent background" only removes an explicit fill; it does not remove the *gap*
itself, and the gap will always show whatever is visually behind/around it (parent section bg,
page bg, etc.), which often reads as an unwanted shade or bar around the image.

**How to apply:** when a caller wants "no cropping" AND "no visible box," don't force the image
into a fixed-aspect container at all — let the image size itself (e.g. `max-h-* w-auto
object-contain`, no fixed box background/dimensions) so the rendered box exactly matches the
image's own bounds and there is no leftover space to shade.
