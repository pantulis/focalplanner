import { invoke } from "@tauri-apps/api/core";

// ── Types mirroring the Rust DTOs (camelCase) ─────────────────────────────

export type AuthStatus =
  | "notDetermined"
  | "restricted"
  | "denied"
  | "fullAccess"
  | "writeOnly"
  | "unknown";

export interface AccessStatus {
  events: AuthStatus;
  reminders: AuthStatus;
}

export interface CalendarDto {
  id: string;
  title: string;
  color: string | null;
  editable: boolean;
  account: string | null;
}

export interface CalendarSets {
  events: CalendarDto[];
  reminderLists: CalendarDto[];
}

export interface EventDto {
  id: string | null;
  title: string;
  start: string; // RFC3339
  end: string; // RFC3339
  allDay: boolean;
  calendarId: string | null;
  calendarTitle: string | null;
  color: string | null;
  notes: string | null;
  location: string | null;
  url: string | null;
}

export interface ReminderDto {
  id: string | null;
  title: string;
  completed: boolean;
  recurring: boolean;
  due: string | null; // YYYY-MM-DDTHH:MM or YYYY-MM-DD
  priority: number;
  listId: string | null;
  listTitle: string | null;
  color: string | null;
  notes: string | null;
}

export interface EventInput {
  id?: string | null;
  title: string;
  start: string; // RFC3339
  end: string; // RFC3339
  allDay: boolean;
  calendarId?: string | null;
  notes?: string | null;
  location?: string | null;
}

export interface ReminderInput {
  id?: string | null;
  title: string;
  due?: string | null;
  priority: number;
  listId?: string | null;
  notes?: string | null;
}

// ── Command wrappers ──────────────────────────────────────────────────────

export interface DeviceStart {
  userCode: string;
  verificationUri: string;
  deviceCode: string;
  interval: number;
  expiresIn: number;
}

export interface GithubAccount {
  connected: boolean;
  login: string | null;
}

export interface AboutInfo {
  version: string;
  buildEpochMs: number;
}

export const api = {
  startChangeObserver: () => invoke<void>("start_change_observer"),
  aboutInfo: () => invoke<AboutInfo>("about_info"),
  openPrivacySettings: () => invoke<void>("open_privacy_settings"),

  // GitHub preference sync
  githubDeviceStart: () => invoke<DeviceStart>("github_device_start"),
  githubDevicePoll: (deviceCode: string, interval: number) =>
    invoke<GithubAccount>("github_device_poll", { deviceCode, interval }),
  githubDeviceCancel: () => invoke<void>("github_device_cancel"),
  githubAccount: () => invoke<GithubAccount>("github_account"),
  githubDisconnect: () => invoke<void>("github_disconnect"),
  syncHasPassphrase: () => invoke<boolean>("sync_has_passphrase"),
  syncSetPassphrase: (passphrase: string) =>
    invoke<void>("sync_set_passphrase", { passphrase }),
  syncClearPassphrase: () => invoke<void>("sync_clear_passphrase"),
  gistFind: () => invoke<string | null>("gist_find"),
  gistPull: (gistId: string) => invoke<string | null>("gist_pull", { gistId }),
  gistPush: (payload: string, gistId: string | null) =>
    invoke<string>("gist_push", { payload, gistId }),
  getAccessStatus: () => invoke<AccessStatus>("get_access_status"),
  requestAccess: () => invoke<AccessStatus>("request_access"),
  listCalendars: () => invoke<CalendarSets>("list_calendars"),

  fetchEvents: (start: string, end: string, calendarIds?: string[]) =>
    invoke<EventDto[]>("fetch_events", { start, end, calendarIds: calendarIds ?? null }),
  createEvent: (input: EventInput) => invoke<void>("create_event", { input }),
  updateEvent: (input: EventInput) => invoke<void>("update_event", { input }),
  deleteEvent: (id: string) => invoke<void>("delete_event", { id }),

  fetchReminders: (listIds: string[] | undefined, includeCompleted: boolean) =>
    invoke<ReminderDto[]>("fetch_reminders", {
      listIds: listIds ?? null,
      includeCompleted,
    }),
  createReminder: (input: ReminderInput) => invoke<void>("create_reminder", { input }),
  updateReminder: (input: ReminderInput) => invoke<void>("update_reminder", { input }),
  setReminderCompleted: (id: string, completed: boolean) =>
    invoke<void>("set_reminder_completed", { id, completed }),
  deleteReminder: (id: string) => invoke<void>("delete_reminder", { id }),
};
