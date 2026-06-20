import {
  addDays,
  addWeeks,
  format,
  parseISO,
  startOfDay,
  startOfToday,
  startOfWeek,
} from "date-fns";
import type { EventDto, ReminderDto } from "./api";

export type PlannerView = "agenda" | "day" | "week";

export const HOUR_HEIGHT = 48; // px per hour in the time grid
export const DAY_MINUTES = 24 * 60;
/** Visual/layout height for a (zero-duration) timed reminder. */
export const REMINDER_SLOT_MINUTES = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// ── View ranges & navigation ──────────────────────────────────────────────

export type WeekStart = 0 | 1;

/** Inclusive-start / exclusive-end ISO range the events query should fetch. */
export function viewRange(
  view: PlannerView,
  anchor: Date,
  weekStartsOn: WeekStart = 0,
): { start: string; end: string } {
  if (view === "day") {
    const s = startOfDay(anchor);
    return { start: s.toISOString(), end: addDays(s, 1).toISOString() };
  }
  if (view === "week") {
    const s = startOfWeek(anchor, { weekStartsOn });
    return { start: s.toISOString(), end: addDays(s, 7).toISOString() };
  }
  const s = startOfToday();
  return { start: s.toISOString(), end: addDays(s, 30).toISOString() };
}

/** The day columns rendered for a given view. */
export function viewDays(
  view: PlannerView,
  anchor: Date,
  weekStartsOn: WeekStart = 0,
): Date[] {
  if (view === "week") {
    const s = startOfWeek(anchor, { weekStartsOn });
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }
  return [startOfDay(anchor)];
}

export function navigate(view: PlannerView, anchor: Date, dir: -1 | 1): Date {
  return view === "week" ? addWeeks(anchor, dir) : addDays(anchor, dir);
}

export function viewLabel(
  view: PlannerView,
  anchor: Date,
  weekStartsOn: WeekStart = 0,
): string {
  if (view === "agenda") return "Next 30 days";
  if (view === "day") return format(anchor, "EEEE, MMMM d, yyyy");
  const s = startOfWeek(anchor, { weekStartsOn });
  const e = addDays(s, 6);
  const sameMonth = s.getMonth() === e.getMonth();
  return sameMonth
    ? `${format(s, "MMM d")} – ${format(e, "d, yyyy")}`
    : `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`;
}

// ── Timed layout within a day column (events + reminders) ─────────────────

export type GridBlockKind = "event" | "reminder";

export interface GridBlock {
  kind: GridBlockKind;
  id: string;
  title: string;
  color: string | null;
  startMin: number; // minutes from day start (0–1440)
  endMin: number;
  col: number; // column index within its overlap cluster
  cols: number; // total columns in that cluster
  // events only:
  event?: EventDto;
  continuesBefore?: boolean; // started on an earlier day (clamped)
  continuesAfter?: boolean; // ends on a later day (clamped)
  // reminders only:
  reminder?: ReminderDto;
  completed?: boolean;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface LayoutItem {
  startMin: number;
  endMin: number;
}

/** Greedy interval-partition: assign each item the first free column within its overlap cluster. */
function assignColumns<T extends LayoutItem>(items: T[]): (T & { col: number; cols: number })[] {
  const sorted = [...items].sort(
    (a, b) => a.startMin - b.startMin || b.endMin - a.endMin,
  );
  const out: (T & { col: number; cols: number })[] = [];
  let cluster: T[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const colEnds: number[] = [];
    const placed: { item: T; col: number }[] = [];
    for (const item of cluster) {
      let c = 0;
      while (c < colEnds.length && colEnds[c] > item.startMin) c++;
      colEnds[c] = item.endMin;
      placed.push({ item, col: c });
    }
    const cols = colEnds.length;
    for (const p of placed) out.push({ ...p.item, col: p.col, cols });
    cluster = [];
  };

  for (const item of sorted) {
    if (cluster.length && item.startMin >= clusterEnd) {
      flush();
      clusterEnd = item.endMin;
    } else if (cluster.length === 0) {
      clusterEnd = item.endMin;
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  if (cluster.length) flush();
  return out;
}

/** Local due Date of a reminder if it has a *timed* due (not date-only), else null. */
function reminderDueDate(r: ReminderDto): Date | null {
  if (!r.due || !r.due.includes("T")) return null;
  const d = parseISO(r.due);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Timed events and timed reminders overlapping `day`, laid out together so they
 * share overlap columns (and never visually collide).
 */
export function dayGridBlocks(
  events: EventDto[],
  reminders: ReminderDto[],
  day: Date,
): GridBlock[] {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + DAY_MS;

  const eventItems = events
    .filter((e) => !e.allDay)
    .map((e) => ({ event: e, s: parseISO(e.start).getTime(), en: parseISO(e.end).getTime() }))
    .filter((x) => x.en > dayStart && x.s < dayEnd)
    .map((x): GridBlock => {
      const startMin = Math.max(0, Math.round((x.s - dayStart) / 60000));
      let endMin = Math.min(DAY_MINUTES, Math.round((x.en - dayStart) / 60000));
      if (endMin <= startMin) endMin = startMin + 30;
      return {
        kind: "event",
        id: x.event.id ?? `${x.event.title}-${startMin}`,
        title: x.event.title,
        color: x.event.color,
        startMin,
        endMin,
        col: 0,
        cols: 1,
        event: x.event,
        continuesBefore: x.s < dayStart,
        continuesAfter: x.en > dayEnd,
      };
    });

  const reminderItems = reminders
    .map((r) => ({ reminder: r, due: reminderDueDate(r) }))
    .filter((x): x is { reminder: ReminderDto; due: Date } => x.due !== null)
    .filter((x) => startOfDay(x.due).getTime() === dayStart)
    .map((x): GridBlock => {
      const startMin = x.due.getHours() * 60 + x.due.getMinutes();
      return {
        kind: "reminder",
        id: x.reminder.id ?? `${x.reminder.title}-${startMin}`,
        title: x.reminder.title,
        color: x.reminder.color,
        startMin,
        endMin: Math.min(startMin + REMINDER_SLOT_MINUTES, DAY_MINUTES),
        col: 0,
        cols: 1,
        reminder: x.reminder,
        completed: x.reminder.completed,
      };
    });

  return assignColumns([...eventItems, ...reminderItems]);
}

/** All-day (or multi-day spanning) events that intersect `day`. */
export function dayAllDayEvents(events: EventDto[], day: Date): EventDto[] {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + DAY_MS;
  return events.filter((e) => {
    if (!e.allDay) return false;
    const s = parseISO(e.start).getTime();
    const en = parseISO(e.end).getTime();
    return en > dayStart && s < dayEnd;
  });
}

/** Reminders due on `day` with no specific time (date-only) — shown in the all-day strip. */
export function dayAllDayReminders(reminders: ReminderDto[], day: Date): ReminderDto[] {
  const dayStart = startOfDay(day).getTime();
  return reminders.filter((r) => {
    if (!r.due || r.due.includes("T")) return false; // skip undated & timed
    const d = parseISO(r.due);
    return !Number.isNaN(d.getTime()) && startOfDay(d).getTime() === dayStart;
  });
}

export function isToday(day: Date): boolean {
  return startOfDay(day).getTime() === startOfToday().getTime();
}

/** Current-time offset in pixels from the top of the grid, or null if outside. */
export function nowOffsetPx(): number {
  const now = new Date();
  return (now.getHours() * 60 + now.getMinutes()) * (HOUR_HEIGHT / 60);
}
