import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, addHours, addMinutes, format, startOfDay } from "date-fns";
import { CircleCheck, Loader2, TriangleAlert, Flame } from "lucide-react";
import { api } from "@/lib/api";
import { REMINDER_SLOT_MINUTES } from "@/lib/planner";
import { cn } from "@/lib/utils";

const FALLBACK_COLOR = "#3b82f6";
const HOUR_PX = 42;
const PX_PER_MIN = HOUR_PX / 60;
const MIN_BLOCK_PX = 16;
const GUTTER = 38; // px for hour labels
const BUSY_THRESHOLD = 4;

interface Props {
  /** Scheduled interval of the item being edited (live form values). */
  focusStart: Date;
  focusEnd: Date;
  contextHours: number;
  /**
   * Calendars / reminder lists to consider — the ones assigned to an Area of
   * Focus and not hidden. When undefined, everything is considered.
   */
  calendarIds?: string[];
  listIds?: string[];
  kind: "event" | "reminder";
  /** The saved item's id, so it isn't double-counted from the fetched data. */
  selfId?: string | null;
  selfTitle: string;
  selfColor?: string | null;
}

interface Item {
  id: string;
  title: string;
  color: string | null;
  start: Date;
  end: Date;
  kind: "event" | "reminder";
  self?: boolean;
}

function tint(color: string | null | undefined): string {
  const c = color ?? FALLBACK_COLOR;
  // EventKit colors are #RRGGBB or #RRGGBBAA; tint the RGB at ~13% alpha.
  const m = /^#([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?$/.exec(c);
  return m ? `#${m[1]}22` : c;
}

/**
 * Read-only timeline around a task. Shows events and reminders from calendars /
 * lists assigned to an Area of Focus (excluding hidden ones) within
 * ±contextHours, and flags conflicts and busy windows. Used by the
 * event/reminder inspectors.
 */
