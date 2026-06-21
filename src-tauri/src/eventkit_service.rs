//! Synchronous EventKit access layer.
//!
//! Every function here creates a short-lived [`EKEventStore`] and performs its
//! work synchronously. The store is `!Send`, so these functions must only be
//! called from a blocking context (see `commands.rs`, which wraps them in
//! `tauri::async_runtime::spawn_blocking`). Authorization is granted at the
//! system (TCC) level and persists across stores, so creating a fresh store
//! per call is correct.

use eventkit::prelude::*;

use crate::models::{
    AccessStatus, CalendarDto, CalendarSets, EventDto, EventInput, ReminderDto, ReminderInput,
};

type EkResult<T> = Result<T, EventKitError>;

fn store() -> EkResult<EKEventStore> {
    EKEventStore::new()
}

fn not_found(what: &str) -> EventKitError {
    EventKitError::OperationFailed(format!("{what} not found"))
}

// ── Authorization ─────────────────────────────────────────────────────────

fn auth_to_string(status: EKAuthorizationStatus) -> String {
    match status {
        EKAuthorizationStatus::NotDetermined => "notDetermined",
        EKAuthorizationStatus::Restricted => "restricted",
        EKAuthorizationStatus::Denied => "denied",
        EKAuthorizationStatus::FullAccess => "fullAccess",
        EKAuthorizationStatus::WriteOnly => "writeOnly",
        _ => "unknown",
    }
    .to_string()
}

/// Current authorization status without prompting the user.
pub fn access_status() -> EkResult<AccessStatus> {
    Ok(AccessStatus {
        events: auth_to_string(EKEventStore::authorization_status(EKEntityType::Event)),
        reminders: auth_to_string(EKEventStore::authorization_status(EKEntityType::Reminder)),
    })
}

/// Prompt for full access to both entity types, then report the resulting status.
pub fn request_access() -> EkResult<AccessStatus> {
    let store = store()?;
    // Ignore the boolean/errors here; the authoritative answer is the status below.
    let _ = store.request_full_access_to_events();
    let _ = store.request_full_access_to_reminders();
    access_status()
}

// ── Calendars / lists ─────────────────────────────────────────────────────

fn calendar_to_dto(c: &EKCalendar) -> CalendarDto {
    CalendarDto {
        id: c.identifier.clone(),
        title: c.title.clone(),
        color: c.color.clone(),
        editable: c.allows_content_modifications,
        account: c.source.as_ref().map(|s| s.title.clone()),
    }
}

pub fn list_calendars() -> EkResult<CalendarSets> {
    let store = store()?;
    let events = store
        .calendars_for_entity_type(EKEntityType::Event)?
        .iter()
        .map(calendar_to_dto)
        .collect();
    let reminder_lists = store
        .calendars_for_entity_type(EKEntityType::Reminder)?
        .iter()
        .map(calendar_to_dto)
        .collect();
    Ok(CalendarSets {
        events,
        reminder_lists,
    })
}

// ── Events ────────────────────────────────────────────────────────────────

fn event_to_dto(e: EKEvent) -> EventDto {
    let (calendar_id, calendar_title, color) = match &e.calendar {
        Some(c) => (
            Some(c.identifier.clone()),
            Some(c.title.clone()),
            c.color.clone(),
        ),
        None => (e.calendar_identifier.clone(), None, None),
    };
    EventDto {
        id: e.identifier,
        title: e.title,
        start: e.start_date,
        end: e.end_date,
        all_day: e.all_day,
        calendar_id,
        calendar_title,
        color,
        notes: e.notes,
        location: e.location,
        url: e.url,
    }
}

pub fn fetch_events(
    start: String,
    end: String,
    calendar_ids: Option<Vec<String>>,
) -> EkResult<Vec<EventDto>> {
    let store = store()?;
    let predicate = match calendar_ids {
        Some(ids) if !ids.is_empty() => EKEventPredicate::new(start, end).with_calendar_identifiers(ids),
        _ => EKEventPredicate::new(start, end),
    };
    let mut events: Vec<EventDto> = store
        .events_matching(&predicate)?
        .into_iter()
        .map(event_to_dto)
        .collect();
    events.sort_by(|a, b| a.start.cmp(&b.start));
    Ok(events)
}

fn default_event_calendar(store: &EKEventStore) -> Option<String> {
    store
        .default_calendar_for_new_events()
        .ok()
        .flatten()
        .map(|c| c.identifier)
}

pub fn create_event(input: EventInput) -> EkResult<()> {
    let store = store()?;
    let mut event = EKEvent::new(input.title, input.start, input.end);
    event.all_day = input.all_day;
    event.notes = input.notes;
    event.location = input.location;
    event.calendar_identifier = input.calendar_id.or_else(|| default_event_calendar(&store));
    store.save_event(&event, EKSpan::ThisEvent, true)
}

pub fn update_event(input: EventInput) -> EkResult<()> {
    let id = input.id.clone().ok_or_else(|| not_found("event id"))?;
    let store = store()?;
    let mut event = store
        .event_with_identifier(&id)?
        .ok_or_else(|| not_found("event"))?;
    event.title = input.title;
    event.start_date = input.start;
    event.end_date = input.end;
    event.all_day = input.all_day;
    event.notes = input.notes;
    event.location = input.location;
    if let Some(cal) = input.calendar_id {
        event.calendar_identifier = Some(cal);
    }
    store.save_event(&event, EKSpan::ThisEvent, true)
}

