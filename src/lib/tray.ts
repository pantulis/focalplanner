import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { endOfDay, format, isSameDay, parseISO, startOfDay } from "date-fns";
import { api, type TrayItemDto } from "./api";

const REMINDER_ACTIVE_MS = 30 * 60 * 1000; // a reminder is "current" for 30 min

interface Computed {
  /** Titles of items happening right now (rotated in the menu-bar title). */
  currentTitles: string[];
  /** Today's agenda for the popup menu: all-day first, then by time, no past. */
  menuItems: TrayItemDto[];
}

function compute(
  events: Awaited<ReturnType<typeof api.fetchEvents>> | undefined,
  reminders: Awaited<ReturnType<typeof api.fetchReminders>> | undefined,
  ignoredCalendars: Set<string>,
  ignoredLists: Set<string>,
  now: Date,
): Computed {
  const nowMs = now.getTime();
  const allDay: TrayItemDto[] = [];
  const timed: { item: TrayItemDto; t: number; current: boolean; title: string }[] = [];

  const EVENT_ICON = "📅";
  const REMINDER_ICON = "📝";

  for (const e of events ?? []) {
    if (e.calendarId && ignoredCalendars.has(e.calendarId)) continue;
    const title = e.title || "(untitled)";
    if (e.allDay) {
      allDay.push({ kind: "event", id: e.id ?? title, label: `${EVENT_ICON}  ${title}` });
      continue;
    }
    const start = parseISO(e.start);
    const end = parseISO(e.end);
    if (end.getTime() < nowMs) continue; // past
    timed.push({
      item: {
        kind: "event",
        id: e.id ?? title,
        label: `${EVENT_ICON}  ${format(start, "HH:mm")}  ${title}`,
      },
      t: start.getTime(),
      current: start.getTime() <= nowMs && nowMs < end.getTime(),
      title,
    });
  }

  for (const r of reminders ?? []) {
    if (r.completed || !r.due) continue;
    if (r.listId && ignoredLists.has(r.listId)) continue;
    const due = parseISO(r.due);
    if (Number.isNaN(due.getTime()) || !isSameDay(due, now)) continue;
    const title = r.title || "(untitled)";
    if (!r.due.includes("T")) {
      allDay.push({ kind: "reminder", id: r.id ?? title, label: `${REMINDER_ICON}  ${title}` });
      continue;
    }
    if (due.getTime() < nowMs) continue; // past
    timed.push({
      item: {
        kind: "reminder",
        id: r.id ?? title,
        label: `${REMINDER_ICON}  ${format(due, "HH:mm")}  ${title}`,
      },
      t: due.getTime(),
      current: due.getTime() <= nowMs && nowMs < due.getTime() + REMINDER_ACTIVE_MS,
      title,
    });
  }

  timed.sort((a, b) => a.t - b.t);
  return {
    currentTitles: timed.filter((x) => x.current).map((x) => x.title),
    menuItems: [...allDay, ...timed.map((x) => x.item)],
  };
}

/**
 * Drives the macOS menu-bar tray: pushes today's agenda as the popup menu and
 * the current item(s) as the title, rotating across simultaneous items every 10s.
 */
export function useMenubarTray(
  enabled: boolean,
  ignoredCalendarIds: string[],
  ignoredListIds: string[],
) {
  // Re-evaluate "now" periodically so items expire / become current over time.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const dayKey = format(startOfDay(now), "yyyy-MM-dd");
  const dayStartISO = startOfDay(now).toISOString();
  const dayEndISO = endOfDay(now).toISOString();

  // Dedicated keys (NOT under events/reminders) so the planner's frequent
  // eventkit-changed invalidations don't make the tray re-hit EventKit on every
  // drag — the menu bar refreshes on its own interval instead.
  const events = useQuery({
    queryKey: ["tray-events", dayKey],
    queryFn: () => api.fetchEvents(dayStartISO, dayEndISO, undefined),
    enabled,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
  const reminders = useQuery({
    queryKey: ["tray-reminders", dayKey],
    queryFn: () => api.fetchReminders(undefined, false),
    enabled,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  const ignoredCalendars = useMemo(() => new Set(ignoredCalendarIds), [ignoredCalendarIds]);
  const ignoredLists = useMemo(() => new Set(ignoredListIds), [ignoredListIds]);

  const { currentTitles, menuItems } = useMemo(
    () => compute(events.data, reminders.data, ignoredCalendars, ignoredLists, now),
    [events.data, reminders.data, ignoredCalendars, ignoredLists, now],
  );

  // Show/hide the tray with the setting.
  useEffect(() => {
    void api.traySetEnabled(enabled);
  }, [enabled]);

  // Rotate the visible title across simultaneous current items every 10s.
  const [titleIdx, setTitleIdx] = useState(0);
  useEffect(() => {
    if (!enabled || currentTitles.length <= 1) {
      setTitleIdx(0);
      return;
    }
    const t = setInterval(() => setTitleIdx((i) => i + 1), 10_000);
    return () => clearInterval(t);
  }, [enabled, currentTitles.length]);

  const title = currentTitles.length ? currentTitles[titleIdx % currentTitles.length] : null;

  // Rebuild the menu when the agenda changes.
  useEffect(() => {
    if (!enabled) return;
    void api.trayUpdate(title, menuItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, menuItems]);

  // Cheap title-only update for the rotation.
  useEffect(() => {
    if (!enabled) return;
    void api.traySetTitle(title);
  }, [enabled, title]);
}
