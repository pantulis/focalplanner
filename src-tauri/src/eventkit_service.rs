//! EventKit access layer.
//!
//! `EKEventStore` is `!Send`, and freshly-created stores can transiently return
//! empty results while EventKit reloads after a change. So instead of a new store
//! per call, all work runs on a single long-lived, access-granted store owned by
//! one dedicated thread (`with_store`). This both keeps the store warm/consistent
//! and serializes every operation, so a read never races a write.

use std::sync::mpsc::{channel, Sender};
use std::sync::OnceLock;
use std::thread;

use eventkit::prelude::*;

use crate::models::{
    AccessStatus, CalendarDto, CalendarSets, EventDto, EventInput, ParticipantDto, RecurrenceDto,
    RecurrenceInput, ReminderDto, ReminderInput,
};

type EkResult<T> = Result<T, EventKitError>;

// ── Recurrence conversion ──────────────────────────────────────────────────

fn weekday_to_num(w: EKWeekday) -> i64 {
    match w {
        EKWeekday::Sunday => 0,
        EKWeekday::Monday => 1,
        EKWeekday::Tuesday => 2,
        EKWeekday::Wednesday => 3,
        EKWeekday::Thursday => 4,
        EKWeekday::Friday => 5,
        EKWeekday::Saturday => 6,
    }
}

fn num_to_weekday(n: i64) -> EKWeekday {
    match n.rem_euclid(7) {
        0 => EKWeekday::Sunday,
        1 => EKWeekday::Monday,
        2 => EKWeekday::Tuesday,
        3 => EKWeekday::Wednesday,
        4 => EKWeekday::Thursday,
        5 => EKWeekday::Friday,
        _ => EKWeekday::Saturday,
    }
}

fn freq_to_str(f: EKRecurrenceFrequency) -> String {
    match f {
        EKRecurrenceFrequency::Daily => "daily",
        EKRecurrenceFrequency::Weekly => "weekly",
        EKRecurrenceFrequency::Monthly => "monthly",
        EKRecurrenceFrequency::Yearly => "yearly",
    }
    .to_string()
}

fn str_to_freq(s: &str) -> EKRecurrenceFrequency {
    match s {
        "daily" => EKRecurrenceFrequency::Daily,
        "monthly" => EKRecurrenceFrequency::Monthly,
        "yearly" => EKRecurrenceFrequency::Yearly,
        _ => EKRecurrenceFrequency::Weekly,
    }
}

/// Build a structured location from free text. `EKEvent.location` is backed by
/// `structuredLocation.title`, and the bridge applies `structuredLocation` after
/// the plain `location` string on save — so to make a typed location persist we
/// must give it a matching structured location (and `None` clears it).
fn structured_location(loc: &Option<String>) -> Option<EKStructuredLocation> {
    loc.as_deref()
        .filter(|s| !s.trim().is_empty())
        .map(|s| EKStructuredLocation::new(s))
}

/// First recurrence rule (if any) as the small DTO the frontend edits.
fn recurrence_from_rules(rules: &[EKRecurrenceRule]) -> Option<RecurrenceDto> {
    rules.first().map(|r| RecurrenceDto {
        frequency: freq_to_str(r.frequency),
        interval: r.interval,
        days_of_week: r
            .days_of_the_week
            .iter()
            .map(|d| weekday_to_num(d.day_of_the_week))
            .collect(),
        // Rule end dates are RFC3339; expose just the calendar date.
        end_date: r
            .end_date
            .as_ref()
            .map(|s| s.split('T').next().unwrap_or(s).to_string()),
        count: r.occurrence_count,
    })
}

/// Build the EventKit rule list for a create/update from the inspector input.
/// Returns an empty vec when there is no recurrence (which clears it on save).
fn rules_from_input(input: &Option<RecurrenceInput>) -> Vec<EKRecurrenceRule> {
    let Some(rec) = input else {
        return Vec::new();
    };
    let mut rule = EKRecurrenceRule::new(str_to_freq(&rec.frequency)).with_interval(rec.interval.max(1));
    if rec.frequency == "weekly" && !rec.days_of_week.is_empty() {
        rule = rule.with_days_of_the_week(
            rec.days_of_week
                .iter()
                .map(|&n| EKRecurrenceDayOfWeek::new(num_to_weekday(n))),
        );
    }
    if let Some(d) = &rec.end_date {
        // Inclusive end of the chosen day, in RFC3339 as the bridge expects.
        rule = rule.with_end_date(format!("{d}T23:59:59Z"));
    } else if let Some(c) = rec.count {
        if c > 0 {
            rule = rule.with_occurrence_count(c);
        }
    }
    vec![rule]
}

