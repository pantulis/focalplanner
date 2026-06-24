import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { addMinutes, format, parseISO, startOfDay } from "date-fns";
import { Circle, CircleCheck, EyeOff, MapPin, MoveHorizontal, Repeat, Video } from "lucide-react";
import type { EventDto, ReminderDto } from "@/lib/api";
import { cloneKey } from "@/lib/clones";
import { AREAS, isMember, type Area, type AreaConfig } from "@/lib/areas";
import { findMeetingLink } from "@/lib/meeting";
import {
  GridBlock,
  GridBlockKind,
  HOUR_HEIGHT,
  ZOOM_STEP,
  clamp,
  clampZoom,
  dayAllDayEvents,
  dayAllDayReminders,
  dayGridBlocks,
  isToday,
  nowOffsetPx,
} from "@/lib/planner";
import { cn } from "@/lib/utils";
import { POOF_ANIMATE, POOF_EXIT, POOF_INITIAL, POOF_TRANSITION } from "@/lib/anim";

interface Props {
  days: Date[];
  events: EventDto[] | undefined;
  reminders: ReminderDto[] | undefined;
  /** Ids of locally-hidden events to render faded (only set when revealing hidden). */
  hiddenEventIds?: Set<string>;
  /** Vertical-zoom multiplier of the hour grid (1 = 100%). */
  zoom: number;
  onZoomChange: (zoom: number) => void;
  /** Same event copied across calendars; matched members render as one clone block. */
  cloneGroups: Map<string, EventDto[]>;
  /** Area-of-focus membership, for the hover card's per-calendar area pills. */
  areaConfig: AreaConfig;
  onEditEvent: (event: EventDto) => void;
  onEditReminder: (reminder: ReminderDto) => void;
  onToggleReminder: (reminder: ReminderDto, completed: boolean) => void;
  onEmptyContextMenu: (e: React.MouseEvent, start: Date) => void;
  /** Drag over empty grid space to create something in [start, end]. */
  onCreateRange: (start: Date, end: Date, x: number, y: number) => void;
  onUpdateTimes: (event: EventDto, startISO: string, endISO: string) => void;
  onUpdateReminderDue: (reminder: ReminderDto, dueLocal: string) => void;
  onEventContextMenu: (e: React.MouseEvent, event: EventDto) => void;
  onReminderContextMenu: (e: React.MouseEvent, reminder: ReminderDto) => void;
  /** Target day + snapped minute while a reminder is dragged in from the sidebar. */
  dropPreview?: { day: number; minute: number } | null;
  /** Begin a pointer-drag of an untimed reminder from the bottom tray. */
  onReminderDragStart: (e: React.PointerEvent, reminder: ReminderDto) => void;
  /** Right-click an empty All-day tasks column → create a date-only reminder there. */
  onEmptyAllDayContextMenu: (e: React.MouseEvent, day: Date) => void;
  /** All-day column to highlight while a reminder is dragged in from the sidebar/tray. */
  allDayHighlightDay?: number | null;
  workHours: {
    workdayStart: number;
    workdayEnd: number;
    weekendStart: number;
    weekendEnd: number;
  };
  /** User-resized all-day section heights (px); null = auto/default. */
  allDayEventsHeight: number | null;
  onAllDayEventsHeight: (h: number) => void;
  allDayTasksHeight: number | null;
  onAllDayTasksHeight: (h: number) => void;
}

const FALLBACK_COLOR = "#3b82f6";
/** Muted grey for invitations the user hasn't responded to yet. */
const RSVP_COLOR = "#9ca3af";
const SNAP = 15; // minutes
/** Flex-grow weight for a column the user chose to give more space. */
const COLUMN_EXPAND = 1.7;
/** Narrower weight for past days in multi-day (weekly) views. */
const COLUMN_PAST = 0.7;

type DragMode = "move" | "resize-start" | "resize-end";

interface DragState {
  kind: GridBlockKind;
  dragId: string;
  event?: EventDto;
  reminder?: ReminderDto;
  mode: DragMode;
  origStartMin: number;
  origEndMin: number;
  origDayIndex: number;
  startMin: number;
  endMin: number;
  dayIndex: number;
  pointerStartY: number;
}

function tint(color: string | null): string {
  const c = color ?? FALLBACK_COLOR;
  // EventKit colors are #RRGGBB or #RRGGBBAA; take the RGB and apply a light
  // (~25%) fill alpha behind the saturated left bar.
  const m = /^#([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?$/.exec(c);
  return m ? `#${m[1]}40` : c;
}

/** Diagonal zebra stripes alternating the given colors (for clone events). */
function zebra(colors: string[], seg: number, transform: (c: string) => string): string {
  const stops = colors.map((c, i) => `${transform(c)} ${i * seg}px ${(i + 1) * seg}px`).join(", ");
  return `repeating-linear-gradient(45deg, ${stops})`;
}

