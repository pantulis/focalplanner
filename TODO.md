# TODO

## Screenshots (deferred)
- Capture clean screenshots (no personal calendar/reminder data) and add them to
  `screenshots/`. See `screenshots/README.md` for the safe-capture guide — e.g. hide all
  calendars/lists via Settings → Calendars to get an empty planner, use a throwaway demo
  calendar, or capture chrome-only screens (Appearance, About, Areas).
- Embed the screenshots in the top-level `README.md` under a "Screenshots" section.
- Offer: drop raw captures in `screenshots/` and have them auto-redacted (blur) before commit.

## Real in-app RSVP (investigation)
- Current state: invitations the user hasn't responded to are greyed out, and the event
  inspector / context menu offer **"Respond in Calendar"** (opens Calendar.app via the
  `open_calendar` command), since EventKit's public API can't send an RSVP.
- Idea to revisit: respond programmatically instead of bouncing to Calendar. Blockers —
  `EKParticipant.participantStatus` is read-only (public API), and `EKEventStore.saveEvent`
  does **not** transmit invitation responses, so any `set_participant_status` + save relies
  on private/KVC hacks that likely won't propagate to the organizer (and definitely not for
  Exchange/Office-365 meetings, which must go through EWS/Graph). A crate like `eventkit_rs`
  claiming `set_participant_status` would still hit these limits.
- If pursued: the realistic path is talking to the calendar server directly (CalDAV /
  Exchange EWS / Microsoft Graph), the way Fantastical/BusyCal do — large scope. Worth a
  ~15-min spike with the private-API route first to confirm it can't propagate before
  investing further.

## Nice-to-haves
- Frontend bundle is ~520 KB in one chunk — consider code-splitting (lazy-load
  framer-motion / dialogs) to quiet the Vite size warning.