type Job = Box<dyn FnOnce(&EKEventStore) + Send>;

static WORKER: OnceLock<Sender<Job>> = OnceLock::new();

/// The dedicated EventKit thread, lazily started. Owns the one persistent store.
fn worker() -> &'static Sender<Job> {
    WORKER.get_or_init(|| {
        let (tx, rx) = channel::<Job>();
        thread::Builder::new()
            .name("eventkit".into())
            .spawn(move || {
                let store = match EKEventStore::new() {
                    Ok(s) => s,
                    Err(e) => {
                        eprintln!("[eventkit] failed to create store: {e}");
                        return;
                    }
                };
                // Request the (already-granted at the TCC level) access so the
                // store fully loads its data before serving queries.
                let _ = store.request_full_access_to_events();
                let _ = store.request_full_access_to_reminders();
                while let Ok(job) = rx.recv() {
                    job(&store);
                }
            })
            .expect("spawn eventkit thread");
        tx
    })
}

/// Run a closure on the persistent EventKit store thread and return its result.
fn with_store<T, F>(f: F) -> EkResult<T>
where
    F: FnOnce(&EKEventStore) -> EkResult<T> + Send + 'static,
    T: Send + 'static,
{
    let (rtx, rrx) = channel();
    if worker()
        .send(Box::new(move |store| {
            let _ = rtx.send(f(store));
        }))
        .is_err()
    {
        return Err(EventKitError::OperationFailed(
            "EventKit worker unavailable".into(),
        ));
    }
    rrx.recv()
        .map_err(|_| EventKitError::OperationFailed("EventKit worker dropped".into()))?
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
    // The completion-handler booleans are authoritative the instant the user responds.
    // The class-method authorizationStatus (used by access_status) can still report
    // notDetermined within the same process right after a grant, which would otherwise
    // leave the permission gate stuck until the app is relaunched.
    let (events_granted, reminders_granted) = with_store(|store| {
        let e = store.request_full_access_to_events().unwrap_or(false);
        let r = store.request_full_access_to_reminders().unwrap_or(false);
        Ok((e, r))
    })?;
    let mut status = access_status()?;
    if events_granted && status.events != "fullAccess" {
        status.events = "fullAccess".to_string();
    }
    if reminders_granted && status.reminders != "fullAccess" {
        status.reminders = "fullAccess".to_string();
    }
    Ok(status)
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
    with_store(|store| {
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
    // An invitation awaits a response when the current user is a (non-organizer)
    // attendee whose status isn't an explicit accept/decline/tentative. EventKit
    // reports the unresponded status inconsistently across account types
    // (Pending / Unknown / InProcess), so treat all three as "needs response".
    let organizer_is_me = e.organizer.as_ref().map(|o| o.is_current_user).unwrap_or(false);
    let needs_response = !organizer_is_me
        && e.attendees.iter().any(|p| {
            p.is_current_user
                && matches!(
                    p.participant_status,
                    EKParticipantStatus::Pending
                        | EKParticipantStatus::Unknown
                        | EKParticipantStatus::InProcess
                )
        });
    let participants = build_participants(&e);
    EventDto {
        id: e.identifier,
        title: e.title,
        start: e.start_date,
        end: e.end_date,
        all_day: e.all_day,
        calendar_id,
        calendar_title,
        color,
        recurring: e.has_recurrence_rules || !e.recurrence_rules.is_empty(),
        recurrence: recurrence_from_rules(&e.recurrence_rules),
        needs_response,
        participants,
        notes: e.notes,
        location: e.location,
        url: e.url,
    }
}

fn participant_status_str(s: EKParticipantStatus) -> &'static str {
    match s {
        EKParticipantStatus::Accepted => "accepted",
        EKParticipantStatus::Declined => "declined",
        EKParticipantStatus::Tentative => "tentative",
        EKParticipantStatus::Pending => "pending",
        EKParticipantStatus::Delegated => "delegated",
        EKParticipantStatus::Completed => "completed",
        EKParticipantStatus::InProcess => "inProcess",
        EKParticipantStatus::Unknown => "unknown",
    }
}

/// Attendees with RSVP status; the organizer is marked (and prepended if it
/// isn't already among the attendees).
fn build_participants(e: &EKEvent) -> Vec<ParticipantDto> {
    let organizer_url = e.organizer.as_ref().and_then(|o| o.url.clone());
    let mut out: Vec<ParticipantDto> = e
        .attendees
        .iter()
        .map(|p| ParticipantDto {
            name: p.name.clone(),
            status: participant_status_str(p.participant_status).to_string(),
            is_current_user: p.is_current_user,
            is_organizer: organizer_url.is_some() && organizer_url == p.url,
        })
        .collect();
    if let Some(org) = &e.organizer {
        if !out.iter().any(|p| p.is_organizer) {
            out.insert(
                0,
                ParticipantDto {
                    name: org.name.clone(),
                    status: participant_status_str(org.participant_status).to_string(),
                    is_current_user: org.is_current_user,
                    is_organizer: true,
                },
            );
        }
    }
    out
}

pub fn fetch_events(
    start: String,
    end: String,
    calendar_ids: Option<Vec<String>>,
) -> EkResult<Vec<EventDto>> {
    with_store(move |store| {
        let predicate = match calendar_ids {
            Some(ids) if !ids.is_empty() => {
                EKEventPredicate::new(start, end).with_calendar_identifiers(ids)
            }
            _ => EKEventPredicate::new(start, end),
        };
        let mut events: Vec<EventDto> = store
            .events_matching(&predicate)?
            .into_iter()
            .map(event_to_dto)
            .collect();
        events.sort_by(|a, b| a.start.cmp(&b.start));
        Ok(events)
    })
}

fn default_event_calendar(store: &EKEventStore) -> Option<String> {
    store
        .default_calendar_for_new_events()
        .ok()
        .flatten()
        .map(|c| c.identifier)
}

pub fn create_event(input: EventInput) -> EkResult<()> {
    with_store(move |store| {
        let mut event = EKEvent::new(input.title, input.start, input.end);
        event.all_day = input.all_day;
        event.notes = input.notes;
        event.structured_location = structured_location(&input.location);
        event.location = input.location;
        event.calendar_identifier = input.calendar_id.or_else(|| default_event_calendar(store));
        event.recurrence_rules = rules_from_input(&input.recurrence);
        store.save_event(&event, EKSpan::ThisEvent, true)
    })
}

pub fn update_event(input: EventInput) -> EkResult<()> {
    with_store(move |store| {
        let id = input.id.clone().ok_or_else(|| not_found("event id"))?;
        let mut event = store
            .event_with_identifier(&id)?
            .ok_or_else(|| not_found("event"))?;
        event.title = input.title;
        event.start_date = input.start;
        event.end_date = input.end;
        event.all_day = input.all_day;
        event.notes = input.notes;
        event.structured_location = structured_location(&input.location);
        event.location = input.location;
        if let Some(cal) = input.calendar_id {
            event.calendar_identifier = Some(cal);
        }
        event.recurrence_rules = rules_from_input(&input.recurrence);
        store.save_event(&event, EKSpan::FutureEvents, true)
    })
}

pub fn delete_event(id: String) -> EkResult<()> {
    with_store(move |store| {
        let event = store
            .event_with_identifier(&id)?
            .ok_or_else(|| not_found("event"))?;
        store.remove_event(&event, EKSpan::ThisEvent, true)
    })
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
        recurrence: recurrence_from_rules(&r.recurrence_rules),
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
    with_store(move |store| {
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
    })
}

fn default_reminder_list(store: &EKEventStore) -> Option<String> {
    store
        .default_calendar_for_new_reminders()
        .ok()
        .flatten()
        .map(|c| c.identifier)
}

pub fn create_reminder(input: ReminderInput) -> EkResult<()> {
    with_store(move |store| {
        let mut reminder = EKReminder::new(input.title);
        reminder.priority = input.priority;
        reminder.notes = input.notes;
        reminder.due_date_components = input.due.as_deref().map(parse_due);
        reminder.calendar_identifier = input.list_id.or_else(|| default_reminder_list(store));
        reminder.recurrence_rules = rules_from_input(&input.recurrence);
        store.save_reminder(&reminder, true)
    })
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
    with_store(move |store| {
        let id = input.id.clone().ok_or_else(|| not_found("reminder id"))?;
        let mut reminder = load_reminder(store, &id)?;
        reminder.title = input.title;
        reminder.priority = input.priority;
        reminder.notes = input.notes;
        reminder.due_date_components = input.due.as_deref().map(parse_due);
        if let Some(list) = input.list_id {
            reminder.calendar_identifier = Some(list);
        }
        reminder.recurrence_rules = rules_from_input(&input.recurrence);
        store.save_reminder(&reminder, true)
    })
}

pub fn set_reminder_completed(id: String, completed: bool) -> EkResult<()> {
    with_store(move |store| {
        let mut reminder = load_reminder(store, &id)?;
        reminder.is_completed = completed;
        store.save_reminder(&reminder, true)
    })
}

pub fn delete_reminder(id: String) -> EkResult<()> {
    with_store(move |store| {
        let reminder = load_reminder(store, &id)?;
        store.remove_reminder(&reminder, true)
    })
}
