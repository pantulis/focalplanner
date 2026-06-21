# Screenshots

Source captures of FocalPlanner and the framed versions referenced from the
top-level `README.md`.

## Workflow

1. **Populate safe data.** Launch a dev/`--debug` build and turn on **Demo Mode**
   (About dialog → *Enter Demo Mode*). It swaps in built-in sample calendars,
   events and reminders dated around today, so no personal data is captured. It's
   fully non-destructive — your real Calendar and Reminders are never touched.
2. **Capture the window.** `⌘⇧4`, then **Space**, then click the FocalPlanner
   window (clean shot with a drop shadow). Save the raw `*.png` into this folder.
3. **Frame uniformly.** Run [`./normalize.sh`](normalize.sh) to crop each shot to
   its window and re-center it on a uniform backdrop with an equal border:
   - `normalized/` — full-res (2×) frames, identical dimensions
   - `normalized/1x/*.png` — half-size versions
   - `normalized/1x/*.webp` — lightweight README versions (`./normalize.sh --webp`)

The raw `*.png` in this folder are the originals and are never modified by the
script. The README embeds the `.webp` files.

## Tunables

Border width, backdrop gradient, shadow, downscale factor and WebP quality are
all near the top of `normalize.sh`.
