import { useEffect, useMemo, useRef, useState } from "react";
import { addMinutes, format, isSameDay, isToday, parseISO, startOfDay } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import {
  Calendar as CalendarIcon,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CalendarX2,
  CircleCheck,
  Clock,
  ListTodo,
  Moon,
  Pencil,
  Sun,
  Sunrise,
  Sunset,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import type {
  CalendarDto,
  EventDto,
  EventInput,
  ReminderDto,
  ReminderInput,
} from "@/lib/api";
import {
  useAccessStatus,
  useCalendars,
  useEvents,
  useReminders,
  useEventMutations,
  useReminderMutations,
} from "@/lib/queries";
import {
  navigate,
  viewDays,
  viewLabel,
  viewRange,
  clamp,
  DAY_MINUTES,
  HOUR_HEIGHT,
  type PlannerView,
} from "@/lib/planner";
import { AREAS, areaMembers, useAreaConfig } from "@/lib/areas";
import {
  TIMES_OF_DAY,
  rescheduleDate,
  rescheduleHint,
  toLocalDateTime,
  type WhenId,
} from "@/lib/reschedule";
import { useSettings } from "@/lib/settings";
import { useSyncController } from "@/lib/sync";
import { useMenubarTray } from "@/lib/tray";
import { ContextMenu, type MenuNode } from "@/components/ui/context-menu";
import { PermissionGate } from "@/components/PermissionGate";
import { AppSidebar, type Section } from "@/components/AppSidebar";
import { UpdateBanner } from "@/components/UpdateBanner";
import { useUpdateCheck } from "@/lib/useUpdateCheck";
import { PlannerToolbar } from "@/components/PlannerToolbar";
import { TimeGridView } from "@/components/TimeGridView";
import { FocusBoard } from "@/components/FocusBoard";
import { dueForSector, sectorLabel, type Sector } from "@/lib/sectors";
import { ReminderList, type StatusFilter } from "@/components/ReminderList";
import { EventInspector } from "@/components/EventInspector";
import { ReminderInspector } from "@/components/ReminderInspector";
import { SettingsDialog, type Pane as SettingsPane } from "@/components/SettingsDialog";
import { ConfirmDialog, type ConfirmOptions } from "@/components/ConfirmDialog";
import { FeatureTour } from "@/components/FeatureTour";
import { GitHubConnectDialog } from "@/components/GitHubConnectDialog";
import { AboutDialog } from "@/components/AboutDialog";

export default function App() {
  const access = useAccessStatus();
  const granted =
    access.data &&
    (access.data.events === "fullAccess" ||
      access.data.reminders === "fullAccess");

  if (access.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!granted) {
    return (
      <PermissionGate
        status={
          access.data ?? { events: "notDetermined", reminders: "notDetermined" }
        }
        onGranted={() => access.refetch()}
      />
    );
  }

  return <Planner />;
}

const SECTION_TITLE: Record<Section, string> = {
  today: "Daily",
  weekly: "Weekly",
  planner: "Planner",
};

function Planner() {
  const calendars = useCalendars(true);
  const [areaConfig, setAreaConfig] = useAreaConfig();
  const { settings, update: updateSettings, loaded: settingsLoaded } = useSettings();
  const queryClient = useQueryClient();
  const { update, dismiss: dismissUpdate } = useUpdateCheck();

  useMenubarTray(
    settingsLoaded && settings.menubarEnabled,
    settings.ignoredCalendarIds,
    settings.ignoredListIds,
  );

  const sync = useSyncController({
    settings,
    updateSettings,
    areaConfig,
    setAreaConfig,
    settingsLoaded,
  });
  const [connectOpen, setConnectOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  // Native "About FocalPlanner" menu item opens the in-app About dialog.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("menu-about", () => setAboutOpen(true)).then((un) => {
      unlisten = un;
    });
    return () => unlisten?.();
  }, []);

  // Reactive: refetch when EventKit reports an external change (debounced).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unlisten: (() => void) | undefined;
    api.startChangeObserver();
    listen("eventkit-changed", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["events"] });
        queryClient.invalidateQueries({ queryKey: ["reminders"] });
        queryClient.invalidateQueries({ queryKey: ["calendars"] });
      }, 400);
    }).then((un) => {
      unlisten = un;
    });
    return () => {
      if (timer) clearTimeout(timer);
      unlisten?.();
    };
  }, [queryClient]);

  const [section, setSection] = useState<Section>("today");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [activeArea, setActiveArea] = useState<string>("all");
  // Reminder list/status filters remembered per area of focus.
  const [areaFilters, setAreaFilters] = useState<
    Record<string, { list: string; status: StatusFilter }>
  >({});
  const reminderFilter = areaFilters[activeArea] ?? { list: "all", status: "today" as StatusFilter };
  const setReminderFilter = (patch: Partial<{ list: string; status: StatusFilter }>) =>
    setAreaFilters((prev) => ({
      ...prev,
      [activeArea]: { ...(prev[activeArea] ?? { list: "all", status: "today" }), ...patch },
    }));
  const [showReminders, setShowReminders] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPane, setSettingsPane] = useState<SettingsPane>("general");

  // Feature tour — auto-shown once per machine (localStorage, not synced).
  const TOUR_KEY = "focalplanner.tourSeen";
  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_KEY)) setTourOpen(true);
    } catch {
      /* ignore */
    }
  }, []);
  const closeTour = () => {
    setTourOpen(false);
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      /* ignore */
    }
  };
  const replayTour = () => {
    setSettingsOpen(false);
    setTourOpen(true);
  };
  const openSettings = (pane: SettingsPane = "general") => {
    setSettingsPane(pane);
    setSettingsOpen(true);
  };

  const view: PlannerView = section === "weekly" ? "week" : "day";
  const weekStartsOn = settings.weekStartsOn;
  const range = useMemo(
    () => viewRange(view, anchor, weekStartsOn),
    [view, anchor, weekStartsOn],
  );
  const days = useMemo(
    () => viewDays(view, anchor, weekStartsOn),
    [view, anchor, weekStartsOn],
  );

  // Calendars / lists not hidden via Settings.
  const visibleCalendars = useMemo(
    () =>
      (calendars.data?.events ?? []).filter(
        (c) => !settings.ignoredCalendarIds.includes(c.id),
      ),
    [calendars.data, settings.ignoredCalendarIds],
  );
  const visibleLists = useMemo(
    () =>
      (calendars.data?.reminderLists ?? []).filter(
        (c) => !settings.ignoredListIds.includes(c.id),
      ),
    [calendars.data, settings.ignoredListIds],
  );

  const events = useEvents(range.start, range.end, undefined, true);
  const reminders = useReminders(undefined, settings.showCompletedReminders, true);

  const eventMx = useEventMutations();
  const reminderMx = useReminderMutations();

  // Optimistic time overrides so dragged events don't snap back before refetch.
  const [pendingTimes, setPendingTimes] = useState<
    Record<string, { start: string; end: string }>
  >({});

  useEffect(() => {
    setPendingTimes((p) => (Object.keys(p).length ? {} : p));
  }, [events.dataUpdatedAt]);

  const effectiveEvents = useMemo(() => {
    if (!events.data || !Object.keys(pendingTimes).length) return events.data;
    return events.data.map((e) =>
      e.id && pendingTimes[e.id]
        ? { ...e, start: pendingTimes[e.id].start, end: pendingTimes[e.id].end }
        : e,
    );
  }, [events.data, pendingTimes]);

  function updateEventTimes(event: EventDto, start: string, end: string) {
    if (!event.id) return;
    const id = event.id;
    setPendingTimes((p) => ({ ...p, [id]: { start, end } }));
    eventMx.update.mutate(
      {
        id,
        title: event.title,
        start,
        end,
        allDay: event.allDay,
        calendarId: event.calendarId,
        notes: event.notes,
        location: event.location,
      },
      {
        onError: (e) => {
          fail(e);
          setPendingTimes((p) => {
            const next = { ...p };
            delete next[id];
            return next;
          });
        },
      },
    );
  }

  // Optimistic due overrides for dragged reminders.
  const [pendingDue, setPendingDue] = useState<Record<string, string>>({});

  useEffect(() => {
    setPendingDue((p) => (Object.keys(p).length ? {} : p));
  }, [reminders.dataUpdatedAt]);

  const effectiveReminders = useMemo(() => {
    if (!reminders.data || !Object.keys(pendingDue).length) return reminders.data;
    return reminders.data.map((r) =>
      r.id && pendingDue[r.id] ? { ...r, due: pendingDue[r.id] } : r,
    );
  }, [reminders.data, pendingDue]);

  function updateReminderDue(reminder: ReminderDto, dueLocal: string) {
    if (!reminder.id) return;
    const id = reminder.id;
    setPendingDue((p) => ({ ...p, [id]: dueLocal }));
    reminderMx.update.mutate(
      {
        id,
        title: reminder.title,
        due: dueLocal,
        priority: reminder.priority,
        listId: reminder.listId,
        notes: reminder.notes,
      },
      {
        onError: (e) => {
          fail(e);
          setPendingDue((p) => {
            const next = { ...p };
            delete next[id];
            return next;
          });
        },
      },
    );
  }

  // ── Drag a reminder from the sidebar onto the planner to schedule it ──────
  // Pointer-based (HTML5 drag-and-drop is unreliable in WKWebView). A floating
  // ghost follows the cursor; the day column under the pointer is found via
  // elementFromPoint + the `data-grid-day` attribute the grid renders.
  type RemDropTarget =
    | { kind: "grid"; day: number; minute: number }
    | { kind: "allday"; day: number }
    | { kind: "sector"; sector: Sector };
  const [remDrag, setRemDrag] = useState<{
    reminder: ReminderDto;
    x: number;
    y: number;
    target: RemDropTarget | null;
  } | null>(null);

  const REM_SNAP = 15; // snap drops to :00/:15/:30/:45 — mirrors TimeGridView

  // Drop target under a pointer: a timed grid slot, an all-day column, or none.
  function dropAt(x: number, y: number): RemDropTarget | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const col = el?.closest<HTMLElement>("[data-grid-day]");
    if (col) {
      const dayIndex = Number(col.dataset.gridDay);
      if (!Number.isNaN(dayIndex) && days[dayIndex]) {
        const top = col.getBoundingClientRect().top;
        const minute = clamp(
          Math.round((((y - top) / HOUR_HEIGHT) * 60) / REM_SNAP) * REM_SNAP,
          0,
          DAY_MINUTES - REM_SNAP,
        );
        return { kind: "grid", day: dayIndex, minute };
      }
    }
    const allday = el?.closest<HTMLElement>("[data-allday-day]");
    if (allday) {
      const dayIndex = Number(allday.dataset.alldayDay);
      if (!Number.isNaN(dayIndex) && days[dayIndex]) return { kind: "allday", day: dayIndex };
    }
    const sector = el?.closest<HTMLElement>("[data-sector]");
    if (sector?.dataset.sector) {
      return { kind: "sector", sector: sector.dataset.sector as Sector };
    }
    return null;
  }

  function startReminderDrag(e: React.PointerEvent, reminder: ReminderDto) {
    if (e.button !== 0) return; // left button only
    const startX = e.clientX;
    const startY = e.clientY;
    let active = false;

    const onMove = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
        active = true;
      }
      setRemDrag({ reminder, x: ev.clientX, y: ev.clientY, target: dropAt(ev.clientX, ev.clientY) });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (active) {
        const t = dropAt(ev.clientX, ev.clientY);
        if (t?.kind === "grid") {
          updateReminderDue(
            reminder,
            toLocalDateTime(addMinutes(startOfDay(days[t.day]), t.minute)),
          );
        } else if (t?.kind === "allday") {
          updateReminderDue(reminder, format(days[t.day], "yyyy-MM-dd"));
        } else if (t?.kind === "sector") {
          const due = dueForSector(t.sector, reminder.due, new Date(), weekStartsOn);
          if (due === null) clearReminderDue(reminder);
          else updateReminderDue(reminder, due);
        }
      }
      setRemDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const fmtMinute = (m: number) =>
    `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  // Filter by hidden calendars/lists (Settings) and the active Area of Focus.
  const filteredEvents = useMemo(() => {
    if (!effectiveEvents) return effectiveEvents;
    const ignored = new Set(settings.ignoredCalendarIds);
    const areaSet =
      activeArea === "all"
        ? null
        : new Set(areaMembers(areaConfig, activeArea).calendarIds);
    return effectiveEvents.filter((e) => {
      if (e.calendarId != null && ignored.has(e.calendarId)) return false;
      if (areaSet) return e.calendarId != null && areaSet.has(e.calendarId);
      return true;
    });
  }, [effectiveEvents, activeArea, areaConfig, settings.ignoredCalendarIds]);

  const filteredReminders = useMemo(() => {
    if (!effectiveReminders) return effectiveReminders;
    const ignored = new Set(settings.ignoredListIds);
    const areaSet =
      activeArea === "all"
        ? null
        : new Set(areaMembers(areaConfig, activeArea).listIds);
    return effectiveReminders.filter((r) => {
      if (r.listId != null && ignored.has(r.listId)) return false;
      if (areaSet) return r.listId != null && areaSet.has(r.listId);
      return true;
    });
  }, [effectiveReminders, activeArea, areaConfig, settings.ignoredListIds]);

  // Areas selectable only when they have at least one *visible* calendar/list.
  const availableAreas = useMemo(() => {
    const calIds = new Set(visibleCalendars.map((c) => c.id));
    const listIds = new Set(visibleLists.map((c) => c.id));
    const order = settings.areaOrder ?? [];
    // When the calendars list is momentarily empty (a transient refetch under
    // heavy EventKit churn, or still loading), don't drop configured areas —
    // fall back to showing any area that has members in the saved config.
    const haveCalendars = calIds.size > 0 || listIds.size > 0;
    return AREAS.filter((a) => {
      const m = areaMembers(areaConfig, a.id);
      if (!haveCalendars) return m.calendarIds.length > 0 || m.listIds.length > 0;
      return (
        m.calendarIds.some((id) => calIds.has(id)) ||
        m.listIds.some((id) => listIds.has(id))
      );
    }).sort((a, b) => {
      // Custom order first; unordered areas keep their predefined order.
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [areaConfig, visibleCalendars, visibleLists, settings.areaOrder]);

  // ── Review panel (Planner view) ──────────────────────────────────────────
  const inboxCount = useMemo(
    () => (filteredReminders ?? []).filter((r) => !r.completed && !r.due).length,
    [filteredReminders],
  );
  const overdueCount = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    return (filteredReminders ?? []).filter(
      (r) => !r.completed && r.due && startOfDay(parseISO(r.due)).getTime() < today,
    ).length;
  }, [filteredReminders]);
  const markAreaReviewed = (id: string) =>
    updateSettings({
      areaReviewedAt: { ...(settings.areaReviewedAt ?? {}), [id]: new Date().toISOString() },
    });

  useEffect(() => {
    if (activeArea !== "all" && !availableAreas.some((a) => a.id === activeArea)) {
      setActiveArea("all");
    }
  }, [availableAreas, activeArea]);

  // On startup, land on the first configured area rather than "All Areas".
  const didInitArea = useRef(false);
  useEffect(() => {
    if (!didInitArea.current && availableAreas.length > 0) {
      didInitArea.current = true;
      setActiveArea(availableAreas[0].id);
    }
  }, [availableAreas]);

  const [eventDialog, setEventDialog] = useState<{
    open: boolean;
    event: EventDto | null;
    initialStart: Date | null;
    initialEnd: Date | null;
    initialCalendarId: string | null;
  }>({ open: false, event: null, initialStart: null, initialEnd: null, initialCalendarId: null });
  const [reminderDialog, setReminderDialog] = useState<{
    open: boolean;
    reminder: ReminderDto | null;
    initialDue: string | null;
    initialListId: string | null;
  }>({ open: false, reminder: null, initialDue: null, initialListId: null });

  const fail = (e: unknown) => toast.error(String(e));

  // Only one inspector (event or reminder) is open at a time.
  function openEventEditor(
    event: EventDto | null,
    initialStart: Date | null = null,
    initialEnd: Date | null = null,
    initialCalendarId: string | null = null,
  ) {
    setReminderDialog({ open: false, reminder: null, initialDue: null, initialListId: null });
    setEventDialog({ open: true, event, initialStart, initialEnd, initialCalendarId });
  }
  function openReminderEditor(
    reminder: ReminderDto | null,
    initialDue: string | null = null,
    initialListId: string | null = null,
  ) {
    setEventDialog({ open: false, event: null, initialStart: null, initialEnd: null, initialCalendarId: null });
    setReminderDialog({ open: true, reminder, initialDue, initialListId });
  }

  function selectSection(s: Section) {
    if (s === "today") setAnchor(new Date());
    setSection(s);
  }

  // ── Context menu actions ──────────────────────────────────────────────
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuNode[] } | null>(
    null,
  );
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);

  function eligible(items: CalendarDto[] | undefined, ids: string[]): CalendarDto[] {
    const editable = (items ?? []).filter((c) => c.editable);
    if (activeArea === "all") return editable;
    const set = new Set(ids);
    return editable.filter((c) => set.has(c.id));
  }

  function moveEventToCalendar(event: EventDto, calendarId: string) {
    if (!event.id) return;
    eventMx.update.mutate(
      {
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        calendarId,
        notes: event.notes,
        location: event.location,
      },
      { onSuccess: () => toast.success("Event moved"), onError: fail },
    );
  }

  function moveReminderToList(reminder: ReminderDto, listId: string) {
    if (!reminder.id) return;
    reminderMx.update.mutate(
      {
        id: reminder.id,
        title: reminder.title,
        due: reminder.due,
        priority: reminder.priority,
        listId,
        notes: reminder.notes,
      },
      { onSuccess: () => toast.success("Reminder moved"), onError: fail },
    );
  }

  function clearReminderDue(reminder: ReminderDto) {
    if (!reminder.id) return;
    reminderMx.update.mutate(
      {
        id: reminder.id,
        title: reminder.title,
        due: null,
        priority: reminder.priority,
        listId: reminder.listId,
        notes: reminder.notes,
      },
      { onSuccess: () => toast.success("Due date removed"), onError: fail },
    );
  }

  function rescheduleEvent(event: EventDto, dt: Date) {
    const dur = new Date(event.end).getTime() - new Date(event.start).getTime();
    updateEventTimes(
      event,
      dt.toISOString(),
      new Date(dt.getTime() + dur).toISOString(),
    );
  }

  function rescheduleReminder(reminder: ReminderDto, dt: Date) {
    updateReminderDue(reminder, toLocalDateTime(dt));
  }

  /**
   * Submenu items for "Move to …": the current target first (disabled), a
   * separator, then the remaining valid targets.
   */
  function moveTargetNodes(
    targets: CalendarDto[],
    current: { id?: string | null; title?: string | null; color?: string | null },
    prefix: string,
    emptyLabel: string,
    onPick: (id: string) => void,
  ): MenuNode[] {
    const rest = targets.filter((c) => c.id !== current.id);
    const nodes: MenuNode[] = [];
    if (current.id) {
      nodes.push({
        id: `${prefix}-current`,
        label: current.title ?? "Current",
        colorDot: current.color,
        pill: "Current",
        disabled: true,
      });
    }
    rest.forEach((c, i) =>
      nodes.push({
        id: `${prefix}-${c.id}`,
        label: c.title,
        colorDot: c.color,
        separatorBefore: !!current.id && i === 0,
        onSelect: () => onPick(c.id),
      }),
    );
    return nodes.length ? nodes : [{ id: "none", label: emptyLabel, disabled: true }];
  }

  // Reschedule relative to the day in focus (`anchor`). When that day isn't
  // today, "Tomorrow" reads as "The following day" (and "Today" as "This day").
  function rescheduleNode(
    onPick: (dt: Date) => void,
    base: Date,
    includeToday = false,
  ): MenuNode {
    const baseIsToday = isToday(base);
    const whens: { id: WhenId; label: string }[] = [
      ...(includeToday
        ? [{ id: "today" as WhenId, label: baseIsToday ? "Today" : "This day" }]
        : []),
      { id: "tomorrow", label: baseIsToday ? "Tomorrow" : "The following day" },
      { id: "weekend", label: "Next weekend" },
      { id: "workday", label: "Next workday" },
    ];
    const whenIcon: Record<string, LucideIcon> = {
      today: CalendarCheck,
      tomorrow: CalendarClock,
      weekend: CalendarRange,
      workday: CalendarDays,
    };
    const timeIcon: Record<string, LucideIcon> = {
      morning: Sunrise,
      afternoon: Sun,
      evening: Sunset,
      night: Moon,
    };
    return {
      id: "reschedule",
      label: "Reschedule",
      icon: Clock,
      separatorBefore: true,
      children: whens.map((w) => ({
        id: w.id,
        label: w.label,
        icon: whenIcon[w.id],
        children: TIMES_OF_DAY.map((t) => ({
          id: `${w.id}-${t.id}`,
          label: t.label,
          icon: timeIcon[t.id],
          hint: rescheduleHint(w.id, t.hour, base),
          onSelect: () => onPick(rescheduleDate(w.id, t.hour, base)),
        })),
      })),
    };
  }

  function buildEventMenu(event: EventDto): MenuNode[] {
    const cals = eligible(
      visibleCalendars,
      areaMembers(areaConfig, activeArea).calendarIds,
    );
    return [
      { id: "edit", label: "Edit…", icon: Pencil, onSelect: () => openEventEditor(event) },
      {
        id: "move",
        label: "Move to Calendar",
        icon: CalendarIcon,
        separatorBefore: true,
        children: moveTargetNodes(
          cals,
          { id: event.calendarId, title: event.calendarTitle, color: event.color },
          "cal",
          "No calendars in area",
          (id) => moveEventToCalendar(event, id),
        ),
      },
      rescheduleNode((dt) => rescheduleEvent(event, dt), anchor),
      {
        id: "delete",
        label: "Delete",
        icon: Trash2,
        danger: true,
        separatorBefore: true,
        onSelect: () =>
          event.id &&
          setConfirm({
            title: "Delete event?",
            description: `“${event.title}” will be removed from your calendar.`,
            confirmLabel: "Delete",
            destructive: true,
            onConfirm: () => deleteEvent(event.id!),
          }),
      },
    ];
  }

  function buildReminderMenu(reminder: ReminderDto): MenuNode[] {
    const lists = eligible(
      visibleLists,
      areaMembers(areaConfig, activeArea).listIds,
    );
    const items: MenuNode[] = [];
    if (!reminder.completed && reminder.id) {
      items.push({
        id: "complete",
        label: "Mark as completed",
        icon: CircleCheck,
        onSelect: () =>
          reminderMx.toggle.mutate(
            { id: reminder.id!, completed: true },
            { onError: fail },
          ),
      });
    }
    items.push({
      id: "edit",
      label: "Edit…",
      icon: Pencil,
      onSelect: () => openReminderEditor(reminder),
    });
    items.push(
      {
        id: "move",
        label: "Move to List",
        icon: ListTodo,
        separatorBefore: true,
        children: moveTargetNodes(
          lists,
          { id: reminder.listId, title: reminder.listTitle, color: reminder.color },
          "list",
          "No lists in area",
          (id) => moveReminderToList(reminder, id),
        ),
      },
      rescheduleNode(
        (dt) => rescheduleReminder(reminder, dt),
        anchor,
        !reminder.due || !isSameDay(parseISO(reminder.due), anchor),
      ),
    );
    if (reminder.due) {
      items.push({
        id: "clear-due",
        label: "Remove due date",
        icon: CalendarX2,
        onSelect: () => clearReminderDue(reminder),
      });
    }
    items.push({
      id: "delete",
      label: "Delete",
      icon: Trash2,
      danger: true,
      separatorBefore: true,
      onSelect: () =>
        reminder.id &&
        setConfirm({
          title: "Delete reminder?",
          description: `“${reminder.title}” will be permanently deleted.`,
          confirmLabel: "Delete",
          destructive: true,
          onConfirm: () => deleteReminder(reminder.id!),
        }),
    });
    return items;
  }

  function openEventMenu(e: React.MouseEvent, event: EventDto) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, items: buildEventMenu(event) });
  }
  function openReminderMenu(e: React.MouseEvent, reminder: ReminderDto) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, items: buildReminderMenu(reminder) });
  }

  // Drag-to-create: ask whether to make an event or a reminder.
  // Right-click an empty planner slot → create an event in an area calendar.
  function openEmptyEventMenu(e: React.MouseEvent, start: Date) {
    e.preventDefault();
    const eventChildren: MenuNode[] = eligibleCalendars.length
      ? eligibleCalendars.map((c) => ({
          id: `new-cal-${c.id}`,
          label: c.title,
          colorDot: c.color,
          onSelect: () => openEventEditor(null, start, addMinutes(start, 60), c.id),
        }))
      : [{ id: "none", label: "No calendars in this area", disabled: true }];
    const reminderChildren: MenuNode[] = eligibleLists.length
      ? eligibleLists.map((c) => ({
          id: `new-list-${c.id}`,
          label: c.title,
          colorDot: c.color,
          onSelect: () => openReminderEditor(null, toLocalDateTime(start), c.id),
        }))
      : [{ id: "none", label: "No lists in this area", disabled: true }];
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { id: "create-event", label: "Create event in", icon: CalendarIcon, children: eventChildren },
        {
          id: "create-reminder",
          label: "Create reminder in",
          icon: ListTodo,
          separatorBefore: true,
          children: reminderChildren,
        },
      ],
    });
  }

  // Right-click an empty reminders area → create a reminder in an area list.
  function openEmptyReminderMenu(e: React.MouseEvent) {
    e.preventDefault();
    const children: MenuNode[] = eligibleLists.length
      ? eligibleLists.map((c) => ({
          id: `new-list-${c.id}`,
          label: c.title,
          colorDot: c.color,
          onSelect: () => openReminderEditor(null, null, c.id),
        }))
      : [{ id: "none", label: "No lists in this area", disabled: true }];
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [{ id: "create-reminder", label: "Create reminder in", icon: ListTodo, children }],
    });
  }

  // Right-click an All-day tasks column → create a date-only reminder on that day.
  function openAllDayReminderMenu(e: React.MouseEvent, day: Date) {
    e.preventDefault();
    const due = format(day, "yyyy-MM-dd");
    const children: MenuNode[] = eligibleLists.length
      ? eligibleLists.map((c) => ({
          id: `allday-list-${c.id}`,
          label: c.title,
          colorDot: c.color,
          onSelect: () => openReminderEditor(null, due, c.id),
        }))
      : [{ id: "none", label: "No lists in this area", disabled: true }];
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          id: "create-allday-reminder",
          label: `New reminder · ${format(day, "EEE, MMM d")}`,
          icon: ListTodo,
          children,
        },
      ],
    });
  }

  function submitEvent(input: EventInput) {
    const mx = input.id ? eventMx.update : eventMx.create;
    mx.mutate(input, {
      onSuccess: () => {
        toast.success(input.id ? "Event updated" : "Event created");
        setEventDialog({ open: false, event: null, initialStart: null, initialEnd: null, initialCalendarId: null });
      },
      onError: fail,
    });
  }

  function deleteEvent(id: string) {
    eventMx.remove.mutate(id, {
      onSuccess: () => {
        toast.success("Event deleted");
        setEventDialog({ open: false, event: null, initialStart: null, initialEnd: null, initialCalendarId: null });
      },
      onError: fail,
    });
  }

  function submitReminder(input: ReminderInput) {
    const mx = input.id ? reminderMx.update : reminderMx.create;
    mx.mutate(input, {
      onSuccess: () => {
        toast.success(input.id ? "Reminder updated" : "Reminder created");
        setReminderDialog({ open: false, reminder: null, initialDue: null, initialListId: null });
      },
      onError: fail,
    });
  }

  function deleteReminder(id: string) {
    reminderMx.remove.mutate(id, {
      onSuccess: () => {
        toast.success("Reminder deleted");
        setReminderDialog({ open: false, reminder: null, initialDue: null, initialListId: null });
      },
      onError: fail,
    });
  }

  const eventBusy =
    eventMx.create.isPending || eventMx.update.isPending || eventMx.remove.isPending;
  const reminderBusy =
    reminderMx.create.isPending ||
    reminderMx.update.isPending ||
    reminderMx.remove.isPending;

  const isPlanner = section === "planner";

  // macOS-style keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      const t = e.target as HTMLElement | null;
      const typing =
        !!t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable);

      // Always available:
      if (e.key === ",") {
        e.preventDefault();
        openSettings();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        // Refresh data (and prevent the webview from reloading).
        e.preventDefault();
        queryClient.invalidateQueries();
        return;
      }

      if (typing) return;

      switch (e.key) {
        case "n":
        case "N":
          e.preventDefault();
          if (e.shiftKey) openReminderEditor(null);
          else openEventEditor(null);
          break;
        case "1":
          e.preventDefault();
          selectSection("today");
          break;
        case "2":
          e.preventDefault();
          selectSection("weekly");
          break;
        case "3":
          e.preventDefault();
          selectSection("planner");
          break;
        case "t":
        case "T":
          e.preventDefault();
          setAnchor(new Date());
          break;
        case "ArrowLeft":
          if (!isPlanner) {
            e.preventDefault();
            setAnchor((a) => navigate(view, a, -1));
          }
          break;
        case "ArrowRight":
          if (!isPlanner) {
            e.preventDefault();
            setAnchor((a) => navigate(view, a, 1));
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, isPlanner]);

  // Calendars/lists offered when creating/editing, filtered by the active area.
  const eligibleCalendars = eligible(
    visibleCalendars,
    areaMembers(areaConfig, activeArea).calendarIds,
  );
  const eligibleLists = eligible(
    visibleLists,
    areaMembers(areaConfig, activeArea).listIds,
  );

  // Reminder groups available to the panel's group filter (scoped to the area).
  const availableGroups = useMemo(() => {
    if (activeArea === "all") return visibleLists;
    const set = new Set(areaMembers(areaConfig, activeArea).listIds);
    return visibleLists.filter((c) => set.has(c.id));
  }, [visibleLists, activeArea, areaConfig]);

  return (
    <div className="flex h-full">
      <AppSidebar
        section={section}
        onSelect={selectSection}
        areas={availableAreas}
        activeArea={activeArea}
        onSelectArea={setActiveArea}
        onOpenAreas={() => openSettings("areas")}
        onOpenSettings={() => openSettings("general")}
        onOpenSync={() => openSettings("sync")}
        sync={{ connected: sync.account.connected, syncing: sync.syncing, error: sync.error }}
        anchor={anchor}
        weekStartsOn={weekStartsOn}
        weekView={section === "weekly"}
        onSelectDay={(day) => setAnchor(day)}
        onReorderAreas={(ids) => updateSettings({ areaOrder: ids })}
        reviewedAt={settings.areaReviewedAt ?? {}}
        reviewIntervalDays={settings.reviewIntervalDays ?? 7}
        onMarkReviewed={markAreaReviewed}
        inboxCount={inboxCount}
        overdueCount={overdueCount}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {update && <UpdateBanner update={update} onDismiss={dismissUpdate} />}
        <PlannerToolbar
          title={SECTION_TITLE[section]}
          label={viewLabel(view, anchor, weekStartsOn)}
          navDisabled={isPlanner}
          showReminders={showReminders}
          onPrev={() => setAnchor((a) => navigate(view, a, -1))}
          onNext={() => setAnchor((a) => navigate(view, a, 1))}
          onToday={() => setAnchor(new Date())}
          onToggleReminders={() => setShowReminders((v) => !v)}
        />

        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            {isPlanner ? (
              <FocusBoard
                reminders={filteredReminders}
                loading={reminders.isLoading}
                weekStartsOn={weekStartsOn}
                layout={settings.plannerLayout}
                onLayoutChange={(l) => updateSettings({ plannerLayout: l })}
                externalSector={
                  remDrag?.target?.kind === "sector" ? remDrag.target.sector : null
                }
                animations={settings.plannerAnimations}
                onEdit={(r) => openReminderEditor(r)}
                onComplete={(r, completed) =>
                  r.id &&
                  reminderMx.toggle.mutate({ id: r.id, completed }, { onError: fail })
                }
                onReschedule={(r, due) =>
                  due === null ? clearReminderDue(r) : updateReminderDue(r, due)
                }
                onQuickAdd={(due) =>
                  openReminderEditor(null, due, eligibleLists[0]?.id ?? null)
                }
                onContextMenu={openReminderMenu}
              />
            ) : (
              <TimeGridView
                days={days}
                events={filteredEvents}
                reminders={filteredReminders}
                onEditEvent={(ev) => openEventEditor(ev)}
                onEditReminder={(r) => openReminderEditor(r)}
                onToggleReminder={(r, completed) =>
                  r.id &&
                  reminderMx.toggle.mutate({ id: r.id, completed }, { onError: fail })
                }
                onEmptyContextMenu={openEmptyEventMenu}
                onUpdateTimes={updateEventTimes}
                onUpdateReminderDue={updateReminderDue}
                onEventContextMenu={openEventMenu}
                onReminderContextMenu={openReminderMenu}
                dropPreview={
                  remDrag?.target?.kind === "grid"
                    ? { day: remDrag.target.day, minute: remDrag.target.minute }
                    : null
                }
                allDayHighlightDay={
                  remDrag?.target?.kind === "allday" ? remDrag.target.day : null
                }
                onReminderDragStart={startReminderDrag}
                onEmptyAllDayContextMenu={openAllDayReminderMenu}
                workHours={{
                  workdayStart: settings.workdayStart,
                  workdayEnd: settings.workdayEnd,
                  weekendStart: settings.weekendStart,
                  weekendEnd: settings.weekendEnd,
                }}
              />
            )}

            <EventInspector
              open={eventDialog.open}
              onClose={() => setEventDialog((s) => ({ ...s, open: false }))}
              event={eventDialog.event}
              initialStart={eventDialog.initialStart}
              initialEnd={eventDialog.initialEnd}
              initialCalendarId={eventDialog.initialCalendarId}
              calendars={eligibleCalendars}
              onSubmit={submitEvent}
              onDelete={deleteEvent}
              weekStartsOn={weekStartsOn}
              contextHours={settings.inspectorContextHours}
              busy={eventBusy}
            />

            <ReminderInspector
              open={reminderDialog.open}
              onClose={() => setReminderDialog((s) => ({ ...s, open: false }))}
              reminder={reminderDialog.reminder}
              initialDue={reminderDialog.initialDue}
              initialListId={reminderDialog.initialListId}
              lists={eligibleLists}
              onSubmit={submitReminder}
              onDelete={deleteReminder}
              onToggleComplete={(r, completed) =>
                r.id &&
                reminderMx.toggle.mutate({ id: r.id, completed }, { onError: fail })
              }
              weekStartsOn={weekStartsOn}
              contextHours={settings.inspectorContextHours}
              busy={reminderBusy}
            />
          </div>

          {showReminders && (
            <ReminderList
              reminders={filteredReminders}
              groups={availableGroups}
              loading={reminders.isLoading}
              listFilter={reminderFilter.list}
              statusFilter={reminderFilter.status}
              onListFilterChange={(list) => setReminderFilter({ list })}
              onStatusFilterChange={(status) => setReminderFilter({ status })}
              onToggle={(id, completed) =>
                reminderMx.toggle.mutate({ id, completed }, { onError: fail })
              }
              onEdit={(r) => openReminderEditor(r)}
              onDelete={deleteReminder}
              onContextMenu={openReminderMenu}
              onEmptyContextMenu={openEmptyReminderMenu}
              onReminderDragStart={startReminderDrag}
            />
          )}
        </div>
      </main>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={updateSettings}
        calendars={calendars.data?.events ?? []}
        lists={calendars.data?.reminderLists ?? []}
        areaCalendars={visibleCalendars}
        areaLists={visibleLists}
        areaConfig={areaConfig}
        onAreaConfigChange={setAreaConfig}
        sync={sync}
        initialPane={settingsPane}
        onReplayTour={replayTour}
        onConnectClick={() => {
          setSettingsOpen(false);
          setConnectOpen(true);
        }}
      />

      <GitHubConnectDialog
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        onSuccess={() => {
          setConnectOpen(false);
          void sync.afterConnect();
          setSettingsOpen(true);
        }}
      />

      <AboutDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        connected={sync.account.connected}
        login={sync.account.login}
      />

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />

      <FeatureTour open={tourOpen} onClose={closeTour} />

      {remDrag && (
        <div
          className="pointer-events-none fixed z-[100] flex max-w-[16rem] items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm shadow-lg"
          style={{ left: remDrag.x + 12, top: remDrag.y + 12 }}
        >
          <span className="truncate">{remDrag.reminder.title}</span>
          {remDrag.target && (
            <span className="shrink-0 font-medium text-primary">
              {remDrag.target.kind === "grid"
                ? `${format(days[remDrag.target.day], "EEE")} ${fmtMinute(remDrag.target.minute)}`
                : remDrag.target.kind === "allday"
                  ? `${format(days[remDrag.target.day], "EEE")} · all day`
                  : sectorLabel(remDrag.target.sector)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
