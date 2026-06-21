mod commands;
mod eventkit_service;
mod github_sync;
mod models;
mod tray;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::Emitter;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AboutInfo {
    version: String,
    build_epoch_ms: u64,
}

/// App version and build time (derived from the executable's modified time).
#[tauri::command]
fn about_info() -> AboutInfo {
    let build_epoch_ms = std::env::current_exe()
        .and_then(std::fs::metadata)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    AboutInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        build_epoch_ms,
    }
}

#[cfg(target_os = "macos")]
mod change_observer;

/// Start forwarding EventKit change notifications to the webview.
#[tauri::command]
fn start_change_observer(app: tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    change_observer::install(app);
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

// ── GitHub preference sync ──────────────────────────────────────────────────

async fn blocking<T, F>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("task join error: {e}"))?
}

#[tauri::command]
async fn github_device_start() -> Result<github_sync::DeviceStart, String> {
    blocking(github_sync::device_start).await
}

#[tauri::command]
async fn github_device_poll(
    device_code: String,
    interval: u64,
) -> Result<github_sync::Account, String> {
    blocking(move || github_sync::device_poll(device_code, interval)).await
}

#[tauri::command]
fn github_device_cancel() {
    github_sync::device_cancel();
}

// ── Menubar tray ────────────────────────────────────────────────────────────

#[tauri::command]
fn tray_update(app: tauri::AppHandle, title: Option<String>, items: Vec<tray::TrayItem>) {
    tray::update(app, title, items);
}

#[tauri::command]
fn tray_set_title(app: tauri::AppHandle, title: Option<String>) {
    tray::set_title(app, title);
}

#[tauri::command]
fn tray_set_enabled(app: tauri::AppHandle, enabled: bool) {
    tray::set_enabled(app, enabled);
}

#[tauri::command]
async fn github_account() -> Result<github_sync::Account, String> {
    blocking(github_sync::account).await
}

#[tauri::command]
async fn github_disconnect() -> Result<(), String> {
    blocking(github_sync::disconnect).await
}

#[tauri::command]
async fn sync_has_passphrase() -> Result<bool, String> {
    blocking(github_sync::has_passphrase).await
}

#[tauri::command]
async fn sync_set_passphrase(passphrase: String) -> Result<(), String> {
    blocking(move || github_sync::set_passphrase(passphrase)).await
}

#[tauri::command]
async fn sync_clear_passphrase() -> Result<(), String> {
    blocking(github_sync::clear_passphrase).await
}

#[tauri::command]
async fn gist_find() -> Result<Option<String>, String> {
    blocking(github_sync::gist_find).await
}

#[tauri::command]
async fn gist_pull(gist_id: String) -> Result<Option<String>, String> {
    blocking(move || github_sync::gist_pull(gist_id)).await
}

#[tauri::command]
async fn gist_push(payload: String, gist_id: Option<String>) -> Result<String, String> {
    blocking(move || github_sync::gist_push(payload, gist_id)).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .menu(|handle| {
            let about = MenuItem::with_id(handle, "about", "About FocalPlanner", true, None::<&str>)?;
            let app_menu = Submenu::with_items(
                handle,
                "FocalPlanner",
                true,
                &[
                    &about,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::hide(handle, None)?,
                    &PredefinedMenuItem::quit(handle, None)?,
                ],
            )?;
            let edit_menu = Submenu::with_items(
                handle,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(handle, None)?,
                    &PredefinedMenuItem::redo(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::cut(handle, None)?,
                    &PredefinedMenuItem::copy(handle, None)?,
                    &PredefinedMenuItem::paste(handle, None)?,
                    &PredefinedMenuItem::select_all(handle, None)?,
                ],
            )?;
            Menu::with_items(handle, &[&app_menu, &edit_menu])
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "about" {
                let _ = app.emit("menu-about", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            about_info,
            start_change_observer,
            github_device_start,
            github_device_poll,
            github_device_cancel,
            github_account,
            github_disconnect,
            sync_has_passphrase,
            sync_set_passphrase,
            sync_clear_passphrase,
            gist_find,
            gist_pull,
            gist_push,
            tray_update,
            tray_set_title,
            tray_set_enabled,
            commands::open_privacy_settings,
            commands::get_access_status,
            commands::request_access,
            commands::list_calendars,
            commands::fetch_events,
            commands::create_event,
            commands::update_event,
            commands::delete_event,
            commands::fetch_reminders,
            commands::create_reminder,
            commands::update_reminder,
            commands::set_reminder_completed,
            commands::delete_reminder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
