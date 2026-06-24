//! Native menu-bar driver.
//!
//! The menu bar (tray) used to be computed entirely in the webview, but macOS
//! suspends the WKWebView's JS timers while the window is hidden — so a finished
//! event could linger in the menu bar long after it ended. This driver runs on a
//! dedicated background thread, re-querying EventKit and pushing the current
//! event / today's agenda to the tray on a native timer, independent of the
//! webview's lifecycle. The webview only pushes configuration (enabled flag +
//! ignored calendar/list ids) via `tray_configure`.

use std::collections::HashSet;
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use chrono::{Duration as ChronoDuration, Local, NaiveDateTime, TimeZone, Utc};
use tauri::{AppHandle, Manager};

use crate::eventkit_service as svc;
use crate::tray::{self, Pill, TrayItem};

const REMINDER_ACTIVE_MS: i64 = 30 * 60 * 1000; // a reminder is "current" for 30 min
const EVENT_ICON: &str = "📅";
const REMINDER_ICON: &str = "📝";
/// Safety refresh ceiling for the driver loop.
const MAX_SLEEP_MS: u64 = 30_000;
const MIN_SLEEP_MS: u64 = 1_000;

/// User-tunable menu-bar behavior, pushed from the webview settings.
#[derive(Clone)]
struct Opts {
    show_next: bool,
    next_window_ms: i64,
    show_timers: bool,
    rotate_ms: u64,
    include_reminders: bool,
}

#[derive(Default)]
struct Config {
    enabled: bool,
    ignored_calendars: HashSet<String>,
    ignored_lists: HashSet<String>,
    show_next: bool,
    next_window_ms: i64,
    show_timers: bool,
    rotate_ms: u64,
    include_reminders: bool,
    /// Bumped on any change so the driver loop can detect updates that land
    /// while it is busy fetching and avoid sleeping through them.
    generation: u64,
}

/// Shared state between the webview-facing command, the EventKit change observer,
/// and the background driver thread.
pub struct Driver {
    cfg: Mutex<Config>,
    cv: Condvar,
}

impl Driver {
    pub fn new() -> Self {
        Driver {
            cfg: Mutex::new(Config::default()),
            cv: Condvar::new(),
        }
    }

    /// Apply config pushed from the webview and wake the driver.
    #[allow(clippy::too_many_arguments)]
    pub fn configure(
        &self,
        enabled: bool,
        ignored_calendars: Vec<String>,
        ignored_lists: Vec<String>,
        show_next: bool,
        next_window_ms: i64,
        show_timers: bool,
        rotate_ms: u64,
        include_reminders: bool,
    ) {
        let mut cfg = self.cfg.lock().unwrap();
        cfg.enabled = enabled;
        cfg.ignored_calendars = ignored_calendars.into_iter().collect();
        cfg.ignored_lists = ignored_lists.into_iter().collect();
        cfg.show_next = show_next;
        cfg.next_window_ms = next_window_ms;
        cfg.show_timers = show_timers;
        cfg.rotate_ms = rotate_ms;
        cfg.include_reminders = include_reminders;
        cfg.generation = cfg.generation.wrapping_add(1);
        self.cv.notify_all();
    }

    /// Nudge the driver to recompute now (e.g. on an EventKit change).
    pub fn wake(&self) {
        let mut cfg = self.cfg.lock().unwrap();
        cfg.generation = cfg.generation.wrapping_add(1);
        self.cv.notify_all();
    }
}

/// Wake the managed driver from anywhere holding an `AppHandle`.
pub fn wake(app: &AppHandle) {
    if let Some(d) = app.try_state::<Arc<Driver>>() {
        d.wake();
    }
}