function minutesLabel(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function blockGeometry(
  startMin: number,
  endMin: number,
  offsetMin = 0,
  hourHeight = HOUR_HEIGHT,
) {
  return {
    top: ((startMin - offsetMin) / 60) * hourHeight,
    height: Math.max(((endMin - startMin) / 60) * hourHeight, 18),
  };
}

function colStyle(col: number, cols: number) {
  return {
    left: `calc(${(col / cols) * 100}% + 1px)`,
    width: `calc(${(1 / cols) * 100}% - 2px)`,
  };
}

export function TimeGridView({
  days,
  events,
  reminders,
  hiddenEventIds,
  zoom,
  onZoomChange,
  cloneGroups,
  areaConfig,
  onEditEvent,
  onEditReminder,
  onToggleReminder,
  onEmptyContextMenu,
  onCreateRange,
  onUpdateTimes,
  onUpdateReminderDue,
  onEventContextMenu,
  onReminderContextMenu,
  dropPreview,
  onReminderDragStart,
  onEmptyAllDayContextMenu,
  allDayHighlightDay,
  workHours,
  allDayEventsHeight,
  onAllDayEventsHeight,
  allDayTasksHeight,
  onAllDayTasksHeight,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const allDayEventsRef = useRef<HTMLDivElement>(null);
  const tasksTrayRef = useRef<HTMLDivElement>(null);

  // Effective hour-row height after vertical zoom; all grid pixel math uses this.
  const hourPx = HOUR_HEIGHT * zoom;

  // ⌥ + scroll-wheel over the grid zooms vertically. React's onWheel is passive,
  // so attach a non-passive listener to call preventDefault on the zoom gesture.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.altKey) return;
      e.preventDefault();
      onZoomChange(clampZoom(zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, onZoomChange]);

  // Drag a section's edge to resize it. `dir` = +1 when dragging the bottom edge
  // (down grows it), -1 when dragging the top edge (up grows it).
  function beginResize(
    e: React.PointerEvent,
    ref: React.RefObject<HTMLDivElement | null>,
    set: (h: number) => void,
    dir: 1 | -1,
  ) {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const startH = ref.current?.getBoundingClientRect().height ?? 100;
    const onMove = (ev: PointerEvent) =>
      set(clamp(startH + dir * (ev.clientY - startY), 36, window.innerHeight * 0.6));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  const evs = events ?? [];
  const rems = reminders ?? [];
  // Timed blocks per shown day, reused for the visible window and for rendering.
  const blocksByDay = days.map((d) => dayGridBlocks(evs, rems, d, cloneGroups));

  // Visible hour window: the union of the shown days' work-hour ranges (daily /
  // 5-day-week → that day type's range; 7-day week → workday ∪ weekend), expanded
  // to include any event/reminder that falls outside those hours. Off-hours that
  // hold nothing simply don't render.
  let visStart = 24;
  let visEnd = 0;
  days.forEach((d, i) => {
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    visStart = Math.min(visStart, weekend ? workHours.weekendStart : workHours.workdayStart);
    visEnd = Math.max(visEnd, weekend ? workHours.weekendEnd : workHours.workdayEnd);
    for (const b of blocksByDay[i]) {
      visStart = Math.min(visStart, Math.floor(b.startMin / 60));
      visEnd = Math.max(visEnd, Math.ceil(b.endMin / 60));
    }
  });
  if (visEnd <= visStart) {
    visStart = 0;
    visEnd = 24;
  }
  visStart = Math.max(0, Math.min(visStart, 23));
  visEnd = Math.max(visStart + 1, Math.min(visEnd, 24));
  const visStartMin = visStart * 60;
  const visEndMin = visEnd * 60;
  const offsetPx = visStart * hourPx;
  const gridHeight = (visEnd - visStart) * hourPx;
  const gridHours = Array.from({ length: visEnd - visStart }, (_, i) => visStart + i);

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const setBoth = (d: DragState | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  // Drag over empty grid space to select a time range and create an event/reminder.
  const [createSel, setCreateSel] = useState<{ day: number; a: number; b: number } | null>(null);
  const createRef = useRef<{ day: number; a: number; b: number } | null>(null);

  // Width the vertical scrollbar steals from the scrolling grid. Reserved as
  // right-padding on the non-scrolling header rows so columns line up exactly.
  const [scrollbarWidth, setScrollbarWidth] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setScrollbarWidth(el.offsetWidth - el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      // Content now starts at the visible window's first hour, so scroll relative
      // to that to bring "now" into view.
      scrollRef.current.scrollTop = Math.max(nowOffsetPx(hourPx) - offsetPx - 120, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = drag !== null;
  useEffect(() => {
    if (!active) return;

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const deltaMin =
        Math.round((e.clientY - d.pointerStartY) / hourPx * 60 / SNAP) * SNAP;
      const dur = d.origEndMin - d.origStartMin;
      let { startMin, endMin, dayIndex } = d;

      if (d.mode === "move") {
        startMin = clamp(d.origStartMin + deltaMin, visStartMin, visEndMin - dur);
        endMin = startMin + dur;
        if (days.length > 1) {
          const di = gridColAt(e.clientX, e.clientY);
          if (di != null) dayIndex = di;
        }
      } else if (d.mode === "resize-end") {
        endMin = clamp(d.origEndMin + deltaMin, d.origStartMin + SNAP, visEndMin);
      } else {
        startMin = clamp(d.origStartMin + deltaMin, visStartMin, d.origEndMin - SNAP);
      }

      setBoth({ ...d, startMin, endMin, dayIndex });
      setAllDayTarget(d.kind === "reminder" ? allDayColAt(e.clientX, e.clientY) : null);
    };

    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      setBoth(null);
      const overAllDay = d?.kind === "reminder" ? allDayColAt(e.clientX, e.clientY) : null;
      setAllDayTarget(null);
      if (!d) return;
      const moved =
        d.startMin !== d.origStartMin ||
        d.endMin !== d.origEndMin ||
        d.dayIndex !== d.origDayIndex;
      const base = startOfDay(days[d.dayIndex]);

      if (d.kind === "reminder") {
        // Dropped onto the all-day tray → clear the time, keep (or move to) the day.
        if (overAllDay != null && d.reminder) {
          onUpdateReminderDue(d.reminder, format(days[overAllDay], "yyyy-MM-dd"));
          return;
        }
        if (!moved) {
          if (d.reminder) onEditReminder(d.reminder);
          return;
        }
        onUpdateReminderDue(
          d.reminder!,
          format(addMinutes(base, d.startMin), "yyyy-MM-dd'T'HH:mm"),
        );
        return;
      }

      if (!moved) {
        if (d.event) onEditEvent(d.event);
        return;
      }
      onUpdateTimes(
        d.event!,
        addMinutes(base, d.startMin).toISOString(),
        addMinutes(base, d.endMin).toISOString(),
      );
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function beginDrag(e: React.PointerEvent, block: GridBlock, dayIndex: number, mode: DragMode) {
    if (e.button !== 0) return; // ignore right/middle click (context menu)
    e.preventDefault();
    e.stopPropagation();
    setBoth({
      kind: block.kind,
      dragId: block.id,
      event: block.event,
      reminder: block.reminder,
      mode,
      origStartMin: block.startMin,
      origEndMin: block.endMin,
      origDayIndex: dayIndex,
      startMin: block.startMin,
      endMin: block.endMin,
      dayIndex,
      pointerStartY: e.clientY,
    });
  }

  // Pointer-down on empty grid space: drag down to select a time range, then on
  // release ask whether to create an event or reminder for it. (Event/reminder
  // blocks stop propagation in beginDrag, so this only fires on empty space.)
  function beginCreate(e: React.PointerEvent, dayIndex: number) {
    if (e.button !== 0) return;
    const startMin = minuteFromY(e.clientY);
    const sel = { day: dayIndex, a: startMin, b: startMin };
    createRef.current = sel;
    setCreateSel(sel);
    const onMove = (ev: PointerEvent) => {
      if (!createRef.current) return;
      const next = { ...createRef.current, b: minuteFromY(ev.clientY) };
      createRef.current = next;
      setCreateSel(next);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const s = createRef.current;
      createRef.current = null;
      setCreateSel(null);
      if (!s) return;
      const lo = Math.min(s.a, s.b);
      const hi = Math.max(s.a, s.b);
      if (hi - lo < SNAP) return; // a click, not a range
      const base = startOfDay(days[s.day]);
      onCreateRange(addMinutes(base, lo), addMinutes(base, hi), ev.clientX, ev.clientY);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Time (rounded to the snap grid) under a pointer Y within the columns. The
  // grid top maps to the visible window's first hour.
  function minuteFromY(clientY: number): number {
    const top = colsRef.current?.getBoundingClientRect().top ?? 0;
    return clamp(
      visStartMin + Math.round(((clientY - top) / hourPx) * 60 / SNAP) * SNAP,
      visStartMin,
      visEndMin,
    );
  }

  // Tint Saturday/Sunday columns (only meaningful in multi-day / week view).
  // Per-column background tint (multi-day views only): today stands out with a
  // primary tint; weekends get a subtle grey. Today wins over weekend.
  const columnTint = (d: Date) => {
    if (days.length <= 1) return "";
    if (isToday(d)) return "bg-primary/[0.07]";
    if (d.getDay() === 0 || d.getDay() === 6) return "bg-muted/40";
    return "";
  };

  const dragId = drag?.dragId ?? null;
  const anyAllDay = days.some((d) => dayAllDayEvents(evs, d).length > 0);
  // Date-only reminders (no time) shown in the bottom tray, draggable onto the grid.
  const anyUntimed = days.some((d) => dayAllDayReminders(rems, d).length > 0);

  // Lightweight hover card describing the event/reminder under the pointer.
  const [hover, setHover] = useState<{ x: number; y: number; info: HoverInfo } | null>(null);
  const showHover = (e: React.MouseEvent, info: HoverInfo) => {
    if (active) return; // don't fight an in-progress drag
    setHover({ x: e.clientX, y: e.clientY, info });
  };
  const hideHover = () => setHover(null);

  // All-day column under a pointer (for dropping a timed reminder to clear its time).
  const [allDayTarget, setAllDayTarget] = useState<number | null>(null);
  function allDayColAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-allday-day]");
    if (!el) return null;
    const di = Number(el.dataset.alldayDay);
    return Number.isNaN(di) ? null : di;
  }
  // Grid day column under a pointer (robust to unequal column widths).
  function gridColAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-grid-day]");
    if (!el) return null;
    const di = Number(el.dataset.gridDay);
    return Number.isNaN(di) ? null : di;
  }

  // Per-view (transient) choice to give one day column more horizontal space.
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const todayStart = startOfDay(new Date()).getTime();
  const grow = (i: number) => {
    if (days.length <= 1) return 1;
    if (expandedDay === i) return COLUMN_EXPAND;
    // Past days get slightly less horizontal space than today/upcoming days.
    if (startOfDay(days[i]).getTime() < todayStart) return COLUMN_PAST;
    return 1;
  };
  // Shared grid template so the header, all-day, time-grid and all-day-tasks rows
  // align perfectly (and never overflow) regardless of which column is expanded.
  // First track = the 56px (w-14) time/label gutter; then one track per day.
  const colTemplate = `3.5rem ${days.map((_, i) => `minmax(0, ${grow(i)}fr)`).join(" ")}`;

  return (
    <div className="flex h-full select-none flex-col">
      {/* Day headers */}
      <div className="grid border-b border-border" style={{ gridTemplateColumns: colTemplate, paddingRight: scrollbarWidth }}>
        <div className="w-14 shrink-0" />
        {days.map((d, i) => (
          <div
            key={d.toISOString()}
            className={cn(
              "group relative min-w-0 flex-1 border-l border-border px-2 py-1.5 text-center",
              columnTint(d),
            )}
            style={{ flexGrow: grow(i) }}
          >
            {days.length > 1 && isToday(d) && (
              <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-primary" />
            )}
            {days.length > 1 && (
              <button
                type="button"
                onClick={() => setExpandedDay((p) => (p === i ? null : i))}
                title={expandedDay === i ? "Reset column width" : "Give this day more space"}
                aria-label={expandedDay === i ? "Reset column width" : "Expand this day"}
                className={cn(
                  "absolute right-0.5 top-0.5 rounded p-0.5 transition-opacity hover:bg-accent",
                  expandedDay === i
                    ? "text-primary opacity-100"
                    : "text-muted-foreground opacity-0 group-hover:opacity-100",
                )}
              >
                <MoveHorizontal className="size-3" />
              </button>
            )}
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {format(d, "EEE")}
            </div>
            <div
              className={cn(
                "mx-auto flex size-7 items-center justify-center rounded-full text-sm font-semibold",
                isToday(d) && "bg-primary text-primary-foreground",
              )}
            >
              {format(d, "d")}
            </div>
          </div>
        ))}
      </div>

      {/* All-day / undated row */}
      {anyAllDay && (
        <div
          ref={allDayEventsRef}
          className="grid border-b border-border"
          style={{
            gridTemplateColumns: colTemplate,
            paddingRight: scrollbarWidth,
            height: allDayEventsHeight ?? undefined,
          }}
        >
          <div className="flex w-14 shrink-0 items-start justify-end pr-2 pt-1 text-[10px] uppercase text-muted-foreground">
            all-day
          </div>
          {days.map((d, i) => (
            <div
              key={d.toISOString()}
              className={cn(
                "min-h-7 min-w-0 flex-1 space-y-0.5 overflow-y-auto border-l border-border p-1",
                columnTint(d),
              )}
              style={{ flexGrow: grow(i) }}
            >
              <AnimatePresence initial={false}>
              {dayAllDayEvents(evs, d).map((e) => (
                <motion.button
                  key={(e.id ?? e.title) + "ev"}
                  layout
                  initial={POOF_INITIAL}
                  animate={POOF_ANIMATE}
                  exit={POOF_EXIT}
                  transition={POOF_TRANSITION}
                  onClick={() => onEditEvent(e)}
                  onContextMenu={(ev) => onEventContextMenu(ev, e)}
                  onMouseEnter={(ev) => showHover(ev, { kind: "event", event: e })}
                  onMouseMove={(ev) => showHover(ev, { kind: "event", event: e })}
                  onMouseLeave={hideHover}
                  className={cn(
                    "relative flex w-full items-center gap-1 overflow-hidden rounded-sm pl-2.5 pr-1 text-left text-[11px]",
                    e.needsResponse && "text-muted-foreground",
                  )}
                  style={{ backgroundColor: tint(e.needsResponse ? RSVP_COLOR : e.color) }}
                >
                  <span
                    className="pointer-events-none absolute inset-y-0 left-[3px] w-[3px] rounded-sm"
                    style={{ backgroundColor: e.color ?? FALLBACK_COLOR }}
                  />
                  <span className="min-w-0 flex-1 truncate">{e.title}</span>
                  {e.recurring && <Repeat className="size-2.5 shrink-0 opacity-70" />}
                  {findMeetingLink(e) && <Video className="size-2.5 shrink-0 opacity-70" />}
                </motion.button>
              ))}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}
      {anyAllDay && (
        <div
          onPointerDown={(e) => beginResize(e, allDayEventsRef, onAllDayEventsHeight, 1)}
          title="Drag to resize the all-day row"
          className="h-1.5 shrink-0 cursor-row-resize transition-colors hover:bg-primary/30"
        />
      )}

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div ref={colsRef} className="grid" style={{ gridTemplateColumns: colTemplate, height: gridHeight }}>
          {/* Hour gutter */}
          <div className="relative w-14 shrink-0">
            {gridHours.filter((h) => h > visStart).map((h) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground"
                style={{ top: (h - visStart) * hourPx }}
              >
                {minutesLabel(h * 60)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d, dayIndex) => {
              const blocks = blocksByDay[dayIndex];
              const showNow = isToday(d);
              const showPreview = drag && drag.dayIndex === dayIndex;
              return (
                <div
                  key={d.toISOString()}
                  data-grid-day={dayIndex}
                  className={cn(
                    "relative flex-1 border-l border-border",
                    columnTint(d),
                    dropPreview?.day === dayIndex && "ring-2 ring-inset ring-primary/60",
                  )}
                  style={{ flexGrow: grow(dayIndex) }}
                  onPointerDown={(e) => beginCreate(e, dayIndex)}
                  onContextMenu={(e) =>
                    onEmptyContextMenu(e, addMinutes(startOfDay(d), minuteFromY(e.clientY)))
                  }
                >
                  {gridHours.map((h) => (
                    <div
                      key={h}
                      className="border-t border-border/40 hover:bg-accent/40"
                      style={{ height: hourPx }}
                    />
                  ))}

                  {(() => {
                    const weekend = d.getDay() === 0 || d.getDay() === 6;
                    const ws = weekend ? workHours.weekendStart : workHours.workdayStart;
                    const we = weekend ? workHours.weekendEnd : workHours.workdayEnd;
                    return (
                      <>
                        {ws > visStart && (
                          <div
                            className="pointer-events-none absolute inset-x-0 top-0 bg-foreground/[0.05]"
                            style={{ height: (ws - visStart) * hourPx }}
                          />
                        )}
                        {we < visEnd && (
                          <div
                            className="pointer-events-none absolute inset-x-0 bg-foreground/[0.05]"
                            style={{ top: (we - visStart) * hourPx, height: (visEnd - we) * hourPx }}
                          />
                        )}
                      </>
                    );
                  })()}

                  {showNow && nowOffsetPx(hourPx) >= offsetPx && nowOffsetPx(hourPx) <= offsetPx + gridHeight && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500"
                      style={{ top: nowOffsetPx(hourPx) - offsetPx }}
                    >
                      <div className="absolute -left-1 -top-1 size-2 rounded-full bg-red-500" />
                    </div>
                  )}

                  {dropPreview?.day === dayIndex && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-primary"
                      style={{ top: (dropPreview.minute / 60) * hourPx - offsetPx }}
                    >
                      <span className="absolute -top-2.5 left-1 rounded bg-primary px-1 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                        {minutesLabel(dropPreview.minute)}
                      </span>
                    </div>
                  )}

                  {createSel?.day === dayIndex && createSel.a !== createSel.b && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 rounded-sm border border-primary bg-primary/20"
                      style={{
                        top: ((Math.min(createSel.a, createSel.b) - visStartMin) / 60) * hourPx,
                        height: (Math.abs(createSel.a - createSel.b) / 60) * hourPx,
                      }}
                    >
                      <span className="absolute left-1 top-0.5 rounded bg-primary px-1 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                        {minutesLabel(Math.min(createSel.a, createSel.b))} – {minutesLabel(Math.max(createSel.a, createSel.b))}
                      </span>
                    </div>
                  )}

                  <AnimatePresence initial={false}>
                    {blocks
                      .filter((b) => b.endMin > visStartMin && b.startMin < visEndMin)
                      .map((b) =>
                      b.kind === "event" ? (
                        <EventBlock
                          key={b.id}
                          block={b}
                          offsetMin={visStartMin}
                          hourHeight={hourPx}
                          dimmed={active && b.id === dragId}
                          faded={
                            !!b.event?.id && (hiddenEventIds?.has(b.event.id) ?? false)
                          }
                          onBeginDrag={(e, mode) => beginDrag(e, b, dayIndex, mode)}
                          onEdit={() => b.event && onEditEvent(b.event)}
                          onContextMenu={(e) => {
                            e.stopPropagation();
                            if (b.event) onEventContextMenu(e, b.event);
                          }}
                          onHover={(e) => b.event && showHover(e, { kind: "event", event: b.event })}
                          onHoverEnd={hideHover}
                        />
                      ) : (
                        <ReminderBlock
                          key={b.id}
                          block={b}
                          offsetMin={visStartMin}
                          hourHeight={hourPx}
                          dimmed={active && b.id === dragId}
                          onBeginDrag={(e) => beginDrag(e, b, dayIndex, "move")}
                          onContextMenu={(e) => {
                            e.stopPropagation();
                            if (b.reminder) onReminderContextMenu(e, b.reminder);
                          }}
                          onToggleComplete={() =>
                            b.reminder && onToggleReminder(b.reminder, !b.reminder.completed)
                          }
                          onHover={(e) =>
                            b.reminder && showHover(e, { kind: "reminder", reminder: b.reminder })
                          }
                          onHoverEnd={hideHover}
                        />
                      ),
                    )}
                  </AnimatePresence>

                  {showPreview && (
                    <PreviewBlock
                      kind={drag.kind}
                      title={drag.kind === "event" ? drag.event!.title : drag.reminder!.title}
                      color={drag.kind === "event" ? drag.event!.color : drag.reminder!.color}
                      completed={drag.reminder?.completed}
                      startMin={drag.startMin}
                      endMin={drag.endMin}
                      offsetMin={visStartMin}
                      hourHeight={hourPx}
                    />
                  )}
                </div>
              );
            })}
        </div>
      </div>

      <div
        onPointerDown={(e) => beginResize(e, tasksTrayRef, onAllDayTasksHeight, -1)}
        title="Drag to resize the all-day tasks tray"
        className="h-1.5 shrink-0 cursor-row-resize border-t border-border transition-colors hover:bg-primary/30"
      />
      {/* Bottom tray: date-only reminders. Drag one onto the grid to give it a
          time, or drag a scheduled reminder down here to clear its time. */}
      <div
        ref={tasksTrayRef}
        className={cn(
          "relative grid shrink-0 border-t border-border",
          allDayTasksHeight == null && "h-[25vh]",
        )}
        style={{
          gridTemplateColumns: colTemplate,
          paddingRight: scrollbarWidth,
          height: allDayTasksHeight ?? undefined,
        }}
      >
        <div className="flex w-14 shrink-0 items-start justify-end pr-2 pt-1.5 text-right text-[10px] leading-tight text-muted-foreground">
          All-day tasks
        </div>
        {days.map((d, dayIndex) => (
          <div
            key={d.toISOString()}
            data-allday-day={dayIndex}
            onContextMenu={(e) => onEmptyAllDayContextMenu(e, d)}
            style={{ flexGrow: grow(dayIndex) }}
            className={cn(
              "flex min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto border-l border-border p-1",
              columnTint(d),
              (allDayTarget === dayIndex || allDayHighlightDay === dayIndex) &&
                "bg-primary/10 ring-2 ring-inset ring-primary/50",
            )}
          >
            <AnimatePresence initial={false}>
              {dayAllDayReminders(rems, d).map((r) => (
                <motion.div
                  key={r.id ?? r.title}
                  layout
                  initial={POOF_INITIAL}
                  animate={POOF_ANIMATE}
                  exit={POOF_EXIT}
                  transition={POOF_TRANSITION}
                  onPointerDown={(e) => r.id && onReminderDragStart(e, r)}
                  onClick={() => onEditReminder(r)}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    onReminderContextMenu(e, r);
                  }}
                  onMouseEnter={(e) => showHover(e, { kind: "reminder", reminder: r })}
                  onMouseMove={(e) => showHover(e, { kind: "reminder", reminder: r })}
                  onMouseLeave={hideHover}
                  className="flex w-full shrink-0 cursor-grab select-none items-center gap-1 truncate rounded border border-dashed px-1 py-0.5 text-[11px] active:cursor-grabbing"
                  style={{ borderColor: r.color ?? FALLBACK_COLOR }}
                  title="Drag onto the grid to schedule"
                >
                  <ReminderToggle
                    completed={r.completed}
                    color={r.color}
                    onToggle={() => onToggleReminder(r, !r.completed)}
                  />
                  <span
                    className={cn(
                      "min-w-0 truncate",
                      r.completed && "line-through opacity-60",
                    )}
                  >
                    {r.title}
                  </span>
                  {r.recurring && <Repeat className="size-3 shrink-0 opacity-70" />}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ))}
        {!anyUntimed && (
          <div className="pointer-events-none absolute inset-y-0 left-14 right-0 flex items-center justify-center px-6 text-center text-[11px] text-muted-foreground/70">
            Reminders with a date but no time live here — drag one onto the grid to give it a time, or drag a scheduled reminder down here to clear its time.
          </div>
        )}
      </div>

      {hover && <HoverCard {...hover} cloneGroups={cloneGroups} areaConfig={areaConfig} />}
    </div>
  );
}

interface EventHover {
  kind: "event";
  event: EventDto;
}
interface ReminderHover {
  kind: "reminder";
  reminder: ReminderDto;
}
type HoverInfo = EventHover | ReminderHover;

/** The areas of focus a calendar is assigned to (many-to-many; may be empty). */
function areasForCalendar(config: AreaConfig, calendarId: string | null): Area[] {
  if (!calendarId) return [];
  return AREAS.filter((a) => isMember(config, a.id, "calendar", calendarId));
}

function HoverCard({
  x,
  y,
  info,
  cloneGroups,
  areaConfig,
}: {
  x: number;
  y: number;
  info: HoverInfo;
  cloneGroups: Map<string, EventDto[]>;
  areaConfig: AreaConfig;
}) {
  const flipX = x > window.innerWidth - 280;
  const style: CSSProperties = {
    left: flipX ? x - 14 : x + 14,
    top: Math.min(y + 14, window.innerHeight - 130),
    transform: flipX ? "translateX(-100%)" : undefined,
  };

  const color = (info.kind === "event" ? info.event.color : info.reminder.color) ?? FALLBACK_COLOR;
  // When the hovered event is a clone (same event copied across calendars), list
  // every calendar it lives in, each with a CLONED pill in that calendar's color.
  const cloneMembers =
    info.kind === "event" ? cloneGroups.get(cloneKey(info.event)) : undefined;
  const isClone = !!cloneMembers && cloneMembers.length >= 2;
  let title: string;
  let typeLine: string;
  let when: string;
  let location: string | null = null;
  let completed = false;
  let recurring = false;

  if (info.kind === "event") {
    const e = info.event;
    title = e.title || "(untitled event)";
    typeLine = e.calendarTitle ? `Event · ${e.calendarTitle}` : "Event";
    when = e.allDay
      ? "All day"
      : `${format(parseISO(e.start), "EEE, MMM d · HH:mm")} – ${format(parseISO(e.end), "HH:mm")}`;
    location = e.location;
    recurring = e.recurring;
  } else {
    const r = info.reminder;
    title = r.title || "(untitled reminder)";
    typeLine = r.listTitle ? `Reminder · ${r.listTitle}` : "Reminder";
    when = r.due
      ? r.due.includes("T")
        ? format(parseISO(r.due), "EEE, MMM d · HH:mm")
        : format(parseISO(r.due), "EEE, MMM d")
      : "No due date";
    completed = r.completed;
    recurring = r.recurring;
  }

  // For events, show one row per calendar (all of them when cloned), each with
  // its focus-area pill(s) alongside the calendar name.
  const eventMembers: EventDto[] =
    info.kind === "event" ? (isClone && cloneMembers ? cloneMembers : [info.event]) : [];

  return createPortal(
    <div
      className="pointer-events-none fixed z-[80] w-64 rounded-md border border-border bg-popover p-2.5 text-popover-foreground shadow-lg"
      style={style}
    >
      <div className={cn("truncate text-sm font-semibold", completed && "line-through opacity-70")}>
        {title}
      </div>
      {info.kind === "event" ? (
        <div className="mt-1 space-y-1">
          {eventMembers.map((m, idx) => {
            const areas = areasForCalendar(areaConfig, m.calendarId);
            return (
              <div
                key={m.id ?? idx}
                className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
              >
                {areas.map((a) => (
                  <span
                    key={a.id}
                    className="shrink-0 rounded px-1.5 py-px text-[10px] font-medium text-white"
                    style={{ backgroundColor: a.color }}
                  >
                    {a.label}
                  </span>
                ))}
                <span className="truncate">{m.calendarTitle ?? "Unknown calendar"}</span>
                {recurring && idx === 0 && <Repeat className="size-3 shrink-0" />}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="size-2.5 shrink-0 rounded-full border border-black/10"
            style={{ backgroundColor: color }}
          />
          <span className="truncate">{typeLine}</span>
          {recurring && <Repeat className="size-3 shrink-0" />}
        </div>
      )}
      <div className="mt-0.5 text-xs text-muted-foreground">{when}</div>
      {location && (
        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          <span className="truncate">{location}</span>
        </div>
      )}
    </div>,
    document.body,
  );
}

function ReminderIcon({ completed, color }: { completed?: boolean; color: string | null }) {
  const Icon = completed ? CircleCheck : Circle;
  return (
    <Icon className="size-3 shrink-0" style={{ color: color ?? FALLBACK_COLOR }} strokeWidth={2.5} />
  );
}

function ReminderToggle({
  completed,
  color,
  onToggle,
}: {
  completed?: boolean;
  color: string | null;
  onToggle: () => void;
}) {
  const Icon = completed ? CircleCheck : Circle;
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="flex shrink-0 items-center"
      aria-label={completed ? "Mark incomplete" : "Mark complete"}
      title={completed ? "Mark incomplete" : "Mark complete"}
    >
      <Icon className="size-3.5" style={{ color: color ?? FALLBACK_COLOR }} strokeWidth={2.5} />
    </button>
  );
}

function EventBlock({
  block,
  offsetMin,
  hourHeight,
  dimmed,
  faded,
  onBeginDrag,
  onEdit,
  onContextMenu,
  onHover,
  onHoverEnd,
}: {
  block: GridBlock;
  offsetMin: number;
  hourHeight: number;
  dimmed: boolean;
  /** Locally-hidden event revealed via the toggle: shown faded but interactive. */
  faded?: boolean;
  onBeginDrag: (e: React.PointerEvent, mode: DragMode) => void;
  onEdit: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onHover: (e: React.MouseEvent) => void;
  onHoverEnd: () => void;
}) {
  const { title, color, startMin, endMin, col, cols } = block;
  const needsResponse = !!block.event?.needsResponse;
  // The vertical bar always shows the calendar's (saturated) color; the fill is a
  // lighter shade of it — or grey when the invitation hasn't been accepted.
  const bar = color ?? FALLBACK_COLOR;
  const fill = needsResponse ? RSVP_COLOR : color;
  const hasMeeting = !!(block.event && findMeetingLink(block.event));
  const { top, height } = blockGeometry(startMin, endMin, offsetMin, hourHeight);
  const draggable = !block.continuesBefore && !block.continuesAfter;

  // A clone (same event copied across calendars) shows both calendars' colors as
  // diagonal zebra stripes — subdued for the fill, solid for the left bar.
  const clones = block.cloneColors;
  const isClone = !!clones && clones.length >= 2;
  // Composite the (translucent) fill over the opaque app background so a tinted
  // column behind the block (today / weekend) never bleeds through and shifts the
  // event's color.
  const fillStyle = isClone
    ? { backgroundColor: "var(--background)", backgroundImage: zebra(clones!, 8, tint) }
    : {
        backgroundColor: "var(--background)",
        backgroundImage: `linear-gradient(${tint(fill)}, ${tint(fill)})`,
      };
  const barStyle = isClone
    ? { backgroundImage: zebra(clones!, 6, (c: string) => c) }
    : { backgroundColor: bar };

  return (
    <motion.div
      initial={POOF_INITIAL}
      animate={dimmed ? { opacity: 0 } : { ...POOF_ANIMATE, opacity: faded ? 0.4 : 1 }}
      exit={POOF_EXIT}
      transition={POOF_TRANSITION}
      onPointerDown={(e) => draggable && onBeginDrag(e, "move")}
      onClick={() => !draggable && onEdit()}
      onContextMenu={onContextMenu}
      onMouseEnter={onHover}
      onMouseMove={onHover}
      onMouseLeave={onHoverEnd}
      className={cn(
        "absolute overflow-hidden rounded-sm py-0.5 pl-2.5 pr-1.5 text-[11px] leading-tight shadow-sm",
        dimmed && "pointer-events-none",
        needsResponse && "text-muted-foreground",
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
      )}
      style={{ top, height, ...colStyle(col, cols), ...fillStyle }}
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-[3px] w-[3px] rounded-sm"
        style={barStyle}
      />
      {draggable && (
        <div
          onPointerDown={(e) => onBeginDrag(e, "resize-start")}
          className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize"
        />
      )}
      <div className="pointer-events-none flex items-center gap-1 font-medium">
        {isClone && (
          <span className="shrink-0 rounded bg-background/90 px-1 text-[8px] font-bold uppercase leading-tight tracking-wide text-foreground ring-1 ring-border">
            Clone
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {faded && <EyeOff className="size-3 shrink-0 opacity-70" />}
        {block.event?.recurring && <Repeat className="size-3 shrink-0 opacity-70" />}
        {hasMeeting && <Video className="size-3 shrink-0 opacity-70" />}
      </div>
      {height > 28 && (
        <div className="pointer-events-none truncate opacity-70">
          {minutesLabel(startMin)} – {minutesLabel(endMin)}
        </div>
      )}
      {draggable && (
        <div
          onPointerDown={(e) => onBeginDrag(e, "resize-end")}
          className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
        />
      )}
    </motion.div>
  );
}

function ReminderBlock({
  block,
  offsetMin,
  hourHeight,
  dimmed,
  onBeginDrag,
  onContextMenu,
  onToggleComplete,
  onHover,
  onHoverEnd,
}: {
  block: GridBlock;
  offsetMin: number;
  hourHeight: number;
  dimmed: boolean;
  onBeginDrag: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggleComplete: () => void;
  onHover: (e: React.MouseEvent) => void;
  onHoverEnd: () => void;
}) {
  const { title, color, startMin, endMin, col, cols, completed } = block;
  const accent = color ?? FALLBACK_COLOR;
  const { top, height } = blockGeometry(startMin, endMin, offsetMin, hourHeight);

  return (
    <motion.div
      initial={POOF_INITIAL}
      animate={dimmed ? { opacity: 0 } : POOF_ANIMATE}
      exit={POOF_EXIT}
      transition={POOF_TRANSITION}
      onPointerDown={onBeginDrag}
      onContextMenu={onContextMenu}
      onMouseEnter={onHover}
      onMouseMove={onHover}
      onMouseLeave={onHoverEnd}
      className={cn(
        "absolute flex cursor-grab items-center gap-1 overflow-hidden rounded-md border border-dashed bg-background/80 px-1.5 shadow-sm active:cursor-grabbing",
        dimmed && "pointer-events-none",
      )}
      style={{ top, height, ...colStyle(col, cols), borderColor: accent }}
    >
      <ReminderToggle completed={completed} color={color} onToggle={onToggleComplete} />
      <span className={cn("pointer-events-none truncate text-[11px] font-medium leading-tight", completed && "line-through opacity-60")}>
        {title}
      </span>
      {block.reminder?.recurring && (
        <Repeat className="pointer-events-none size-3 shrink-0 opacity-70" />
      )}
    </motion.div>
  );
}

function PreviewBlock({
  kind,
  title,
  color,
  completed,
  startMin,
  endMin,
  offsetMin,
  hourHeight,
}: {
  kind: GridBlockKind;
  title: string;
  color: string | null;
  completed?: boolean;
  startMin: number;
  endMin: number;
  offsetMin: number;
  hourHeight: number;
}) {
  const accent = color ?? FALLBACK_COLOR;
  const { top, height } = blockGeometry(startMin, endMin, offsetMin, hourHeight);

  if (kind === "reminder") {
    return (
      <div
        className="pointer-events-none absolute inset-x-0 z-20 flex items-center gap-1 overflow-hidden rounded-md border border-dashed bg-background px-1.5 shadow-lg ring-2 ring-primary/60"
        style={{ top, height, borderColor: accent }}
      >
        <ReminderIcon completed={completed} color={color} />
        <span className="truncate text-[11px] font-medium">{title}</span>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 overflow-hidden rounded-sm py-0.5 pl-2.5 pr-1.5 text-[11px] leading-tight shadow-lg ring-2 ring-primary/60"
      style={{ top, height, backgroundColor: tint(color) }}
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-[3px] w-[3px] rounded-sm"
        style={{ backgroundColor: accent }}
      />
      <div className="truncate font-medium">{title}</div>
      <div className="truncate opacity-70">
        {minutesLabel(startMin)} – {minutesLabel(endMin)}
      </div>
    </div>
  );
}
