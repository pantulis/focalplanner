//! Serializable DTOs exchanged with the React frontend.
//!
//! These are intentionally decoupled from the `eventkit` crate's `EK*`
//! snapshot types so the frontend has a small, stable shape to work with.

use serde::{Deserialize, Serialize};

/// An event attendee/organizer for the inspector's participant list.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticipantDto {
    pub name: Option<String>,
    /// Lowercase status: accepted | declined | tentative | pending | unknown |
    /// delegated | completed | inProcess.
    pub status: String,
    pub is_current_user: bool,
    pub is_organizer: bool,
}

/// A recurrence rule in the small shape the frontend edits.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurrenceDto {
    /// "daily" | "weekly" | "monthly" | "yearly".
    pub frequency: String,
    pub interval: i64,
    /// Weekdays for weekly rules (0 = Sunday … 6 = Saturday).
    pub days_of_week: Vec<i64>,
    /// End date as `YYYY-MM-DD`, if the rule ends on a date.
    pub end_date: Option<String>,
    /// Occurrence count, if the rule ends after a number of times.
    pub count: Option<u64>,
}

/// Recurrence as submitted from the inspector. `None` clears recurrence.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurrenceInput {
    pub frequency: String,
    #[serde(default = "default_interval")]
    pub interval: i64,
    #[serde(default)]
    pub days_of_week: Vec<i64>,
    pub end_date: Option<String>,
    pub count: Option<u64>,
}

fn default_interval() -> i64 {
    1
}

/// A calendar or reminder list shown in the sidebar.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarDto {
    pub id: String,
    pub title: String,
    /// Hex color string (e.g. `#FF0000`) when EventKit provides one.
    pub color: Option<String>,
    /// Whether items in this calendar/list can be created or edited.
    pub editable: bool,
    /// Owning account/source name (e.g. "iCloud", "Gmail", "Exchange").
    pub account: Option<String>,
}

/// The two sidebar collections returned together.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarSets {
    pub events: Vec<CalendarDto>,
    pub reminder_lists: Vec<CalendarDto>,
}

/// Authorization status for both entity types.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessStatus {
    /// One of: notDetermined | restricted | denied | fullAccess | writeOnly | unknown
    pub events: String,
    pub reminders: String,
}

/// A calendar event.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventDto {
    pub id: Option<String>,
    pub title: String,
    /// RFC3339 start timestamp as returned by EventKit.
    pub start: String,
    /// RFC3339 end timestamp as returned by EventKit.
    pub end: String,
    pub all_day: bool,
    pub calendar_id: Option<String>,
    pub calendar_title: Option<String>,
    pub color: Option<String>,
    pub notes: Option<String>,
    pub location: Option<String>,
    pub url: Option<String>,
    /// Whether the event has a recurrence rule.
    pub recurring: bool,
    /// The event's recurrence rule, when it has one.
    pub recurrence: Option<RecurrenceDto>,
    /// True when the current user is an attendee who hasn't responded yet
    /// (an invitation awaiting RSVP).
    pub needs_response: bool,
    /// Attendees (organizer first when known) with their RSVP status.
    pub participants: Vec<ParticipantDto>,
}

/// A reminder (to-do).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderDto {
    pub id: Option<String>,
    pub title: String,
    pub completed: bool,
    /// Whether the reminder has a recurrence rule.
    pub recurring: bool,
    /// The reminder's recurrence rule, when it has one.
    pub recurrence: Option<RecurrenceDto>,
    /// Local datetime in `YYYY-MM-DDTHH:MM` form (matches `<input type=datetime-local>`),
    /// or `YYYY-MM-DD` when no time component is set. `None` when undated.
    pub due: Option<String>,
    /// EventKit numeric priority (0 = none, 1 = high … 9 = low).
    pub priority: u64,
    pub list_id: Option<String>,
    pub list_title: Option<String>,
    pub color: Option<String>,
    pub notes: Option<String>,
}

// ── Inputs from the frontend ──────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventInput {
    /// Present when editing an existing event.
    pub id: Option<String>,
    pub title: String,
    /// RFC3339 (e.g. produced by JS `Date.toISOString()`).
    pub start: String,
    pub end: String,
    #[serde(default)]
    pub all_day: bool,
    /// Target calendar; falls back to the default calendar when omitted.
    pub calendar_id: Option<String>,
    pub notes: Option<String>,
    pub location: Option<String>,
    /// Recurrence to apply; `None`/absent clears any existing rule.
    #[serde(default)]
    pub recurrence: Option<RecurrenceInput>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderInput {
    pub id: Option<String>,
    pub title: String,
    /// `YYYY-MM-DDTHH:MM` (datetime-local) or `YYYY-MM-DD`; `None` clears the due date.
    pub due: Option<String>,
    #[serde(default)]
    pub priority: u64,
    /// Target reminder list; falls back to the default list when omitted.
    pub list_id: Option<String>,
    pub notes: Option<String>,
    /// Recurrence to apply; `None`/absent clears any existing rule.
    #[serde(default)]
    pub recurrence: Option<RecurrenceInput>,
}
