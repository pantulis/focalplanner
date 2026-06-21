# Changelog

All notable changes to FocalPlanner are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/). Update this file in
the same commit that bumps the version for each release.

## [0.7.0] — 2026-06-21

### Added
- **macOS menu-bar tray.** Shows the current event/reminder as the menu-bar title
  (rotating every 10 s when several coincide), and clicking it opens today's agenda:
  all-day items first, then timed items by time, with past items excluded. Events
  (📅) and reminders (📝) are distinguished by icon, plus **Open FocalPlanner** and
  **Quit FocalPlanner** entries. New **Settings → General** toggle (on by default,
  synced).

### Fixed
- Preferences / Areas of Focus and calendar + reminder data could intermittently
  disappear after repeated drag-and-drops (recovering only on relaunch or a view
  switch). All EventKit work now runs on a single long-lived, access-granted store
  on one dedicated thread, keeping it warm/consistent and serializing every
  operation, so a read can never race a write or hit a freshly-created, unloaded
  store.
- Areas of Focus no longer collapse when the calendars list momentarily returns
  empty.
- Menu-bar tray queries are decoupled from the planner's per-change invalidations
  (they refresh on their own interval) to cut concurrent EventKit load.

## [0.6.0] — 2026-06-21

### Added
- Weekly **All-day tasks** tray (~25 % tall) listing date-only reminders per day.
  Drag one onto the grid to give it a time, across days to reschedule (still
  all-day), or drag a scheduled reminder down into the tray to clear its time —
  with ghost labels and target-column highlighting. Click to edit; right-click an
  empty column to create a date-only reminder there.
- Richer hover card for events/reminders in the planner (type, calendar/list,
  time/due, location).

### Changed
- Areas of Focus moved from a standalone dialog into a **Settings** pane.
- Reminder context menu lists **Mark as completed** first, then **Edit…**.
- Renamed the sidebar/view titles to **Daily** and **Weekly** for consistency.

## [0.5.0] — 2026-06-21

### Added
- First-launch **feature tour**, replayable any time from Settings → General.

## [0.4.0] — 2026-06-21

### Added
- Read-only **schedule-context mini-planner** in the event/reminder inspectors:
  a ±N-hour timeline of all events and reminders (every calendar/list, ignoring the
  active area), with conflict / busy / clear badges. New "Scheduling context"
  setting (±1–6 h).
- GitHub Actions **release workflow** building an ad-hoc-signed universal `.dmg`.

## [0.3.0] — 2026-06-21

### Added
- Fixed sidebar **mini-month calendar** indicating the active day/week, with a
  Today shortcut and week navigation.
- **Drag-to-reorder** areas of focus in the sidebar (synced).
- Schedule reminders by **dragging from the sidebar onto the planner** (pointer-based,
  with a snapped time preview).
- 12 themes (6 light / 6 dark, incl. macOS) and bundled web typefaces (Inter, Roboto,
  Open Sans, Nunito, Source Serif, JetBrains Mono).
- Context-menu icons, **Mark as completed**, a "Current" pill on the active move
  target, and a confirmation dialog for Delete.

### Changed
- Reschedule options are relative to the focused day ("The following day" / "This day").
- The sidebar cloud icon opens Settings on the Sync pane.

### Fixed
- Weekly header / all-day rows align with the grid columns (scrollbar gutter reserved).

### Internal
- Debug builds store the GitHub token/passphrase in a file instead of the Keychain
  to avoid repeated access prompts; release builds still use the Keychain.

## [0.2.0] — 2026-06-21

### Added
- shadcn-style **date/time picker** (calendar in a popover + hour/minute selects),
  used by both inspectors.
- Move-to-List/Calendar menus put the current target first (disabled) with a separator.

### Fixed
- Reminder/event **date + time not persisting** (WKWebView drops `type="time"` /
  `datetime-local`; replaced with a date picker + hour/minute selects, and attach a
  Gregorian calendar so EventKit keeps the components).
- **Escape** always cancels the open inspector.

### Changed
- Rebalanced themes, grouped Typeface/UI-scale, and gave the Settings dialog a fixed
  size so panes don't resize the window.
