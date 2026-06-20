# TODO

## Screenshots (deferred)
- Capture clean screenshots (no personal calendar/reminder data) and add them to
  `screenshots/`. See `screenshots/README.md` for the safe-capture guide — e.g. hide all
  calendars/lists via Settings → Calendars to get an empty planner, use a throwaway demo
  calendar, or capture chrome-only screens (Appearance, About, Areas).
- Embed the screenshots in the top-level `README.md` under a "Screenshots" section.
- Offer: drop raw captures in `screenshots/` and have them auto-redacted (blur) before commit.

## Nice-to-haves
- Frontend bundle is ~520 KB in one chunk — consider code-splitting (lazy-load
  framer-motion / dialogs) to quiet the Vite size warning.
