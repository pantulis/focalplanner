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
  Copy,
  Eye,
  EyeOff,
  Layers,
  Lightbulb,
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
  useWeather,
  useEventMutations,
  useReminderMutations,
} from "@/lib/queries";
import {
  navigate,
  viewDays,
  viewLabel,
  viewRange,
  clamp,
  clampZoom,
  DAY_MINUTES,
  HOUR_HEIGHT,
  ZOOM_STEP,
  type PlannerView,
} from "@/lib/planner";
import { AREAS, areaMembers, selectedMemberSet, useAreaConfig } from "@/lib/areas";
import { useHiddenEvents } from "@/lib/hiddenEvents";
import { pickStartupTip } from "@/lib/tips";
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
import { Banner } from "@/components/ui/Banner";
import { useUpdateCheck } from "@/lib/useUpdateCheck";
import { PlannerToolbar } from "@/components/PlannerToolbar";
import { TimeGridView } from "@/components/TimeGridView";
import { FocusBoard } from "@/components/FocusBoard";
import { dueForSector, sectorLabel, type Sector } from "@/lib/sectors";
import { cloneGroups, cloneKey } from "@/lib/clones";
import { ReminderList, type StatusFilter } from "@/components/ReminderList";
import { EventInspector } from "@/components/EventInspector";
import { ReminderInspector } from "@/components/ReminderInspector";
import { SettingsDialog, type Pane as SettingsPane } from "@/components/SettingsDialog";
import { ConfirmDialog, type ConfirmOptions } from "@/components/ConfirmDialog";
import { CloneDialog, type CloneDialogState } from "@/components/CloneDialog";
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
  // Locally-hidden calendar events (view-only, persisted in localStorage).
  const { hiddenIds, isHidden, hide, unhide, showHidden, toggleShowHidden } =
    useHiddenEvents();
  // Mirror the toggle into the native View-menu checkmark (on mount + on change).
  useEffect(() => {
    api.setHiddenEventsChecked(showHidden);
  }, [showHidden]);

  useMenubarTray({
    enabled: settingsLoaded && settings.menubarEnabled,
    ignoredCalendarIds: settings.ignoredCalendarIds,
    ignoredListIds: settings.ignoredListIds,
    // Hidden events stay out of the menu bar too (unless "show hidden" is on).
    hiddenEventIds: showHidden ? [] : [...hiddenIds],
    showNext: settings.menubarShowNext,
    nextWindowHours: settings.menubarNextWindowHours,
    showTimers: settings.menubarShowTimers,
    rotateSeconds: settings.menubarRotateSeconds,
    includeReminders: settings.menubarIncludeReminders,
  });

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
  // Active Areas of Focus. Usually a single area; shift/⌘-click combines several
  // (session-only, resets on relaunch). "all" is the All-Areas pseudo-area and is
  // never combined with specific ids.
  const [activeAreas, setActiveAreas] = useState<string[]>(["all"]);
  // Collapsed id for the single-value per-area settings (work week, default
  // calendar/list, reminder filter): a real area only when EXACTLY one specific
  // area is active; otherwise "all", so a multi-selection behaves neutrally.
  const activeArea =
    activeAreas.length === 1 && activeAreas[0] !== "all" ? activeAreas[0] : "all";
  // Toggle an area in/out of the selection. Plain click (or "all") replaces the
  // whole selection; additive (shift/⌘) click toggles a specific area and drops "all".
  const selectArea = (id: string, additive?: boolean) =>
    setActiveAreas((prev) => {
      if (id === "all" || !additive) return [id];
      const rest = prev.filter((a) => a !== "all");
      const next = rest.includes(id) ? rest.filter((a) => a !== id) : [...rest, id];
      return next.length ? next : ["all"];
    });
  // Ephemeral vertical zoom of the time grid (1 = 100%); resets on relaunch.
  const [gridZoom, setGridZoom] = useState(1);
  // Rotating startup tip shown in the footer (once settings have loaded).
  const [tip, setTip] = useState<string | null>(null);
  const tipPicked = useRef(false);
  useEffect(() => {
    if (tipPicked.current || !settingsLoaded) return;
    tipPicked.current = true;
    if (settings.showTipsOnStartup) setTip(pickStartupTip());
  }, [settingsLoaded, settings.showTipsOnStartup]);
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
  // Mirror the Reminders-sidebar visibility into the native Reminders-menu checkmark.
  useEffect(() => {
    api.setRemindersChecked(showReminders);
  }, [showReminders]);
  // User-resized heights of the time grid's all-day sections. Session-only (not a
  // saved preference) but kept across areas and the daily/weekly views; null = auto.
  const [allDayEventsHeight, setAllDayEventsHeight] = useState<number | null>(null);
  const [allDayTasksHeight, setAllDayTasksHeight] = useState<number | null>(null);
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

  // Native "Settings…" menu item opens the in-app Settings dialog.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("menu-settings", () => {
      setSettingsPane("general");
      setSettingsOpen(true);
    }).then((un) => {
      unlisten = un;
    });
    return () => unlisten?.();
  }, []);

  // The tray dropdown's "Show NEXT event" toggle flips and persists the setting
  // here (a ref keeps the latest value for the once-registered listener).
  const showNextRef = useRef(settings.menubarShowNext);
  showNextRef.current = settings.menubarShowNext;
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("tray-toggle-shownext", () => {
      updateSettings({ menubarShowNext: !showNextRef.current });
    }).then((un) => {
      unlisten = un;
    });
    return () => unlisten?.();
  }, []);

  const view: PlannerView = section === "weekly" ? "week" : "day";
  const weekStartsOn = settings.weekStartsOn;
  const range = useMemo(
    () => viewRange(view, anchor, weekStartsOn),
    [view, anchor, weekStartsOn],
  );
  // Per-area weekly preference: show the 5-day work week (Mon–Fri).
  const workWeek = view === "week" && !!settings.areaWorkWeek?.[activeArea];
  const days = useMemo(
    () => viewDays(view, anchor, weekStartsOn, workWeek),
    [view, anchor, weekStartsOn, workWeek],
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

  // Calendars / lists assigned to any Area of Focus, excluding hidden ones.
  // Used to scope the inspector's "Schedule context" (conflict) view.
  const contextCalendarIds = useMemo(() => {
    const ignored = new Set(settings.ignoredCalendarIds);
    const ids = new Set<string>();
    for (const m of Object.values(areaConfig)) {
      for (const id of m.calendarIds) if (!ignored.has(id)) ids.add(id);
    }
    return [...ids];
  }, [areaConfig, settings.ignoredCalendarIds]);
  const contextListIds = useMemo(() => {
    const ignored = new Set(settings.ignoredListIds);
    const ids = new Set<string>();
    for (const m of Object.values(areaConfig)) {
      for (const id of m.listIds) if (!ignored.has(id)) ids.add(id);
    }
    return [...ids];
  }, [areaConfig, settings.ignoredListIds]);

  const events = useEvents(range.start, range.end, undefined, true);
  const reminders = useReminders(undefined, settings.showCompletedReminders, true);
  const weather = useWeather(
    settings.weatherLat,
    settings.weatherLon,
    settings.weatherUnit,
    settings.weatherEnabled,
  );

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
    // Moving a clone moves all its copies in the other calendars together.
    const members = (eventClones.get(cloneKey(event)) ?? [event]).filter((m) => m.id);
    setPendingTimes((p) => {
      const next = { ...p };
      for (const m of members) next[m.id!] = { start, end };
      return next;
    });
    for (const m of members) {
      eventMx.update.mutate(
        {
          id: m.id!,
          title: m.title,
          start,
          end,
          allDay: m.allDay,
          calendarId: m.calendarId,
          notes: m.notes,
          location: m.location,
        },
        {
          onError: (e) => {
            fail(e);
            setPendingTimes((p) => {
              const next = { ...p };
              delete next[m.id!];
              return next;
            });
          },
        },
      );
    }
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
          Math.round((((y - top) / (HOUR_HEIGHT * gridZoom)) * 60) / REM_SNAP) * REM_SNAP,
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
    const areaSet = selectedMemberSet(areaConfig, activeAreas, "calendar");
    return effectiveEvents.filter((e) => {
      if (e.calendarId != null && ignored.has(e.calendarId)) return false;
      if (areaSet && !(e.calendarId != null && areaSet.has(e.calendarId))) return false;
      // Locally-hidden events: dropped unless the user is revealing hidden events.
      if (e.id != null && hiddenIds.has(e.id) && !showHidden) return false;
      return true;
    });
  }, [
    effectiveEvents,
    activeAreas,
    areaConfig,
    settings.ignoredCalendarIds,
    hiddenIds,
    showHidden,
  ]);

  // The same event copied across calendars (matched by name+time). Computed over
  // every unhidden copy regardless of Area of Focus (only hidden calendars are
  // ignored), so the zebra rendering, synced move/drag, and the confirmation
  // dialogs all account for copies living in other-area calendars.
  const eventClones = useMemo(() => {
    const ignored = new Set(settings.ignoredCalendarIds);
    const unhidden = (effectiveEvents ?? []).filter(
      (e) => !(e.calendarId != null && ignored.has(e.calendarId)),
    );
    return cloneGroups(unhidden);
  }, [effectiveEvents, settings.ignoredCalendarIds]);

  const filteredReminders = useMemo(() => {
    if (!effectiveReminders) return effectiveReminders;
    const ignored = new Set(settings.ignoredListIds);
    const areaSet = selectedMemberSet(areaConfig, activeAreas, "list");
    return effectiveReminders.filter((r) => {
      if (r.listId != null && ignored.has(r.listId)) return false;
      if (areaSet) return r.listId != null && areaSet.has(r.listId);
      return true;
    });
  }, [effectiveReminders, activeAreas, areaConfig, settings.ignoredListIds]);

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

  // Drop any selected area that no longer has visible members; fall back to "all".
  useEffect(() => {
    setActiveAreas((prev) => {
      if (prev.includes("all")) return prev;
      const pruned = prev.filter((id) => availableAreas.some((a) => a.id === id));
      if (pruned.length === prev.length) return prev;
      return pruned.length ? pruned : ["all"];
    });
  }, [availableAreas]);

  // On startup, land on the first configured area rather than "All Areas".
  const didInitArea = useRef(false);
  useEffect(() => {
    if (!didInitArea.current && availableAreas.length > 0) {
      didInitArea.current = true;
      setActiveAreas([availableAreas[0].id]);
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

  // Native menu (View / Reminders) actions, dispatched from `menu-action` events.
  // A ref keeps the latest area state for the once-registered listener.
  const menuStateRef = useRef({ activeArea, availableAreas });
  menuStateRef.current = { activeArea, availableAreas };
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<string>("menu-action", (e) => {
      const id = e.payload;
      if (id === "view-daily") selectSection("today");
      else if (id === "view-weekly") selectSection("weekly");
      else if (id === "view-planner") selectSection("planner");
      else if (id === "toggle-hidden-events") toggleShowHidden();
      else if (id === "toggle-reminders") setShowReminders((v) => !v);
      else if (id === "area-next" || id === "area-prev") {
        const { activeArea: aa, availableAreas: areas } = menuStateRef.current;
        const cycle = ["all", ...areas.map((a) => a.id)];
        const i = Math.max(0, cycle.indexOf(aa));
        const dir = id === "area-next" ? 1 : -1;
        // Keyboard cycling collapses any multi-selection to a single area.
        setActiveAreas([cycle[(i + dir + cycle.length) % cycle.length]]);
      } else if (id.startsWith("filter-")) {
        const status = id.slice("filter-".length) as StatusFilter;
        const aa = menuStateRef.current.activeArea;
        setAreaFilters((prev) => ({
          ...prev,
          [aa]: { ...(prev[aa] ?? { list: "all", status: "today" }), status },
        }));
        setShowReminders(true);
      }
    }).then((un) => {
      unlisten = un;
    });
    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Context menu actions ──────────────────────────────────────────────
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuNode[] } | null>(
    null,
  );
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const [cloneDialog, setCloneDialog] = useState<CloneDialogState | null>(null);

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

  // Copy = create a duplicate in another calendar (the pair then renders as a clone).
  function copyEventToCalendar(event: EventDto, calendarId: string) {
    eventMx.create.mutate(
      {
        title: event.title,
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        calendarId,
        notes: event.notes,
        location: event.location,
      },
      { onSuccess: () => toast.success("Event copied"), onError: fail },
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
      ...(event.needsResponse
        ? [
            {
              id: "rsvp",
              label: "Respond in Calendar",
              icon: CalendarIcon,
              separatorBefore: true,
              onSelect: () => api.openCalendar(event.start.slice(0, 10)),
            },
          ]
        : []),
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
      {
        id: "copy",
        label: "Clone to Calendar",
        icon: Copy,
        children: moveTargetNodes(
          cals,
          { id: event.calendarId, title: event.calendarTitle, color: event.color },
          "copy",
          "No calendars in area",
          (id) => copyEventToCalendar(event, id),
        ),
      },
      rescheduleNode((dt) => rescheduleEvent(event, dt), anchor),
      ...(event.id
        ? [
            {
              id: "hide",
              label: isHidden(event.id) ? "Unhide event" : "Hide event",
              icon: isHidden(event.id) ? Eye : EyeOff,
              separatorBefore: true,
              onSelect: () =>
                isHidden(event.id) ? unhide(event.id!) : hide(event.id!),
            },
          ]
        : []),
      {
        id: "delete",
        label: "Delete",
        icon: Trash2,
        danger: true,
        separatorBefore: true,
        onSelect: () => confirmDeleteEvent(event),
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
  // Reminder-list submenu nodes. When a list is selected in the sidebar filter,
  // it leads (with a "Filtered" pill) and a separator divides it from the rest.
  // Put `leadId` first (tagged with `pill`) and divide it from the rest with a
  // separator; falls back to plain order when there's no lead.
  function leadFirstNodes(
    items: CalendarDto[],
    leadId: string | undefined,
    pill: string,
    node: (c: CalendarDto, extra?: Partial<MenuNode>) => MenuNode,
  ): MenuNode[] {
    const lead = leadId ? items.find((c) => c.id === leadId) : undefined;
    if (!lead) return items.map((c) => node(c));
    const rest = items.filter((c) => c.id !== lead.id);
    return [
      node(lead, { pill }),
      ...rest.map((c, i) => node(c, i === 0 ? { separatorBefore: true } : undefined)),
    ];
  }

  function reminderListNodes(onPick: (listId: string) => void): MenuNode[] {
    if (!eligibleLists.length) {
      return [{ id: "none", label: "No lists in this area", disabled: true }];
    }
    const node = (c: CalendarDto, extra?: Partial<MenuNode>): MenuNode => ({
      id: `list-${c.id}`,
      label: c.title,
      colorDot: c.color,
      onSelect: () => onPick(c.id),
      ...extra,
    });
    // A sidebar list filter leads (with "Filtered"); otherwise the area default does.
    const filteredId =
      reminderFilter.list !== "all" ? reminderFilter.list : undefined;
    return leadFirstNodes(
      eligibleLists,
      filteredId ?? areaDefaultListId,
      filteredId ? "Filtered" : "DEFAULT",
      node,
    );
  }

  // Menu asking "event or reminder" for a time range, then opening the editor
  // pre-filled with [start, end] (events) or `start` as the due (reminders).
  function showCreateMenu(start: Date, end: Date, x: number, y: number) {
    const calNode = (c: CalendarDto, extra?: Partial<MenuNode>): MenuNode => ({
      id: `new-cal-${c.id}`,
      label: c.title,
      colorDot: c.color,
      onSelect: () => openEventEditor(null, start, end, c.id),
      ...extra,
    });
    const eventChildren: MenuNode[] = eligibleCalendars.length
      ? leadFirstNodes(eligibleCalendars, areaDefaultCalendarId, "DEFAULT", calNode)
      : [{ id: "none", label: "No calendars in this area", disabled: true }];
    const reminderChildren = reminderListNodes((id) =>
      openReminderEditor(null, toLocalDateTime(start), id),
    );
    setMenu({
      x,
      y,
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

  function openEmptyEventMenu(e: React.MouseEvent, start: Date) {
    e.preventDefault();
    showCreateMenu(start, addMinutes(start, 60), e.clientX, e.clientY);
  }

  // Right-click an empty reminders area → create a reminder in an area list.
  function openEmptyReminderMenu(e: React.MouseEvent) {
    e.preventDefault();
    const children = reminderListNodes((id) => openReminderEditor(null, null, id));
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
    const children = reminderListNodes((id) => openReminderEditor(null, due, id));
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
    // Editing a clone only changes the clicked copy; warn afterwards.
    const original = input.id ? eventDialog.event : null;
    const group = original ? eventClones.get(cloneKey(original)) : undefined;
    mx.mutate(input, {
      onSuccess: () => {
        toast.success(input.id ? "Event updated" : "Event created");
        setEventDialog({ open: false, event: null, initialStart: null, initialEnd: null, initialCalendarId: null });
        if (original && group && group.length >= 2) {
          setCloneDialog({ mode: "edit-notice", event: original, group });
        }
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

  function deleteEventsByIds(ids: string[]) {
    for (const id of ids) eventMx.remove.mutate(id, { onError: fail });
    toast.success("Events deleted");
    setEventDialog({ open: false, event: null, initialStart: null, initialEnd: null, initialCalendarId: null });
  }

  // Delete an event — for a clone, ask whether to remove one copy or all of them.
  function confirmDeleteEvent(event: EventDto) {
    if (!event.id) return;
    const group = eventClones.get(cloneKey(event));
    if (group && group.length >= 2) {
      setCloneDialog({ mode: "delete", event, group });
      return;
    }
    setConfirm({
      title: "Delete event?",
      description: `“${event.title}” will be removed from your calendar.`,
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: () => deleteEvent(event.id!),
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
      // Native menu accelerators (Cmd/Ctrl based) handle the modified shortcuts;
      // the plain-key shortcuts below should not also fire for them.
      if (e.metaKey || e.ctrlKey) return;

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

  // Per-area defaults that lead the create menus/inspector. Skipped in "All Areas",
  // and (for lists) when a reminder list is filtered; a stale/hidden id is ignored.
  const areaDefaultCalendarId =
    activeArea !== "all"
      ? eligibleCalendars.find(
          (c) => c.id === settings.areaDefaultCalendarId?.[activeArea],
        )?.id
      : undefined;
  const areaDefaultListId =
    activeArea !== "all" && reminderFilter.list === "all"
      ? eligibleLists.find(
          (c) => c.id === settings.areaDefaultListId?.[activeArea],
        )?.id
      : undefined;

  // Reminder groups available to the panel's group filter (scoped to the selection).
  const availableGroups = useMemo(() => {
    const set = selectedMemberSet(areaConfig, activeAreas, "list");
    if (!set) return visibleLists;
    return visibleLists.filter((c) => set.has(c.id));
  }, [visibleLists, activeAreas, areaConfig]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
      <AppSidebar
        section={section}
        onSelect={selectSection}
        areas={availableAreas}
        selectedAreas={activeAreas}
        onSelectArea={selectArea}
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
        <PlannerToolbar
          title={SECTION_TITLE[section]}
          label={viewLabel(view, anchor, weekStartsOn)}
          navDisabled={isPlanner}
          showReminders={showReminders}
          weekView={section === "weekly"}
          workWeek={workWeek}
          onToggleWorkWeek={() =>
            updateSettings({
              areaWorkWeek: {
                ...(settings.areaWorkWeek ?? {}),
                [activeArea]: !settings.areaWorkWeek?.[activeArea],
              },
            })
          }
          zoom={gridZoom}
          onZoomIn={() => setGridZoom((z) => clampZoom(z + ZOOM_STEP))}
          onZoomOut={() => setGridZoom((z) => clampZoom(z - ZOOM_STEP))}
          onResetZoom={() => setGridZoom(1)}
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
                hiddenEventIds={showHidden ? hiddenIds : undefined}
                zoom={gridZoom}
                onZoomChange={setGridZoom}
                onEditEvent={(ev) => openEventEditor(ev)}
                onEditReminder={(r) => openReminderEditor(r)}
                onToggleReminder={(r, completed) =>
                  r.id &&
                  reminderMx.toggle.mutate({ id: r.id, completed }, { onError: fail })
                }
                onEmptyContextMenu={openEmptyEventMenu}
                cloneGroups={eventClones}
                areaConfig={areaConfig}
                activeArea={activeArea}
                weatherByDay={settings.weatherEnabled ? weather.data : undefined}
                onCreateRange={(start, end, x, y) => showCreateMenu(start, end, x, y)}
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
                allDayEventsHeight={allDayEventsHeight}
                onAllDayEventsHeight={setAllDayEventsHeight}
                allDayTasksHeight={allDayTasksHeight}
                onAllDayTasksHeight={setAllDayTasksHeight}
              />
            )}

            <EventInspector
              open={eventDialog.open}
              onClose={() => setEventDialog((s) => ({ ...s, open: false }))}
              event={eventDialog.event}
              initialStart={eventDialog.initialStart}
              initialEnd={eventDialog.initialEnd}
              initialCalendarId={eventDialog.initialCalendarId}
              defaultCalendarId={areaDefaultCalendarId}
              calendars={eligibleCalendars}
              onSubmit={submitEvent}
              onDelete={() => eventDialog.event && confirmDeleteEvent(eventDialog.event)}
              weekStartsOn={weekStartsOn}
              contextHours={settings.inspectorContextHours}
              contextCalendarIds={contextCalendarIds}
              contextListIds={contextListIds}
              busy={eventBusy}
            />

            <ReminderInspector
              open={reminderDialog.open}
              onClose={() => setReminderDialog((s) => ({ ...s, open: false }))}
              reminder={reminderDialog.reminder}
              initialDue={reminderDialog.initialDue}
              initialListId={reminderDialog.initialListId}
              defaultListId={areaDefaultListId}
              lists={eligibleLists}
              onSubmit={submitReminder}
              onDelete={deleteReminder}
              onToggleComplete={(r, completed) =>
                r.id &&
                reminderMx.toggle.mutate({ id: r.id, completed }, { onError: fail })
              }
              weekStartsOn={weekStartsOn}
              contextHours={settings.inspectorContextHours}
              contextCalendarIds={contextCalendarIds}
              contextListIds={contextListIds}
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
              areaLabel={
                activeArea === "all"
                  ? null
                  : availableAreas.find((a) => a.id === activeArea)?.label ?? null
              }
            />
          )}
        </div>
      </main>
      </div>

      {/* Footer notices pinned to the bottom of the window. */}
      {tip && (
        <Banner
          variant="note"
          icon={Lightbulb}
          onDismiss={() => setTip(null)}
          action={
            <button
              onClick={() => {
                updateSettings({ showTipsOnStartup: false });
                setTip(null);
              }}
              className="shrink-0 rounded-md border border-yellow-600/40 bg-yellow-50/60 px-2.5 py-1 text-xs font-medium text-yellow-900 shadow-sm transition-colors hover:bg-yellow-200/70 dark:border-yellow-300/30 dark:bg-yellow-400/10 dark:text-yellow-100 dark:hover:bg-yellow-400/20"
            >
              Don't show on startup
            </button>
          }
        >
          <span className="font-medium">Tip:</span> {tip}
        </Banner>
      )}
      {activeAreas.length > 1 && (
        <Banner variant="info" icon={Layers}>
          Showing {activeAreas.length} areas combined —{" "}
          <span className="font-medium">
            {activeAreas
              .map((id) => AREAS.find((a) => a.id === id)?.label ?? id)
              .join(", ")}
          </span>
        </Banner>
      )}
      {update && <UpdateBanner update={update} onDismiss={dismissUpdate} />}

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

      <CloneDialog
        state={cloneDialog}
        onClose={() => setCloneDialog(null)}
        onDeleteOne={(event) => {
          if (event.id) deleteEvent(event.id);
          setCloneDialog(null);
        }}
        onDeleteAll={(group) => {
          deleteEventsByIds(group.map((e) => e.id).filter((id): id is string => !!id));
          setCloneDialog(null);
        }}
      />

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