/// Spawn the background driver thread.
pub fn start(app: AppHandle, driver: Arc<Driver>) {
    std::thread::spawn(move || {
        let mut tick: u64 = 0;
        loop {
            // Snapshot config without holding the lock during the EventKit fetch.
            let (enabled, ignored_cals, ignored_lists, opts, generation) = {
                let cfg = driver.cfg.lock().unwrap();
                (
                    cfg.enabled,
                    cfg.ignored_calendars.clone(),
                    cfg.ignored_lists.clone(),
                    Opts {
                        show_next: cfg.show_next,
                        next_window_ms: cfg.next_window_ms,
                        show_timers: cfg.show_timers,
                        rotate_ms: cfg.rotate_ms,
                        include_reminders: cfg.include_reminders,
                    },
                    cfg.generation,
                )
            };

            if !enabled {
                tray::set_enabled(app.clone(), false);
                let cfg = driver.cfg.lock().unwrap();
                if cfg.generation == generation {
                    let _guard = driver.cv.wait(cfg);
                }
                continue;
            }

            let (highlight, items, sleep_ms) =
                compute(&ignored_cals, &ignored_lists, &opts, tick);
            tray::update(app.clone(), highlight, items);
            tick = tick.wrapping_add(1);

            let cfg = driver.cfg.lock().unwrap();
            if cfg.generation == generation {
                // Wait for the next boundary, or until config/EventKit changes.
                let _guard = driver.cv.wait_timeout(cfg, Duration::from_millis(sleep_ms));
            }
            // If the generation moved while we were computing, loop immediately.
        }
    });
}

fn parse_rfc3339_ms(s: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|d| d.timestamp_millis())
}

/// Minutes as `0m`, `12m`, `1h05m`.
fn fmt_mins(ms: i64) -> String {
    let mins = ms.max(0) / 60_000;
    if mins < 60 {
        format!("{mins}m")
    } else {
        format!("{}h{:02}m", mins / 60, mins % 60)
    }
}

/// Pill text for a NOW item: `NOW` or `NOW +12m`.
fn now_text(elapsed_ms: i64, show_timers: bool) -> String {
    if show_timers {
        format!("NOW +{}", fmt_mins(elapsed_ms))
    } else {
        "NOW".to_string()
    }
}

/// Pill text for a NEXT item: `NEXT` or `NEXT in 25m`.
fn next_text(remaining_ms: i64, show_timers: bool) -> String {
    if show_timers {
        format!("NEXT in {}", fmt_mins(remaining_ms))
    } else {
        "NEXT".to_string()
    }
}

/// Local-time `YYYY-MM-DDTHH:MM` → epoch millis.
fn parse_local_ms(s: &str) -> Option<i64> {
    let naive = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M").ok()?;
    Local
        .from_local_datetime(&naive)
        .earliest()
        .map(|d| d.timestamp_millis())
}

/// Today's [midnight, next-midnight) in local time, as RFC3339 UTC strings.
fn today_bounds() -> (String, String) {
    let now = Local::now();
    let start = now
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .and_then(|n| Local.from_local_datetime(&n).earliest())
        .map(|d| d.with_timezone(&Utc))
        .unwrap_or_else(Utc::now);
    let end = start + ChronoDuration::days(1);
    (start.to_rfc3339(), end.to_rfc3339())
}

struct Timed {
    item: TrayItem,
    start_ms: i64,
    end_ms: i64,
    current: bool,
    title: String,
}

