import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  max as maxDate,
  parseISO,
  startOfDay,
  startOfMonth,
} from "date-fns";

// Time Sector System (Carl Pullein): organize tasks by *when* you'll do them.
export type Sector = "inbox" | "thisWeek" | "nextWeek" | "thisMonth" | "nextMonth" | "longTerm";

export const SECTORS: { id: Sector; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "thisWeek", label: "This Week" },
  { id: "nextWeek", label: "Next Week" },
  { id: "thisMonth", label: "This Month" },
  { id: "nextMonth", label: "Next Month" },
  { id: "longTerm", label: "Long Term" },
];

export const sectorLabel = (s: Sector): string =>
  SECTORS.find((x) => x.id === s)?.label ?? s;

type WeekStart = 0 | 1;

/**
 * Inclusive end dates for each dated sector, checked in order. The month
 * boundaries are forced to stay strictly after the week ones (and each other),
 * so the sectors' dates always increase and a task dropped into a sector never
 * re-buckets into an earlier one — even near a month boundary, where the rest of
 * the calendar month would otherwise fall before next week.
 */
function sectorEnds(now: Date, weekStartsOn: WeekStart): Record<Exclude<Sector, "inbox">, Date> {
  // Weeks target the end of the week (a few days out either way). The month and
  // long-term sectors target the *start* of their period (e.g. Next Month = the
  // 1st), so they read as "early next month" rather than a far-off month-end —
  // floored so the sequence always strictly increases.
  const thisWeek = endOfWeek(now, { weekStartsOn });
  const nextWeek = endOfWeek(addWeeks(now, 1), { weekStartsOn });
  // This Month = end of the current month (but never before next week). Next Month
  // and Long Term anchor to the *start* of the month after This Month's resolved
  // date, so they stay cleanly spaced even when This Month rolls past a boundary.
  const thisMonth = maxDate([endOfMonth(now), addDays(nextWeek, 7)]);
  const nextMonth = startOfMonth(addMonths(thisMonth, 1));
  const longTerm = startOfMonth(addMonths(thisMonth, 3));
  return { thisWeek, nextWeek, thisMonth, nextMonth, longTerm };
}

const dayMs = (d: Date) => startOfDay(d).getTime();

/** Which sector a due date falls into. */
export function sectorOf(due: string | null, now: Date, weekStartsOn: WeekStart): Sector {
  if (!due) return "inbox";
  const d = dayMs(parseISO(due));
  if (Number.isNaN(d)) return "inbox";
  const e = sectorEnds(now, weekStartsOn);
  if (d <= dayMs(e.thisWeek)) return "thisWeek";
  if (d <= dayMs(e.nextWeek)) return "nextWeek";
  if (d <= dayMs(e.thisMonth)) return "thisMonth";
  if (d <= dayMs(e.nextMonth)) return "nextMonth";
  return "longTerm";
}

/** Canonical due (date-only, preserving any existing time) for a target sector. */
export function dueForSector(
  sector: Sector,
  existing: string | null,
  now: Date,
  weekStartsOn: WeekStart,
): string | null {
  if (sector === "inbox") return null;
  const e = sectorEnds(now, weekStartsOn);
  const dateStr = format(e[sector], "yyyy-MM-dd");
  if (existing && existing.includes("T")) return `${dateStr}T${existing.split("T")[1]}`;
  return dateStr;
}
