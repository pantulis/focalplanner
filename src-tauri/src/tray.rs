//! macOS menubar tray: shows the current event/reminder as the title and today's
//! agenda as a popup menu. Content is computed in the frontend and pushed here.

use serde::Deserialize;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, Wry,
};

const TRAY_ID: &str = "focal-tray";

#[derive(Deserialize, Clone)]
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

/// Which pill to draw (selects the fill color).
#[derive(Clone, Copy)]
pub enum Pill {
    Now,
    Next,
}

/// Rebuild the menu and set the menu-bar presentation. When `highlight` is
/// `Some((pill, pill_text, title))`, the icon becomes a rendered pill (red NOW /
/// green NEXT) carrying `pill_text`, and the event name is the (system-colored)
/// title text; otherwise the default app icon is restored and the title cleared.
pub fn update(app: AppHandle, highlight: Option<(Pill, String, String)>, items: Vec<TrayItem>) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let result = (|| -> tauri::Result<()> {
            ensure_tray(&handle)?;
            let tray = handle.tray_by_id(TRAY_ID).expect("tray was just ensured");
            let menu = build_menu(&handle, &items)?;
            tray.set_menu(Some(menu))?;

            #[cfg(target_os = "macos")]
            {
                if let Some((pill, pill_text, title)) = &highlight {
                    if let Some((rgba, w, h)) = render_pill_rgba(pill_text, *pill) {
                        let img = tauri::image::Image::new_owned(rgba, w, h);
                        tray.set_icon(Some(img))?;
                    }
                    // The event name is plain text so macOS colors it like other
                    // menu-bar apps; set_title(None) is a no-op so pass the string.
                    tray.set_title(Some(title))?;
                    tray.set_tooltip(Some(&format!("{pill_text} · {title}")))?;
                } else {
                    tray.set_icon(handle.default_window_icon().cloned())?;
                    tray.set_title(Some(""))?;
                    tray.set_tooltip(Some("FocalPlanner"))?;
                }
            }
            #[cfg(not(target_os = "macos"))]
            let _ = &highlight;

            tray.set_visible(true)?;
            Ok(())
        })();
        if let Err(e) = result {
            eprintln!("[tray] update failed: {e}");
        }
    });
}

/// Render the given pill text into a 2× RGBA bitmap (white text on red/green so the
/// image is appearance-independent; the event name is drawn separately as the
/// system-colored menu-bar title). Must run on the main thread.
#[cfg(target_os = "macos")]
fn render_pill_rgba(text: &str, pill: Pill) -> Option<(Vec<u8>, u32, u32)> {
    use objc2::runtime::AnyObject;
    use objc2::{AllocAnyThread, MainThreadMarker};
    use objc2_app_kit::{
        NSAttributedStringNSStringDrawing, NSBezierPath, NSBitmapFormat, NSBitmapImageRep, NSColor,
        NSDeviceRGBColorSpace, NSFont, NSFontAttributeName, NSForegroundColorAttributeName,
        NSGraphicsContext,
    };
    use objc2_core_foundation::{CGPoint, CGRect, CGSize};
    use objc2_foundation::{NSMutableAttributedString, NSRange, NSString};

    let _mtm = MainThreadMarker::new()?;
    const SCALE: f64 = 2.0;
    const H_PT: f64 = 18.0;
    let h_px = (H_PT * SCALE) as isize;

    unsafe {
        let font = NSFont::boldSystemFontOfSize(10.0 * SCALE);
        let white = NSColor::whiteColor();
        let fill = match pill {
            Pill::Now => NSColor::systemRedColor(),
            Pill::Next => NSColor::systemGreenColor(),
        };

        let ns = NSString::from_str(text);
        let label =
            NSMutableAttributedString::initWithString(NSMutableAttributedString::alloc(), &ns);
        let range = NSRange { location: 0, length: ns.length() };
        let font_obj: &AnyObject = &font;
        let white_obj: &AnyObject = &white;
        label.addAttribute_value_range(NSFontAttributeName, font_obj, range);
        label.addAttribute_value_range(NSForegroundColorAttributeName, white_obj, range);

        let text_size = label.size();

        // Layout (px): [edge][pill: padx text padx][edge]
        let padx = 7.0;
        let edge = 1.0;
        let pill_h = (H_PT * SCALE) - 6.0; // inset within the 18pt slot
        let pill_w = text_size.width + padx * 2.0;
        let w_px = (pill_w + edge * 2.0).ceil() as isize;

        let rep = NSBitmapImageRep::initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bitmapFormat_bytesPerRow_bitsPerPixel(
            NSBitmapImageRep::alloc(),
            std::ptr::null_mut(),
            w_px,
            h_px,
            8,
            4,
            true,
            false,
            NSDeviceRGBColorSpace,
            // Premultiplied (empty flags): required for an NSGraphicsContext bitmap
            // backing — a non-premultiplied rep makes graphicsContext… return nil.
            NSBitmapFormat::empty(),
            w_px * 4,
            32,
        )?;

        let ctx = NSGraphicsContext::graphicsContextWithBitmapImageRep(&rep)?;
        NSGraphicsContext::saveGraphicsState_class();
        NSGraphicsContext::setCurrentContext(Some(&ctx));

        let h = h_px as f64;
        let pill_rect = CGRect::new(
            CGPoint::new(edge, (h - pill_h) / 2.0),
            CGSize::new(pill_w, pill_h),
        );
        fill.set();
        let path = NSBezierPath::bezierPathWithRoundedRect_xRadius_yRadius(
            pill_rect,
            pill_h / 2.0,
            pill_h / 2.0,
        );
        path.fill();
        label.drawAtPoint(CGPoint::new(edge + padx, (h - text_size.height) / 2.0));

        NSGraphicsContext::restoreGraphicsState_class();

        // Extract RGBA
        let data = rep.bitmapData();
        if data.is_null() {
            return None;
        }
        let bytes_per_row = rep.bytesPerRow() as usize;
        let w = w_px as usize;
        let h_us = h_px as usize;
        // The backing is premultiplied RGBA; un-premultiply to straight alpha.
        let mut rgba = vec![0u8; w * h_us * 4];
        for y in 0..h_us {
            let row = data.add(y * bytes_per_row);
            for x in 0..w {
                let px = row.add(x * 4);
                let (r, g, b, a) = (*px, *px.add(1), *px.add(2), *px.add(3));
                let (r, g, b) = if a == 0 {
                    (0, 0, 0)
                } else {
                    let af = a as u32;
                    let un = |c: u8| ((c as u32 * 255 + af / 2) / af).min(255) as u8;
                    (un(r), un(g), un(b))
                };
                let di = (y * w + x) * 4;
                rgba[di] = r;
                rgba[di + 1] = g;
                rgba[di + 2] = b;
                rgba[di + 3] = a;
            }
        }
        Some((rgba, w_px as u32, h_px as u32))
    }
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
                let _ = tray.set_title(Some(""));
            }
        }
    });
}
