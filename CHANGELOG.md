# Changelog

All notable changes to FocalPlanner are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/). Update this file in
the same commit that bumps the version for each release.

## [1.5.0] — 2026-06-29

### Added
- **Weather forecast on the calendar.** Opt-in and keyless (via Open-Meteo). A new
  Settings → Weather pane lets you enable it, look up your city, and choose °C/°F. The
  Daily and Weekly day headers then show each in-range day's forecast (icon + high/low)
  to the right of the weekday.
- **All-day creation.** The all-day row is always shown; right-click it to create a
  **New all-day event** for an area's calendar. The event and reminder inspectors gain
  an all-day checkbox that hides the time pickers (events pin to midnight; reminders
  save a date-only due).

### Changed
- **Menu-bar dropdown polish.** Real calendar/reminder icons (tinted to the label
  color) replace the emoji; all-day items sort after timed ones with a divider; event
  times no longer show 2h off; cloned events (same title and time across calendars)
  collapse to one entry; locally-hidden events are omitted unless "show hidden" is on.
- **Event hover card** shows a single focus-area pill — the active area, or the
  calendar's first assigned area — instead of listing every area.
- **More shortcuts.** Navigate areas with ⌘↓/⌘↑, and toggle the Reminders sidebar with
  ⌘⌥S (also a Reminders-menu checkbox).
- The feature tour gains a **Skip tour** button, and the About dialog is reachable from
  the permission gate (so a stuck user can still read the version).

### Fixed
- **Permission gate** reliably advances after you grant access. The authoritative status
  from the grant is now seeded directly into the app, instead of re-reading a status
  that can briefly lag and leave the gate stuck.

## [1.4.0] — 2026-06-24

### Changed
- **Menu bar rewritten natively.** The menu-bar agenda is now computed by a native
  background driver instead of the webview, so it keeps updating (and finished events
  disappear on time) even while the window is hidden. Fixes a finished event lingering
  in the menu bar indefinitely.

### Added
- **NOW / NEXT pills.** The current event shows a red **NOW** pill with the time elapsed
  since it started; the next event within a look-ahead window shows a green **NEXT** pill
  with a countdown. When both apply they alternate.
- **Menubar settings pane.** New Settings → Menubar with: show in menu bar, show the NEXT
  pill, look-ahead window, show pill timers, alternate interval, and include reminders.

## [1.3.0] — 2026-06-23

### Added
- **Startup tips.** A rotating, lightly-worded tip appears in the footer on launch
  (styled like a yellow Post-it). Dismiss it for the session, or click **Don't show
  on startup** to turn it off. A synced **Show a tip on startup** preference lives in
  Settings → General.

## [1.2.0] — 2026-06-23

### Added
- **Combine multiple Areas of Focus.** Shift- or ⌘-click areas in the sidebar to
  view several at once; the Daily/Weekly/Planner views show the union of their
  calendars and reminders. A footer banner names the combined areas. The selection
  is session-only and resets to a single area on relaunch.
- **Reusable Banner component** with color variants and optional dismissal, used for
  the combined-areas notice and the update notice, now shown in a footer along the
  bottom of the window.
- **Hide individual calendar events.** Right-click an event → **Hide event**; a
  **View → Show Hidden Events** toggle (⌘⇧H, with a checkmark) reveals them faded so
  they can be unhidden. Hidden events are stored locally, never written to the
  calendar or synced preferences, and persist across sessions.

### Changed
- **Weekly view polish.** Past days get slightly narrower columns; today's column is
  highlighted with a faint wash, a colored top accent, and the existing date pill.
  Event blocks now render over an opaque base so column tints never shift their color.

## [1.1.2] — 2026-06-23

### Fixed
- **Permission gate no longer stalls after the first grant.** Granting Calendar
  and Reminders access on first launch now continues straight into the app.
  Previously the gate could stay on screen until the app was relaunched, because
  the post-grant status was read from `EKEventStore.authorizationStatus`, which can
  briefly report `notDetermined` within the same process right after a grant. The
  request now trusts EventKit's completion-handler result instead.

## [1.1.1] — 2026-06-23

### Fixed
- **Calendar/Reminders access in signed builds.** Added the EventKit resource
  entitlements (`com.apple.security.personal-information.calendars` / `.reminders`)
  so the permission prompt appears under the hardened runtime; without them macOS
  silently denied access in code-signed builds.

### Added
- The About dialog now shows the build type, and a **Settings…** item was added to
  the application menu.