/// Returns (the highlighted pill to show, agenda items, how long to sleep before
/// the next recompute).
fn compute(
    ignored_cals: &HashSet<String>,
    ignored_lists: &HashSet<String>,
    opts: &Opts,
    tick: u64,
) -> (Option<(Pill, String, String)>, Vec<TrayItem>, u64) {
    let (start_iso, end_iso) = today_bounds();
    let events = svc::fetch_events(start_iso, end_iso, None).unwrap_or_default();
    let reminders = if opts.include_reminders {
        svc::fetch_reminders(None, false).unwrap_or_default()
    } else {
        Vec::new()
    };

    let now = Local::now();
    let now_ms = now.timestamp_millis();
    let today = now.format("%Y-%m-%d").to_string();

    let mut all_day: Vec<TrayItem> = Vec::new();
    let mut timed: Vec<Timed> = Vec::new();

    for e in events {
        if let Some(cid) = &e.calendar_id {
            if ignored_cals.contains(cid) {
                continue;
            }
        }
        let title = if e.title.is_empty() { "(untitled)".to_string() } else { e.title };
        let id = e.id.unwrap_or_else(|| title.clone());
        if e.all_day {
            all_day.push(TrayItem {
                kind: "event".into(),
                id,
                label: format!("{EVENT_ICON}  {title}"),
            });
            continue;
        }
        let (Some(start_ms), Some(end_ms)) =
            (parse_rfc3339_ms(&e.start), parse_rfc3339_ms(&e.end))
        else {
            continue;
        };
        if end_ms < now_ms {
            continue; // past
        }
        let hhmm = e.start.get(11..16).unwrap_or("");
        timed.push(Timed {
            item: TrayItem {
                kind: "event".into(),
                id,
                label: format!("{EVENT_ICON}  {hhmm}  {title}"),
            },
            start_ms,
            end_ms,
            current: start_ms <= now_ms && now_ms < end_ms,
            title,
        });
    }

    for r in reminders {
        if r.completed {
            continue;
        }
        let Some(due) = r.due else { continue };
        if let Some(lid) = &r.list_id {
            if ignored_lists.contains(lid) {
                continue;
            }
        }
        if due.get(0..10) != Some(today.as_str()) {
            continue; // not due today
        }
        let title = if r.title.is_empty() { "(untitled)".to_string() } else { r.title };
        let id = r.id.unwrap_or_else(|| title.clone());
        if !due.contains('T') {
            all_day.push(TrayItem {
                kind: "reminder".into(),
                id,
                label: format!("{REMINDER_ICON}  {title}"),
            });
            continue;
        }
        let Some(due_ms) = parse_local_ms(&due) else { continue };
        if due_ms < now_ms {
            continue; // past
        }
        let hhmm = due.get(11..16).unwrap_or("");
        timed.push(Timed {
            item: TrayItem {
                kind: "reminder".into(),
                id,
                label: format!("{REMINDER_ICON}  {hhmm}  {title}"),
            },
            start_ms: due_ms,
            end_ms: due_ms + REMINDER_ACTIVE_MS,
            current: due_ms <= now_ms && now_ms < due_ms + REMINDER_ACTIVE_MS,
            title,
        });
    }

    timed.sort_by_key(|t| t.start_ms);

    // The rotation set: each current item as a NOW pill, plus (optionally) the next
    // upcoming item within the look-ahead window as a NEXT pill.
    let mut highlights: Vec<(Pill, String, String)> = timed
        .iter()
        .filter(|t| t.current)
        .map(|t| (Pill::Now, now_text(now_ms - t.start_ms, opts.show_timers), t.title.clone()))
        .collect();
    if opts.show_next {
        if let Some(t) = timed
            .iter()
            .find(|t| !t.current && t.start_ms > now_ms && t.start_ms <= now_ms + opts.next_window_ms)
        {
            highlights.push((
                Pill::Next,
                next_text(t.start_ms - now_ms, opts.show_timers),
                t.title.clone(),
            ));
        }
    }
    let highlight = if highlights.is_empty() {
        None
    } else {
        Some(highlights[(tick as usize) % highlights.len()].clone())
    };

    let mut items: Vec<TrayItem> = Vec::with_capacity(all_day.len() + timed.len());
    items.extend(all_day);
    items.extend(timed.iter().map(|t| t.item.clone()));

    // Next transition: the soonest future start/end among visible items.
    let mut next: Option<i64> = None;
    for t in &timed {
        for b in [t.start_ms, t.end_ms] {
            if b > now_ms {
                next = Some(next.map_or(b, |n| n.min(b)));
            }
        }
    }
    let mut sleep_ms = match next {
        Some(b) => ((b - now_ms) as u64).max(MIN_SLEEP_MS),
        None => MAX_SLEEP_MS,
    };
    if highlights.len() > 1 {
        sleep_ms = sleep_ms.min(opts.rotate_ms.max(MIN_SLEEP_MS)); // alternate pills
    }
    sleep_ms = sleep_ms.clamp(MIN_SLEEP_MS, MAX_SLEEP_MS);

    (highlight, items, sleep_ms)
}
