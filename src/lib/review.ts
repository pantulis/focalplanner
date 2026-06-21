import { differenceInCalendarDays, parseISO } from "date-fns";

/** Whether an area of focus is due for review (never reviewed, or past the interval). */
export function isAreaDue(
  reviewedAt: Record<string, string>,
  id: string,
  intervalDays: number,
): boolean {
  const r = reviewedAt[id];
  if (!r) return true;
  const d = parseISO(r);
  return Number.isNaN(d.getTime()) || differenceInCalendarDays(new Date(), d) >= intervalDays;
}

/** Short "last reviewed" label, e.g. "review" / "today" / "3d ago". */
export function reviewSinceLabel(reviewedAt: Record<string, string>, id: string): string {
  const r = reviewedAt[id];
  if (!r) return "review";
  const days = differenceInCalendarDays(new Date(), parseISO(r));
  if (days <= 0) return "today";
  return days === 1 ? "1d ago" : `${days}d ago`;
}
