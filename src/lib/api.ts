import { invoke } from "@tauri-apps/api/core";
import { demoApi, isDemoActive } from "./demo/store";

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

export type ParticipantStatus =
  | "accepted"
  | "declined"
  | "tentative"
  | "pending"
  | "unknown"
  | "delegated"
  | "completed"
  | "inProcess";

export interface ParticipantDto {
  name: string | null;
  status: ParticipantStatus;
  isCurrentUser: boolean;
  isOrganizer: boolean;
}

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurrenceDto {
  frequency: RecurrenceFrequency;
  interval: number;
  /** Weekdays for weekly rules (0 = Sunday … 6 = Saturday). */
  daysOfWeek: number[];
  /** End date as "YYYY-MM-DD", when the rule ends on a date. */
  endDate: string | null;
  /** Occurrence count, when the rule ends after a number of times. */
  count: number | null;
}

/** Recurrence as submitted from an inspector; null clears any rule. */
export interface RecurrenceInput {
  frequency: RecurrenceFrequency;
  interval: number;
  daysOfWeek?: number[];
  endDate?: string | null;
  count?: number | null;
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
  recurring: boolean;
  recurrence: RecurrenceDto | null;
  /** Current user is an attendee who hasn't responded (invitation awaiting RSVP). */
  needsResponse: boolean;
  /** Attendees (organizer first when known) with their RSVP status. */
  participants: ParticipantDto[];
}

export interface ReminderDto {
  id: string | null;
  title: string;
  completed: boolean;
  recurring: boolean;
  recurrence: RecurrenceDto | null;
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
  recurrence?: RecurrenceInput | null;
}

export interface ReminderInput {
  id?: string | null;
  title: string;
  due?: string | null;
  priority: number;
  listId?: string | null;
  notes?: string | null;
  recurrence?: RecurrenceInput | null;
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
  devBuild: boolean;
}

export interface TrayItemDto {
  kind: "event" | "reminder";
  id: string;
  label: string;
}

export const api = {
  startChangeObserver: () => invoke<void>("start_change_observer"),
  aboutInfo: () => invoke<AboutInfo>("about_info"),
  /** Reflect the "show hidden events" toggle as a checkmark in the native View menu. */
  setHiddenEventsChecked: (checked: boolean) =>
    invoke<void>("set_hidden_events_checked", { checked }).catch(() => {}),
  openPrivacySettings: () => invoke<void>("open_privacy_settings"),
  openCalendar: (date?: string | null) =>
    invoke<void>("open_calendar", { date: date ?? null }),

  // Menubar tray
  trayUpdate: (title: string | null, items: TrayItemDto[]) =>
    invoke<void>("tray_update", { title, items }),
  traySetTitle: (title: string | null) => invoke<void>("tray_set_title", { title }),
  traySetEnabled: (enabled: boolean) => invoke<void>("tray_set_enabled", { enabled }),

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
  getAccessStatus: () =>
    isDemoActive() ? demoApi.getAccessStatus() : invoke<AccessStatus>("get_access_status"),
  requestAccess: () =>
    isDemoActive() ? demoApi.getAccessStatus() : invoke<AccessStatus>("request_access"),
  listCalendars: () =>
    isDemoActive() ? demoApi.listCalendars() : invoke<CalendarSets>("list_calendars"),

  fetchEvents: (start: string, end: string, calendarIds?: string[]) =>
    isDemoActive()
      ? demoApi.fetchEvents(start, end, calendarIds)
      : invoke<EventDto[]>("fetch_events", { start, end, calendarIds: calendarIds ?? null }),
  createEvent: (input: EventInput) =>
    isDemoActive() ? demoApi.createEvent(input) : invoke<void>("create_event", { input }),
  updateEvent: (input: EventInput) =>
    isDemoActive() ? demoApi.updateEvent(input) : invoke<void>("update_event", { input }),
  deleteEvent: (id: string) =>
    isDemoActive() ? demoApi.deleteEvent(id) : invoke<void>("delete_event", { id }),

  fetchReminders: (listIds: string[] | undefined, includeCompleted: boolean) =>
    isDemoActive()
      ? demoApi.fetchReminders(listIds, includeCompleted)
      : invoke<ReminderDto[]>("fetch_reminders", {
          listIds: listIds ?? null,
          includeCompleted,
        }),
  createReminder: (input: ReminderInput) =>
    isDemoActive() ? demoApi.createReminder(input) : invoke<void>("create_reminder", { input }),
  updateReminder: (input: ReminderInput) =>
    isDemoActive() ? demoApi.updateReminder(input) : invoke<void>("update_reminder", { input }),
  setReminderCompleted: (id: string, completed: boolean) =>
    isDemoActive()
      ? demoApi.setReminderCompleted(id, completed)
      : invoke<void>("set_reminder_completed", { id, completed }),
  deleteReminder: (id: string) =>
    isDemoActive() ? demoApi.deleteReminder(id) : invoke<void>("delete_reminder", { id }),
};