export function MiniPlanner({
  focusStart,
  focusEnd,
  contextHours,
  calendarIds,
  listIds,
  kind,
  selfId,
  selfTitle,
  selfColor,
}: Props) {
  const windowStart = addHours(focusStart, -contextHours);
  const windowEnd = addHours(focusEnd, contextHours);

  // Day-aligned fetch range keeps the query key stable as the time is nudged.
  const rangeStartISO = startOfDay(windowStart).toISOString();
  const rangeEndISO = addDays(startOfDay(windowEnd), 1).toISOString();

  const eventsQ = useQuery({
    queryKey: ["mini-events", rangeStartISO, rangeEndISO],
    queryFn: () => api.fetchEvents(rangeStartISO, rangeEndISO, undefined),
  });
  const remindersQ = useQuery({
    queryKey: ["mini-reminders"],
    queryFn: () => api.fetchReminders(undefined, false),
  });

  const ws = windowStart.getTime();
  const we = windowEnd.getTime();

  const items = useMemo<Item[]>(() => {
    const allowedCals = calendarIds ? new Set(calendarIds) : null;
    const allowedLists = listIds ? new Set(listIds) : null;
    const out: Item[] = [];
    for (const e of eventsQ.data ?? []) {
      if (e.allDay || (selfId && e.id === selfId)) continue;
      if (allowedCals && (e.calendarId == null || !allowedCals.has(e.calendarId))) continue;
      const s = new Date(e.start);
      const en = new Date(e.end);
      if (s.getTime() < we && en.getTime() > ws) {
        out.push({ id: e.id ?? e.title, title: e.title, color: e.color, start: s, end: en, kind: "event" });
      }
    }
    for (const r of remindersQ.data ?? []) {
      if (!r.due || !r.due.includes("T") || (selfId && r.id === selfId)) continue;
      if (allowedLists && (r.listId == null || !allowedLists.has(r.listId))) continue;
      const s = new Date(r.due);
      const en = addMinutes(s, REMINDER_SLOT_MINUTES);
      if (s.getTime() < we && en.getTime() > ws) {
        out.push({ id: r.id ?? r.title, title: r.title, color: r.color, start: s, end: en, kind: "reminder" });
      }
    }
    return out;
  }, [eventsQ.data, remindersQ.data, ws, we, selfId, calendarIds, listIds]);

  const selfEnd = kind === "reminder" ? addMinutes(focusStart, REMINDER_SLOT_MINUTES) : focusEnd;

  const conflicts = useMemo(() => {
    const fs = focusStart.getTime();
    const fe = selfEnd.getTime();
    return items.filter((it) => it.start.getTime() < fe && it.end.getTime() > fs).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, focusStart, selfEnd]);

  // Greedy lane assignment so overlapping blocks sit side by side.
  const { placed, lanes } = useMemo(() => {
    const all: Item[] = [
      ...items,
      { id: "__self", title: selfTitle || "(this item)", color: selfColor ?? null, start: focusStart, end: selfEnd, kind, self: true },
    ];
    const sorted = [...all].sort(
      (a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime(),
    );
    const laneEnds: number[] = [];
    const out = sorted.map((it) => {
      let lane = laneEnds.findIndex((end) => end <= it.start.getTime());
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.end.getTime());
      } else {
        laneEnds[lane] = it.end.getTime();
      }
      return { it, lane };
    });
    return { placed: out, lanes: Math.max(1, laneEnds.length) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, focusStart, selfEnd, selfTitle, selfColor, kind]);

  const totalMin = (we - ws) / 60000;
  const height = totalMin * PX_PER_MIN;
  const topOf = (t: Date) => ((t.getTime() - ws) / 60000) * PX_PER_MIN;

  const hourLines: Date[] = [];
  {
    let t = new Date(windowStart);
    t.setMinutes(0, 0, 0);
    if (t.getTime() < ws) t = addHours(t, 1);
    for (; t.getTime() <= we; t = addHours(t, 1)) hourLines.push(new Date(t));
  }

  const loading = eventsQ.isLoading || remindersQ.isLoading;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Schedule context</span>
        {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      </div>

      {!loading && (
        <div className="flex flex-wrap gap-1.5">
          {conflicts > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
              <TriangleAlert className="size-3" />
              {conflicts} conflict{conflicts > 1 ? "s" : ""}
            </span>
          )}
          {items.length > BUSY_THRESHOLD && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              <Flame className="size-3" />
              It seems busy around this task
            </span>
          )}
          {conflicts === 0 && items.length <= BUSY_THRESHOLD && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <CircleCheck className="size-3" />
              {items.length === 0 ? "Nothing else scheduled nearby" : "Looks clear"}
            </span>
          )}
        </div>
      )}

      <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-muted/30">
        <div className="relative" style={{ height }}>
          {/* Hour gridlines + labels */}
          {hourLines.map((t) => (
            <div
              key={t.getTime()}
              className="absolute inset-x-0 border-t border-border/60"
              style={{ top: topOf(t) }}
            >
              <span className="absolute -top-2 left-1 text-[9px] text-muted-foreground">
                {format(t, "HH:mm")}
              </span>
            </div>
          ))}

          {/* Blocks */}
          {placed.map(({ it, lane }) => {
            const top = Math.max(0, topOf(it.start));
            const bottom = Math.min(height, topOf(it.end));
            const h = Math.max(MIN_BLOCK_PX, bottom - top);
            const laneW = `calc((100% - ${GUTTER}px) / ${lanes})`;
            const color = it.color ?? FALLBACK_COLOR;
            return (
              <div
                key={it.self ? "__self" : `${it.kind}-${it.id}`}
                className={cn(
                  "absolute overflow-hidden rounded px-1 text-[10px] leading-tight",
                  it.self ? "z-10 ring-2 ring-primary" : "border-l-2",
                )}
                style={{
                  top,
                  height: h,
                  left: `calc(${GUTTER}px + ${lane} * ${laneW})`,
                  width: laneW,
                  backgroundColor: it.self ? tint(selfColor) : tint(color),
                  borderLeftColor: it.self ? undefined : color,
                  ...(it.kind === "reminder" && !it.self
                    ? { borderLeft: `2px dashed ${color}` }
                    : {}),
                }}
                title={it.title}
              >
                <div className="truncate font-medium">{it.title || "(untitled)"}</div>
                <div className="truncate text-muted-foreground">{format(it.start, "HH:mm")}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
