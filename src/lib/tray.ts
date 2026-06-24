import { useEffect } from "react";
import { api } from "./api";

export interface MenubarConfig {
  enabled: boolean;
  ignoredCalendarIds: string[];
  ignoredListIds: string[];
  showNext: boolean;
  nextWindowHours: number;
  showTimers: boolean;
  rotateSeconds: number;
  includeReminders: boolean;
}

/**
 * Drives the macOS menu-bar tray. The actual computation/refresh lives in the
 * native Rust driver (src-tauri/src/menubar.rs) so the menu bar stays correct
 * even while the window is hidden and the webview's JS timers are suspended.
 * Here we only push configuration whenever it changes.
 */
export function useMenubarTray(cfg: MenubarConfig) {
  const key = JSON.stringify(cfg);
  useEffect(() => {
    void api.trayConfigure(cfg);
    // `key` captures every field of cfg; re-push only when something changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
