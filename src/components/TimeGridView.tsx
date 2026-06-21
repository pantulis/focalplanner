import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { addMinutes, format, parseISO, startOfDay } from "date-fns";
import { Circle, CircleCheck, MapPin, Repeat } from "lucide-react";
import type { EventDto, ReminderDto } from "@/lib/api";
import {
  DAY_MINUTES,
  GridBlock,
  GridBlockKind,
  HOUR_HEIGHT,
  clamp,
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
  onEditEvent: (event: EventDto) => void;
  onEditReminder: (reminder: ReminderDto) => void;
  onToggleReminder: (reminder: ReminderDto, completed: boolean) => void;
  onEmptyContextMenu: (e: React.MouseEvent, start: Date) => void;
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
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const GRID_HEIGHT = 24 * HOUR_HEIGHT;
const FALLBACK_COLOR = "#3b82f6";
const SNAP = 15; // minutes

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
  return /^#[0-9a-fA-F]{6}$/.test(c) ? `${c}22` : c;
}

function minutesLabel(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function blockGeometry(startMin: number, endMin: number) {
  return {
    top: (startMin / 60) * HOUR_HEIGHT,
    height: Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 18),
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
  onEditEvent,
  onEditReminder,
  onToggleReminder,
  onEmptyContextMenu,
  onUpdateTimes,
  onUpdateReminderDue,
  onEventContextMenu,
  onReminderContextMenu,
  dropPreview,
  onReminderDragStart,
  onEmptyAllDayContextMenu,
  allDayHighlightDay,
  workHours,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const evs = events ?? [];
  const rems = reminders ?? [];

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const setBoth = (d: DragState | null) => {
    dragRef.current = d;
    setDrag(d);
  };

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
      const startHour = Math.min(workHours.workdayStart, workHours.weekendStart);
      scrollRef.current.scrollTop = Math.max(
        nowOffsetPx() - 120,
        startHour * HOUR_HEIGHT - 12,
      );
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
        Math.round((e.clientY - d.pointerStartY) / HOUR_HEIGHT * 60 / SNAP) * SNAP;
      const dur = d.origEndMin - d.origStartMin;
      let { startMin, endMin, dayIndex } = d;

      if (d.mode === "move") {
        startMin = clamp(d.origStartMin + deltaMin, 0, DAY_MINUTES - dur);
        endMin = startMin + dur;
        if (days.length > 1 && colsRef.current) {
          const r = colsRef.current.getBoundingClientRect();
          const colW = r.width / days.length;
          dayIndex = clamp(
            Math.floor((e.clientX - r.left) / colW),
            0,
            days.length - 1,
          );
        }
      } else if (d.mode === "resize-end") {
        endMin = clamp(d.origEndMin + deltaMin, d.origStartMin + SNAP, DAY_MINUTES);
      } else {
        startMin = clamp(d.origStartMin + deltaMin, 0, d.origEndMin - SNAP);
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

  // Time (rounded to the snap grid) under a pointer Y within the columns.
  function minuteFromY(clientY: number): number {
    const top = colsRef.current?.getBoundingClientRect().top ?? 0;
    return clamp(
      Math.round(((clientY - top) / HOUR_HEIGHT) * 60 / SNAP) * SNAP,
      0,
      DAY_MINUTES,
    );
  }

  // Tint Saturday/Sunday columns (only meaningful in multi-day / week view).
  const weekendClass = (d: Date) =>
    days.length > 1 && (d.getDay() === 0 || d.getDay() === 6) ? "bg-muted/40" : "";

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

  return (
    <div className="flex h-full select-none flex-col">
      {/* Day headers */}
      <div className="flex border-b border-border" style={{ paddingRight: scrollbarWidth }}>
        <div className="w-14 shrink-0" />
        {days.map((d) => (
          <div
            key={d.toISOString()}
            className={cn(
              "min-w-0 flex-1 border-l border-border px-2 py-1.5 text-center",
              weekendClass(d),
            )}
          >
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
        <div className="flex border-b border-border" style={{ paddingRight: scrollbarWidth }}>
          <div className="flex w-14 shrink-0 items-start justify-end pr-2 pt-1 text-[10px] uppercase text-muted-foreground">
            all-day
          </div>
          {days.map((d) => (
            <div
              key={d.toISOString()}
              className={cn(
                "min-h-7 min-w-0 flex-1 space-y-0.5 border-l border-border p-1",
                weekendClass(d),
              )}
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
                  className="block w-full truncate rounded border-l-2 px-1 text-left text-[11px]"
                  style={{ backgroundColor: tint(e.color), borderLeftColor: e.color ?? FALLBACK_COLOR }}
                >
                  {e.title}
                </motion.button>
              ))}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex" style={{ height: GRID_HEIGHT }}>
          {/* Hour gutter */}
          <div className="relative w-14 shrink-0">
            {HOURS.filter((h) => h > 0).map((h) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground"
                style={{ top: h * HOUR_HEIGHT }}
              >
                {minutesLabel(h * 60)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div ref={colsRef} className="flex flex-1">
            {days.map((d, dayIndex) => {
              const blocks = dayGridBlocks(evs, rems, d);
              const showNow = isToday(d);
              const showPreview = drag && drag.dayIndex === dayIndex;
              return (
                <div
                  key={d.toISOString()}
                  data-grid-day={dayIndex}
                  className={cn(
                    "relative flex-1 border-l border-border",
                    weekendClass(d),
                    dropPreview?.day === dayIndex && "ring-2 ring-inset ring-primary/60",
                  )}
                  onContextMenu={(e) =>
                    onEmptyContextMenu(e, addMinutes(startOfDay(d), minuteFromY(e.clientY)))
                  }
                >
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="border-t border-border/40 hover:bg-accent/40"
                      style={{ height: HOUR_HEIGHT }}
                    />
                  ))}

                  {(() => {
                    const weekend = d.getDay() === 0 || d.getDay() === 6;
                    const ws = weekend ? workHours.weekendStart : workHours.workdayStart;
                    const we = weekend ? workHours.weekendEnd : workHours.workdayEnd;
                    return (
                      <>
                        {ws > 0 && (
                          <div
                            className="pointer-events-none absolute inset-x-0 top-0 bg-foreground/[0.05]"
                            style={{ height: ws * HOUR_HEIGHT }}
                          />
                        )}
                        {we < 24 && (
                          <div
                            className="pointer-events-none absolute inset-x-0 bg-foreground/[0.05]"
                            style={{ top: we * HOUR_HEIGHT, height: (24 - we) * HOUR_HEIGHT }}
                          />
                        )}
                      </>
                    );
                  })()}

                  {showNow && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500"
                      style={{ top: nowOffsetPx() }}
                    >
                      <div className="absolute -left-1 -top-1 size-2 rounded-full bg-red-500" />
                    </div>
                  )}

                  {dropPreview?.day === dayIndex && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-primary"
                      style={{ top: (dropPreview.minute / 60) * HOUR_HEIGHT }}
                    >
                      <span className="absolute -top-2.5 left-1 rounded bg-primary px-1 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                        {minutesLabel(dropPreview.minute)}
                      </span>
                    </div>
                  )}

                  <AnimatePresence initial={false}>
                    {blocks.map((b) =>
                      b.kind === "event" ? (
                        <EventBlock
                          key={b.id}
                          block={b}
                          dimmed={active && b.id === dragId}
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
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom tray: date-only reminders. Drag one onto the grid to give it a
          time, or drag a scheduled reminder down here to clear its time. */}
      <div
        className="relative flex h-[25vh] shrink-0 border-t border-border"
        style={{ paddingRight: scrollbarWidth }}
      >
        <div className="flex w-14 shrink-0 items-start justify-end pr-2 pt-1.5 text-right text-[10px] leading-tight text-muted-foreground">
          All-day tasks
        </div>
        {days.map((d, dayIndex) => (
          <div
            key={d.toISOString()}
            data-allday-day={dayIndex}
            onContextMenu={(e) => onEmptyAllDayContextMenu(e, d)}
            className={cn(
              "flex min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto border-l border-border p-1",
              weekendClass(d),
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

      {hover && <HoverCard {...hover} />}
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

function HoverCard({ x, y, info }: { x: number; y: number; info: HoverInfo }) {
  const flipX = x > window.innerWidth - 280;
  const style: CSSProperties = {
    left: flipX ? x - 14 : x + 14,
    top: Math.min(y + 14, window.innerHeight - 130),
    transform: flipX ? "translateX(-100%)" : undefined,
  };

  const color = (info.kind === "event" ? info.event.color : info.reminder.color) ?? FALLBACK_COLOR;
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

  return createPortal(
    <div
      className="pointer-events-none fixed z-[80] w-64 rounded-md border border-border bg-popover p-2.5 text-popover-foreground shadow-lg"
      style={style}
    >
      <div className={cn("truncate text-sm font-semibold", completed && "line-through opacity-70")}>
        {title}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span
          className="size-2.5 shrink-0 rounded-full border border-black/10"
          style={{ backgroundColor: color }}
        />
        <span className="truncate">{typeLine}</span>
        {recurring && <Repeat className="size-3 shrink-0" />}
      </div>
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
  dimmed,
  onBeginDrag,
  onEdit,
  onContextMenu,
  onHover,
  onHoverEnd,
}: {
  block: GridBlock;
  dimmed: boolean;
  onBeginDrag: (e: React.PointerEvent, mode: DragMode) => void;
  onEdit: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onHover: (e: React.MouseEvent) => void;
  onHoverEnd: () => void;
}) {
  const { title, color, startMin, endMin, col, cols } = block;
  const accent = color ?? FALLBACK_COLOR;
  const { top, height } = blockGeometry(startMin, endMin);
  const draggable = !block.continuesBefore && !block.continuesAfter;

  return (
    <motion.div
      initial={POOF_INITIAL}
      animate={dimmed ? { opacity: 0 } : POOF_ANIMATE}
      exit={POOF_EXIT}
      transition={POOF_TRANSITION}
      onPointerDown={(e) => draggable && onBeginDrag(e, "move")}
      onClick={() => !draggable && onEdit()}
      onContextMenu={onContextMenu}
      onMouseEnter={onHover}
      onMouseMove={onHover}
      onMouseLeave={onHoverEnd}
      className={cn(
        "absolute overflow-hidden rounded-md border-l-2 px-1.5 py-0.5 text-[11px] leading-tight shadow-sm",
        dimmed && "pointer-events-none",
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
      )}
      style={{ top, height, ...colStyle(col, cols), backgroundColor: tint(color), borderLeftColor: accent }}
    >
      {draggable && (
        <div
          onPointerDown={(e) => onBeginDrag(e, "resize-start")}
          className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize"
        />
      )}
      <div className="pointer-events-none truncate font-medium">{title}</div>
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
  dimmed,
  onBeginDrag,
  onContextMenu,
  onToggleComplete,
  onHover,
  onHoverEnd,
}: {
  block: GridBlock;
  dimmed: boolean;
  onBeginDrag: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggleComplete: () => void;
  onHover: (e: React.MouseEvent) => void;
  onHoverEnd: () => void;
}) {
  const { title, color, startMin, endMin, col, cols, completed } = block;
  const accent = color ?? FALLBACK_COLOR;
  const { top, height } = blockGeometry(startMin, endMin);

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
}: {
  kind: GridBlockKind;
  title: string;
  color: string | null;
  completed?: boolean;
  startMin: number;
  endMin: number;
}) {
  const accent = color ?? FALLBACK_COLOR;
  const { top, height } = blockGeometry(startMin, endMin);

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
      className="pointer-events-none absolute inset-x-0 z-20 overflow-hidden rounded-md border-l-2 px-1.5 py-0.5 text-[11px] leading-tight shadow-lg ring-2 ring-primary/60"
      style={{ top, height, backgroundColor: tint(color), borderLeftColor: accent }}
    >
      <div className="truncate font-medium">{title}</div>
      <div className="truncate opacity-70">
        {minutesLabel(startMin)} – {minutesLabel(endMin)}
      </div>
    </div>
  );
}
