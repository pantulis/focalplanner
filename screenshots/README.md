# Screenshots

Put PNG screenshots of FocalPlanner here (referenced from the top-level `README.md`).

> ⚠️ FocalPlanner shows your **real** Calendar events and Reminders. Before capturing,
> put the app into a state with **no personal data** using one of the approaches below.

## Capturing on macOS

- **A single window:** `⌘⇧4`, then press **Space**, then click the FocalPlanner window
  (gives a clean shot with a drop shadow, no desktop background).
- **A region:** `⌘⇧4` and drag. Or `⌘⇧5` for the capture toolbar.
- Screenshots land on your Desktop by default — move them into this folder.

## Avoiding personal data (pick one)

1. **Hide your real calendars/lists** (fastest, fully reversible):
   Settings → **Calendars** → uncheck every calendar and reminder list. The planner and
   reminders panel go empty, so you can screenshot the **UI chrome** (sidebar, toolbar,
   day/week grid, weekend shading, time rail) with nothing private. Re-check them after.

2. **Use a throwaway demo calendar/list:** in Apple Calendar/Reminders create e.g.
   "Demo" with a few harmless entries ("Lunch", "Gym"), assign it to one Area of Focus,
   and screenshot that area.

3. **Chrome-only screens (no data at all):** Settings → **Appearance** (theme swatches,
   typeface, UI scale), the **About** dialog, the **Areas of Focus** dialog (rename or
   avoid private calendar names), and the **Planner** placeholder.

If anything private slips in, blur it before committing (Preview → Tools → Annotate, or
`magick in.png -region X,Y,WxH -blur 0x12 out.png`).

## Suggested shots

- `today.png` — Today view (empty or demo data)
- `weekly.png` — Weekly view (weekend columns tinted)
- `themes.png` — Settings → Appearance (theme picker)
- `areas.png` — Areas of Focus dialog
- `about.png` — About dialog
