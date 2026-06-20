import { addDays, format, parseISO, startOfDay } from "date-fns";

/** ISO range from the start of today spanning `days` forward. */
export function agendaRange(days: number): { start: string; end: string } {
  const start = startOfDay(new Date());
  return {
    start: start.toISOString(),
    end: addDays(start, days).toISOString(),
  };
}

export function dayKey(iso: string): string {
  return format(parseISO(iso), "yyyy-MM-dd");
}

export function formatDayHeading(iso: string): string {
  const d = parseISO(iso);
  const today = startOfDay(new Date());
  const that = startOfDay(d);
  const diff = Math.round((that.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return format(d, "EEEE, MMM d");
}

export function formatEventTime(start: string, end: string, allDay: boolean): string {
  if (allDay) return "All day";
  return `${format(parseISO(start), "HH:mm")} – ${format(parseISO(end), "HH:mm")}`;
}

export function formatReminderDue(due: string | null): string | null {
  if (!due) return null;
  // due is YYYY-MM-DD or YYYY-MM-DDTHH:MM
  const hasTime = due.includes("T");
  const d = parseISO(due);
  if (Number.isNaN(d.getTime())) return due;
  return hasTime ? format(d, "MMM d, HH:mm") : format(d, "MMM d");
}

/** Convert an RFC3339/ISO string to a value for <input type="datetime-local">. */
export function toLocalInput(iso: string): string {
  const d = parseISO(iso);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

/** Convert a datetime-local input value to an RFC3339 (UTC) string. */
export function localInputToISO(value: string): string {
  // value has no timezone; interpret as local time.
  return new Date(value).toISOString();
}
