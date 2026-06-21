import { addDays, format, startOfDay } from "date-fns";

export interface TimeOfDay {
  id: string;
  label: string;
  hour: number;
}

/** Default hours for each time-of-day bucket. */
export const TIMES_OF_DAY: TimeOfDay[] = [
  { id: "morning", label: "Morning", hour: 9 },
  { id: "afternoon", label: "Afternoon", hour: 13 },
  { id: "evening", label: "Evening", hour: 18 },
  { id: "night", label: "Night", hour: 21 },
];

export type WhenId = "today" | "tomorrow" | "weekend" | "workday";

/** The "Today" choice is offered conditionally (see rescheduleNode), so it's
    kept out of the default list. */
export const TODAY_WHEN: { id: WhenId; label: string } = { id: "today", label: "Today" };

export const WHENS: { id: WhenId; label: string }[] = [
  { id: "tomorrow", label: "Tomorrow" },
  { id: "weekend", label: "Next weekend" },
  { id: "workday", label: "Next workday" },
];

function nextWeekendDay(from: Date): Date {
  const base = startOfDay(from);
  const dow = base.getDay(); // 0 Sun … 6 Sat
  let delta = (6 - dow + 7) % 7; // days until Saturday
  if (delta === 0) delta = 7; // already Saturday → next one
  return addDays(base, delta);
}

function nextWorkday(from: Date): Date {
  let d = addDays(startOfDay(from), 1);
  while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1);
  return d;
}

/** Resolve a (when, hour) choice to a concrete Date. */
export function rescheduleDate(when: WhenId, hour: number, from = new Date()): Date {
  let day: Date;
  if (when === "today") day = startOfDay(from);
  else if (when === "tomorrow") day = addDays(startOfDay(from), 1);
  else if (when === "weekend") day = nextWeekendDay(from);
  else day = nextWorkday(from);
  day.setHours(hour, 0, 0, 0);
  return day;
}

/** Local `YYYY-MM-DDTHH:MM` string (for reminder due fields). */
export function toLocalDateTime(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

/** Subdued day+hour hint for a reschedule choice, e.g. "Sat 09:00". */
export function rescheduleHint(when: WhenId, hour: number, from = new Date()): string {
  return format(rescheduleDate(when, hour, from), "EEE HH:mm");
}