## [1.1.0] — 2026-06-22

### Added
- **Event clones across calendars.** A **Clone to Calendar** action copies an
  event into another calendar; copies sharing a title + time render as a single
  **zebra-striped** block with a CLONE pill. Moving or dragging one copy moves them
  all; deleting prompts to remove just the clicked copy or every copy; editing warns
  that changes apply only to the clicked copy. The confirmation dialogs detect copies
  in every unhidden calendar, across all focus areas.
- **Per-area default calendar & reminder list.** Pick a default for each Area of
  Focus from a radio on its member rows (**Settings → Areas of Focus**). When that
  area is active, the default leads the create menu (with a **DEFAULT** pill) and is
  pre-selected in the inspector. Skipped in "All Areas", and (for lists) when a
  reminder list is filtered.
- **Vertical zoom for the Daily/Weekly grid.** Make hours taller or shorter with a
  toolbar `− / ＋` stepper or **⌥ + scroll** over the grid (session-only; resets on
  relaunch).
- **Recurrence editing.** Set/edit repeat rules on events and reminders; recurring
  events show a repeat indicator.
- **Event participants & meetings.** The event inspector lists attendees with a
  **Join** button for video links, and shows an RSVP banner that opens the event in
  Calendar (EventKit cannot RSVP programmatically).
- **Native menus & shortcuts.** New **View** and **Reminders** menus with keyboard
  accelerators to switch views, change the active area, and set the reminder filter.
- **Calendar & Reminders access pane** under **Settings → Sync**, showing the live
  authorization status with re-check / request / open-Privacy-Settings actions.

### Changed
- **Areas of Focus** settings pane uses a master–detail layout (area list + detail).
- Inspector sheets widen on wide windows.
- All-day event/task sections are resizable, and the timed grid is clipped to work
  hours (auto-expanding to include out-of-range items). Per-area 5-day work week.

### Fixed
- Event **location** not persisting (now applied via the event's structured location).

## [1.0.0] — 2026-06-21

First stable release.

### Added
- **Demo Mode (dev builds only).** A non-destructive sandbox that swaps in a
  built-in set of sample calendars, events and reminders — generated fresh and
  dated around the moment it's switched on — so screenshots can be captured
  without exposing personal data. EventKit is never read or written while it's
  on; the sample data lives only on the device and is discarded on exit. Toggle
  from the About dialog (shown only on debug/non-release builds), with a
  persistent "DEMO" badge while active.
- **Update notifications.** On launch the app checks GitHub for a newer release
  and shows a dismissible banner with a download link (no auto-install).
- **Screenshots tooling.** `screenshots/normalize.sh` frames raw window captures
  uniformly (centered window, equal border, identical dimensions) and emits
  README-sized PNG and WebP versions; a Screenshots gallery in the README.

### Changed
- The event/reminder inspector now slides in as a **Sheet** over the main view
  (backdrop + click-outside/Escape to close) instead of replacing the reminders
  sidebar.
- Renamed the **Health** area of focus to **Health & Fitness**.

## [0.8.0] — 2026-06-21

### Added
- **Planner view (Time Sector System).** A new planner organized by *when* you'll
  act, following Carl Pullein's Time Sector method: Inbox, This Week, Next Week,
  This Month, Next Month and Long Term. Dropping a reminder into a sector assigns a
  sensible due date for that horizon; the Inbox clears the date. Three switchable
  layouts for the same data — **Lanes** (stacked swimlanes), **Pipeline** (focus +
  flow) and **Horizon** (vertical) — chosen from the board header.
- **Reminders sidebar in the planner.** Drag reminders straight from the sidebar
  onto a sector to schedule them.
- **Animated lane scenery (optional).** The Lanes layout drifts sparse bird and
  fish silhouettes — birds over the far-horizon lanes (sky), fish over the near
  lanes (depths) — with slow clouds and rising bubbles. Fish turn to face their
  direction of travel. Toggle under **Settings → Appearance**.
- **Areas of Focus review.** An OmniFocus-style review for the planner: each area
  shows its review status (`review` / `today` / `Nd ago`) and a checkmark to mark
  it reviewed, with a **Start review** walkthrough that steps through every due
  area one at a time. The review interval is configurable under **Settings →
  General** (day, 3 days, week, 2 weeks, month). The sidebar mini-calendar is
  replaced by this review panel while in the planner.

### Changed
- Areas of Focus can be reordered by drag in the sidebar.

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
