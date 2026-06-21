//! macOS menubar tray: shows the current event/reminder as the title and today's
//! agenda as a popup menu. Content is computed in the frontend and pushed here.

use serde::Deserialize;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, Wry,
};

const TRAY_ID: &str = "focal-tray";

#[derive(Deserialize)]
pub struct TrayItem {
    pub kind: String, // "event" | "reminder"
    pub id: String,
    pub label: String,
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn ensure_tray(app: &AppHandle) -> tauri::Result<()> {
    if app.tray_by_id(TRAY_ID).is_some() {
        return Ok(());
    }
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("FocalPlanner")
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if id == "tray-open" {
                show_main(app);
            } else if let Some(rest) = id.strip_prefix("tray-item:") {
                show_main(app);
                let _ = app.emit("tray-open-item", rest.to_string());
            }
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

fn build_menu(app: &AppHandle, items: &[TrayItem]) -> tauri::Result<tauri::menu::Menu<Wry>> {
    let mut mb = MenuBuilder::new(app);
    if items.is_empty() {
        let none = MenuItemBuilder::with_id("tray-none", "No upcoming items today")
            .enabled(false)
            .build(app)?;
        mb = mb.item(&none);
    } else {
        for it in items {
            mb = mb.text(format!("tray-item:{}:{}", it.kind, it.id), &it.label);
        }
    }
    let quit = PredefinedMenuItem::quit(app, Some("Quit FocalPlanner"))?;
    mb.separator()
        .text("tray-open", "Open FocalPlanner")
        .item(&quit)
        .build()
}

/// Set the title + menu (rebuilds the menu); ensures the tray exists and is visible.
pub fn update(app: AppHandle, title: Option<String>, items: Vec<TrayItem>) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let result = (|| -> tauri::Result<()> {
            ensure_tray(&handle)?;
            let tray = handle
                .tray_by_id(TRAY_ID)
                .expect("tray was just ensured");
            let menu = build_menu(&handle, &items)?;
            tray.set_menu(Some(menu))?;
            #[cfg(target_os = "macos")]
            tray.set_title(title.as_deref())?;
            #[cfg(not(target_os = "macos"))]
            let _ = title;
            tray.set_visible(true)?;
            Ok(())
        })();
        if let Err(e) = result {
            eprintln!("[tray] update failed: {e}");
        }
    });
}

/// Cheap title-only update (used for the 10s rotation across simultaneous items).
pub fn set_title(app: AppHandle, title: Option<String>) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(_tray) = handle.tray_by_id(TRAY_ID) {
            #[cfg(target_os = "macos")]
            let _ = _tray.set_title(title.as_deref());
            #[cfg(not(target_os = "macos"))]
            let _ = title;
        }
    });
}

pub fn set_enabled(app: AppHandle, enabled: bool) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if enabled {
            let _ = ensure_tray(&handle);
        }
        if let Some(tray) = handle.tray_by_id(TRAY_ID) {
            let _ = tray.set_visible(enabled);
            #[cfg(target_os = "macos")]
            if !enabled {
                let _ = tray.set_title(None::<&str>);
            }
        }
    });
}
