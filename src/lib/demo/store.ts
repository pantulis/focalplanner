import { useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { addDays, format, setHours, setMinutes, startOfDay, subDays } from "date-fns";
import type {
  AccessStatus,
  CalendarDto,
  CalendarSets,
  EventDto,
  EventInput,
  ReminderDto,
  ReminderInput,
} from "../api";
import type { AreaConfig } from "../areas";
import { DEFAULT_SETTINGS, type Settings } from "../settings";
import { DEMO_SEED, DEMO_SETTINGS, type DemoSeed } from "./seed";

// ── Persistence keys ────────────────────────────────────────────────────────
const K_ACTIVE = "fp:demo:active";
const K_DATA = "fp:demo:data";
const K_SETTINGS = "fp:demo:settings";
const K_AREAS = "fp:demo:areas";

interface Dataset {
  calendars: CalendarDto[];
  lists: CalendarDto[];
  events: EventDto[];
  reminders: ReminderDto[];
}

// ── Materialization (seed → concrete data anchored to `anchor`) ──────────────

function atTime(anchor: Date, dayOffset: number, time?: string): Date {
  const base = startOfDay(addDays(anchor, dayOffset));
  if (!time) return base;
  const [h, m] = time.split(":").map(Number);
  return setMinutes(setHours(base, h), m);
}

function materialize(seed: DemoSeed, anchor: Date): {
  data: Dataset;
  areaConfig: AreaConfig;
  reviewedAt: Record<string, string>;
} {
  const calendars: CalendarDto[] = seed.calendars.map((c) => ({
    id: c.id,
    title: c.title,
    color: c.color,
    editable: c.editable,
    account: c.account,
  }));
  const lists: CalendarDto[] = seed.lists.map((l) => ({
    id: l.id,
    title: l.title,
    color: l.color,
    editable: l.editable,
    account: l.account,
  }));
  const calById = new Map(seed.calendars.map((c) => [c.id, c]));
  const listById = new Map(seed.lists.map((l) => [l.id, l]));

  const events: EventDto[] = seed.events.map((e, i) => {
    const cal = calById.get(e.calendarId);
    const start = e.allDay
      ? startOfDay(addDays(anchor, e.dayOffset))
      : atTime(anchor, e.dayOffset, e.start);
    const end = e.allDay
      ? startOfDay(addDays(anchor, (e.endDayOffset ?? e.dayOffset) + 1))
      : atTime(anchor, e.dayOffset, e.end ?? e.start);
    return {
      id: `dem-evt-${i + 1}`,
      title: e.title,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: !!e.allDay,
      calendarId: e.calendarId,
      calendarTitle: cal?.title ?? null,
      color: cal?.color ?? null,
      notes: e.notes ?? null,
      location: e.location ?? null,
      url: e.url ?? null,
    };
  });

  const reminders: ReminderDto[] = seed.reminders.map((r, i) => {
    const list = listById.get(r.listId);
    let due: string | null = null;
    if (r.dueOffset !== null && r.dueOffset !== undefined) {
      const d = addDays(anchor, r.dueOffset);
      due = r.dueTime ? `${format(d, "yyyy-MM-dd")}T${r.dueTime}` : format(d, "yyyy-MM-dd");
    }
    return {
      id: `dem-rem-${i + 1}`,
      title: r.title,
      completed: !!r.completed,
      recurring: !!r.recurring,
      due,
      priority: r.priority ?? 0,
      listId: r.listId,
      listTitle: list?.title ?? null,
      color: list?.color ?? null,
      notes: r.notes ?? null,
    };
  });

  // Area config from each calendar/list's `area`.
  const areaConfig: AreaConfig = {};
  const ensure = (a: string) =>
    (areaConfig[a] ??= { calendarIds: [], listIds: [] });
  for (const c of seed.calendars) ensure(c.area).calendarIds.push(c.id);
  for (const l of seed.lists) ensure(l.area).listIds.push(l.id);

  const reviewedAt: Record<string, string> = {};
  for (const [area, daysAgo] of Object.entries(seed.reviewedDaysAgo)) {
    if (daysAgo != null) reviewedAt[area] = subDays(anchor, daysAgo).toISOString();
  }

  return { data: { calendars, lists, events, reminders }, areaConfig, reviewedAt };
}

// ── Demo state (module singleton + subscription) ────────────────────────────

let active = typeof localStorage !== "undefined" && localStorage.getItem(K_ACTIVE) === "1";
let dataset: Dataset | null = null;
const subscribers = new Set<() => void>();

function emit() {
  for (const cb of subscribers) cb();
}

export function isDemoActive(): boolean {
  return active;
}

function persistData() {
  if (dataset) localStorage.setItem(K_DATA, JSON.stringify(dataset));
}

function getDataset(): Dataset {
  if (dataset) return dataset;
  const raw = localStorage.getItem(K_DATA);
  if (raw) {
    dataset = JSON.parse(raw) as Dataset;
    return dataset;
  }
  // Fallback (shouldn't happen while active): regenerate fresh.
  const m = materialize(DEMO_SEED, new Date());
  dataset = m.data;
  persistData();
  return dataset;
}

/** Switch Demo Mode on, regenerating the dataset anchored to now. */
export function enterDemo(anchor: Date = new Date()) {
  const { data, areaConfig, reviewedAt } = materialize(DEMO_SEED, anchor);
  dataset = data;
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...DEMO_SETTINGS,
    ignoredCalendarIds: [],
    ignoredListIds: [],
    areaReviewedAt: reviewedAt,
  };
  localStorage.setItem(K_DATA, JSON.stringify(data));
  localStorage.setItem(K_SETTINGS, JSON.stringify(settings));
  localStorage.setItem(K_AREAS, JSON.stringify(areaConfig));
  localStorage.setItem(K_ACTIVE, "1");
  active = true;
  emit();
}

