//! Reactive bridge: observe EventKit's `EKEventStoreChanged` notification and
//! forward it to the webview as a `eventkit-changed` Tauri event.
//!
//! EventKit only posts change notifications while a live `EKEventStore` exists
//! in the process, so we keep one alive for the app's lifetime. The notification
//! is coalesced and untyped ("something changed"), so the frontend refetches.

use core::ptr::NonNull;
use std::sync::atomic::{AtomicBool, Ordering};

use block2::RcBlock;
use objc2_foundation::{NSNotification, NSNotificationCenter, NSOperationQueue, NSString};
use tauri::{AppHandle, Emitter};

static INSTALLED: AtomicBool = AtomicBool::new(false);

/// Install the observer once. Safe to call multiple times.
pub fn install(app: AppHandle) {
    if INSTALLED.swap(true, Ordering::SeqCst) {
        return;
    }

    // Do the setup off the main thread: the synchronous access request must not
    // block the main run loop (its completion is delivered on another queue).
    std::thread::spawn(move || {
        let store = match eventkit::EKEventStore::new() {
            Ok(store) => store,
            Err(_) => return,
        };
        // Activate change tracking for this long-lived store. Access is already
        // granted by the time this runs, so these return without prompting.
        let _ = store.request_full_access_to_events();
        let _ = store.request_full_access_to_reminders();
        // Keep it alive for the app's lifetime so EventKit keeps posting changes.
        std::mem::forget(store);

        let block = RcBlock::new(move |_note: NonNull<NSNotification>| {
            let _ = app.emit("eventkit-changed", ());
            // Refresh the native menu-bar driver too (the webview may be suspended).
            crate::menubar::wake(&app);
        });

        unsafe {
            let center = NSNotificationCenter::defaultCenter();
            let name = NSString::from_str(eventkit::EK_EVENT_STORE_CHANGED_NOTIFICATION);
            let queue = NSOperationQueue::mainQueue();
            let token = center.addObserverForName_object_queue_usingBlock(
                Some(&name),
                None,
                Some(&queue),
                &block,
            );
            // Token and block must outlive this scope to stay registered.
            std::mem::forget(token);
        }
        std::mem::forget(block);
    });
}
