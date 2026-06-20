//! Tauri command surface.
//!
//! Each command offloads the `!Send` EventKit work to a blocking task and maps
//! errors to `String` so they cross the IPC boundary as plain messages.

use crate::eventkit_service as svc;
use crate::models::{AccessStatus, CalendarSets, EventDto, EventInput, ReminderDto, ReminderInput};

/// Run a blocking EventKit closure off the main thread and flatten errors to `String`.
async fn run<T, F>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, eventkit::EventKitError> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("task join error: {e}"))?
        .map_err(|e| e.to_string())
}

/// Open the macOS Privacy & Security settings pane for Calendars.
#[tauri::command]
pub fn open_privacy_settings() -> Result<(), String> {
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars")
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_access_status() -> Result<AccessStatus, String> {
    run(svc::access_status).await
}

#[tauri::command]
pub async fn request_access() -> Result<AccessStatus, String> {
    run(svc::request_access).await
}

#[tauri::command]
pub async fn list_calendars() -> Result<CalendarSets, String> {
    run(svc::list_calendars).await
}

#[tauri::command]
pub async fn fetch_events(
    start: String,
    end: String,
    calendar_ids: Option<Vec<String>>,
) -> Result<Vec<EventDto>, String> {
    run(move || svc::fetch_events(start, end, calendar_ids)).await
}

#[tauri::command]
pub async fn create_event(input: EventInput) -> Result<(), String> {
    run(move || svc::create_event(input)).await
}

#[tauri::command]
pub async fn update_event(input: EventInput) -> Result<(), String> {
    run(move || svc::update_event(input)).await
}

#[tauri::command]
pub async fn delete_event(id: String) -> Result<(), String> {
    run(move || svc::delete_event(id)).await
}

#[tauri::command]
pub async fn fetch_reminders(
    list_ids: Option<Vec<String>>,
    include_completed: bool,
) -> Result<Vec<ReminderDto>, String> {
    run(move || svc::fetch_reminders(list_ids, include_completed)).await
}

#[tauri::command]
pub async fn create_reminder(input: ReminderInput) -> Result<(), String> {
    run(move || svc::create_reminder(input)).await
}

#[tauri::command]
pub async fn update_reminder(input: ReminderInput) -> Result<(), String> {
    run(move || svc::update_reminder(input)).await
}

#[tauri::command]
pub async fn set_reminder_completed(id: String, completed: bool) -> Result<(), String> {
    run(move || svc::set_reminder_completed(id, completed)).await
}

#[tauri::command]
pub async fn delete_reminder(id: String) -> Result<(), String> {
    run(move || svc::delete_reminder(id)).await
}