/** Switch Demo Mode off and discard the sample data. */
export function exitDemo() {
  active = false;
  dataset = null;
  localStorage.removeItem(K_ACTIVE);
  localStorage.removeItem(K_DATA);
  localStorage.removeItem(K_SETTINGS);
  localStorage.removeItem(K_AREAS);
  emit();
}

function subscribe(cb: () => void) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/** React hook: re-renders when Demo Mode is toggled. */
export function useDemoActive(): boolean {
  return useSyncExternalStore(subscribe, isDemoActive, () => false);
}

/** Toggle helper that also clears the React Query cache so views refetch. */
export function useDemoController() {
  const qc = useQueryClient();
  const isActive = useDemoActive();
  return {
    active: isActive,
    enter: () => {
      enterDemo();
      qc.clear();
    },
    exit: () => {
      exitDemo();
      qc.clear();
    },
  };
}

// ── Demo settings / area-config (full sandbox) ──────────────────────────────

export function loadDemoSettings(): Settings {
  try {
    const raw = localStorage.getItem(K_SETTINGS);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS, ...DEMO_SETTINGS };
}

export function saveDemoSettings(settings: Settings) {
  localStorage.setItem(K_SETTINGS, JSON.stringify(settings));
}

export function loadDemoAreaConfig(): AreaConfig {
  try {
    const raw = localStorage.getItem(K_AREAS);
    if (raw) return JSON.parse(raw) as AreaConfig;
  } catch {
    /* ignore */
  }
  return {};
}

export function saveDemoAreaConfig(config: AreaConfig) {
  localStorage.setItem(K_AREAS, JSON.stringify(config));
}

// ── Demo backend (mirrors the `api` read/write surface) ─────────────────────

const overlaps = (e: EventDto, start: string, end: string) =>
  e.start < end && e.end > start;

export const demoApi = {
  getAccessStatus: async (): Promise<AccessStatus> => ({
    events: "fullAccess",
    reminders: "fullAccess",
  }),

  listCalendars: async (): Promise<CalendarSets> => {
    const d = getDataset();
    return { events: d.calendars, reminderLists: d.lists };
  },

  fetchEvents: async (
    start: string,
    end: string,
    calendarIds?: string[],
  ): Promise<EventDto[]> => {
    const d = getDataset();
    const ids = calendarIds ? new Set(calendarIds) : null;
    return d.events.filter(
      (e) => overlaps(e, start, end) && (!ids || (e.calendarId != null && ids.has(e.calendarId))),
    );
  },

  createEvent: async (input: EventInput): Promise<void> => {
    const d = getDataset();
    const cal = d.calendars.find((c) => c.id === input.calendarId);
    d.events.push({
      id: `dem-evt-${Date.now()}`,
      title: input.title,
      start: input.start,
      end: input.end,
      allDay: input.allDay,
      calendarId: input.calendarId ?? null,
      calendarTitle: cal?.title ?? null,
      color: cal?.color ?? null,
      notes: input.notes ?? null,
      location: input.location ?? null,
      url: null,
    });
    persistData();
  },

  updateEvent: async (input: EventInput): Promise<void> => {
    const d = getDataset();
    const e = d.events.find((x) => x.id === input.id);
    if (!e) return;
    const cal = d.calendars.find((c) => c.id === input.calendarId);
    Object.assign(e, {
      title: input.title,
      start: input.start,
      end: input.end,
      allDay: input.allDay,
      calendarId: input.calendarId ?? e.calendarId,
      calendarTitle: cal?.title ?? e.calendarTitle,
      color: cal?.color ?? e.color,
      notes: input.notes ?? null,
      location: input.location ?? null,
    });
    persistData();
  },

  deleteEvent: async (id: string): Promise<void> => {
    const d = getDataset();
    d.events = d.events.filter((e) => e.id !== id);
    persistData();
  },

  fetchReminders: async (
    listIds: string[] | undefined,
    includeCompleted: boolean,
  ): Promise<ReminderDto[]> => {
    const d = getDataset();
    const ids = listIds ? new Set(listIds) : null;
    return d.reminders.filter(
      (r) =>
        (!ids || (r.listId != null && ids.has(r.listId))) &&
        (includeCompleted || !r.completed),
    );
  },

  createReminder: async (input: ReminderInput): Promise<void> => {
    const d = getDataset();
    const list = d.lists.find((l) => l.id === input.listId);
    d.reminders.push({
      id: `dem-rem-${Date.now()}`,
      title: input.title,
      completed: false,
      recurring: false,
      due: input.due ?? null,
      priority: input.priority,
      listId: input.listId ?? null,
      listTitle: list?.title ?? null,
      color: list?.color ?? null,
      notes: input.notes ?? null,
    });
    persistData();
  },

  updateReminder: async (input: ReminderInput): Promise<void> => {
    const d = getDataset();
    const r = d.reminders.find((x) => x.id === input.id);
    if (!r) return;
    const list = d.lists.find((l) => l.id === input.listId);
    Object.assign(r, {
      title: input.title,
      due: input.due ?? null,
      priority: input.priority,
      listId: input.listId ?? r.listId,
      listTitle: list?.title ?? r.listTitle,
      color: list?.color ?? r.color,
      notes: input.notes ?? null,
    });
    persistData();
  },

  setReminderCompleted: async (id: string, completed: boolean): Promise<void> => {
    const d = getDataset();
    const r = d.reminders.find((x) => x.id === id);
    if (r) r.completed = completed;
    persistData();
  },

  deleteReminder: async (id: string): Promise<void> => {
    const d = getDataset();
    d.reminders = d.reminders.filter((r) => r.id !== id);
    persistData();
  },
};