pub fn delete_event(id: String) -> EkResult<()> {
    let store = store()?;
    let event = store
        .event_with_identifier(&id)?
        .ok_or_else(|| not_found("event"))?;
    store.remove_event(&event, EKSpan::ThisEvent, true)
}

// ── Reminders ─────────────────────────────────────────────────────────────

fn components_to_string(c: &NSDateComponents) -> Option<String> {
    let (y, m, d) = (c.year?, c.month?, c.day?);
    let mut s = format!("{y:04}-{m:02}-{d:02}");
    if let (Some(h), Some(min)) = (c.hour, c.minute) {
        s.push_str(&format!("T{h:02}:{min:02}"));
    }
    Some(s)
}

/// Parse `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM[:SS]` into date components.
fn parse_due(s: &str) -> NSDateComponents {
    let (date_part, time_part) = match s.split_once('T') {
        Some((d, t)) => (d, Some(t)),
        None => (s, None),
    };
    let mut parts = date_part.split('-');
    let year = parts.next().and_then(|v| v.parse().ok()).unwrap_or(2000);
    let month = parts.next().and_then(|v| v.parse().ok()).unwrap_or(1);
    let day = parts.next().and_then(|v| v.parse().ok()).unwrap_or(1);
    // EventKit ignores due components that carry no calendar, so attach one
    // (mirrors Apple's `Calendar.current.dateComponents(...)`).
    let comps = NSDateComponents::date(year, month, day).with_calendar_identifier("gregorian");
    match time_part {
        Some(t) => {
            let mut tp = t.split(':');
            let hour = tp.next().and_then(|v| v.parse().ok()).unwrap_or(0);
            let minute = tp.next().and_then(|v| v.parse().ok()).unwrap_or(0);
            comps.with_time(hour, minute, 0)
        }
        None => comps,
    }
}

fn reminder_to_dto(r: EKReminder) -> ReminderDto {
    let (list_id, list_title, color) = match &r.calendar {
        Some(c) => (
            Some(c.identifier.clone()),
            Some(c.title.clone()),
            c.color.clone(),
        ),
        None => (r.calendar_identifier.clone(), None, None),
    };
    ReminderDto {
        recurring: r.has_recurrence_rules || !r.recurrence_rules.is_empty(),
        id: r.identifier,
        title: r.title,
        completed: r.is_completed,
        due: r.due_date_components.as_ref().and_then(components_to_string),
        priority: r.priority,
        list_id,
        list_title,
        color,
        notes: r.notes,
    }
}

pub fn fetch_reminders(
    list_ids: Option<Vec<String>>,
    include_completed: bool,
) -> EkResult<Vec<ReminderDto>> {
    let store = store()?;
    let mut predicate = if include_completed {
        EKReminderPredicate::new()
    } else {
        EKReminderPredicate::incomplete()
    };
    if let Some(ids) = list_ids {
        if !ids.is_empty() {
            predicate = predicate.with_calendar_identifiers(ids);
        }
    }
    Ok(store
        .fetch_reminders_matching(&predicate)?
        .into_iter()
        .map(reminder_to_dto)
        .collect())
}

fn default_reminder_list(store: &EKEventStore) -> Option<String> {
    store
        .default_calendar_for_new_reminders()
        .ok()
        .flatten()
        .map(|c| c.identifier)
}

pub fn create_reminder(input: ReminderInput) -> EkResult<()> {
    let store = store()?;
    let mut reminder = EKReminder::new(input.title);
    reminder.priority = input.priority;
    reminder.notes = input.notes;
    reminder.due_date_components = input.due.as_deref().map(parse_due);
    reminder.calendar_identifier = input.list_id.or_else(|| default_reminder_list(&store));
    store.save_reminder(&reminder, true)
}

fn load_reminder(store: &EKEventStore, id: &str) -> EkResult<EKReminder> {
    store
        .calendar_item_with_identifier(id)?
        .as_ref()
        .and_then(EKCalendarItem::as_reminder)
        .cloned()
        .ok_or_else(|| not_found("reminder"))
}

pub fn update_reminder(input: ReminderInput) -> EkResult<()> {
    let id = input.id.clone().ok_or_else(|| not_found("reminder id"))?;
    let store = store()?;
    let mut reminder = load_reminder(&store, &id)?;
    reminder.title = input.title;
    reminder.priority = input.priority;
    reminder.notes = input.notes;
    reminder.due_date_components = input.due.as_deref().map(parse_due);
    if let Some(list) = input.list_id {
        reminder.calendar_identifier = Some(list);
    }
    store.save_reminder(&reminder, true)
}

pub fn set_reminder_completed(id: String, completed: bool) -> EkResult<()> {
    let store = store()?;
    let mut reminder = load_reminder(&store, &id)?;
    reminder.is_completed = completed;
    store.save_reminder(&reminder, true)
}

pub fn delete_reminder(id: String) -> EkResult<()> {
    let store = store()?;
    let reminder = load_reminder(&store, &id)?;
    store.remove_reminder(&reminder, true)
}
