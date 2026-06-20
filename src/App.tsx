import { useEffect, useMemo, useRef, useState } from "react";
import { addMinutes } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import {
  Calendar as CalendarIcon,
  CalendarX2,
  Clock,
  LayoutDashboard,
  ListTodo,
  Pencil,
  Trash2,
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
  type PlannerView,
} from "@/lib/planner";
import { AREAS, areaMembers, useAreaConfig } from "@/lib/areas";
import {
  TIMES_OF_DAY,
  WHENS,
  rescheduleDate,
  rescheduleHint,
  toLocalDateTime,
} from "@/lib/reschedule";
import { useSettings } from "@/lib/settings";
import { useSyncController } from "@/lib/sync";
import { ContextMenu, type MenuNode } from "@/components/ui/context-menu";
import { PermissionGate } from "@/components/PermissionGate";
import { AppSidebar, type Section } from "@/components/AppSidebar";
import { PlannerToolbar } from "@/components/PlannerToolbar";
import { TimeGridView } from "@/components/TimeGridView";
import { ReminderList } from "@/components/ReminderList";
import { EventInspector } from "@/components/EventInspector";
import { ReminderInspector } from "@/components/ReminderInspector";
import { AreasDialog } from "@/components/AreasDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
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
  today: "Today",
  weekly: "This Week",
  planner: "Planner",
};

function Planner() {
  const calendars = useCalendars(true);
  const [areaConfig, setAreaConfig] = useAreaConfig();
  const { settings, update: updateSettings, loaded: settingsLoaded } = useSettings();
  const queryClient = useQueryClient();

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
  const [showReminders, setShowReminders] = useState(true);
  const [areasOpen, setAreasOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
    return AREAS.filter((a) => {
      const m = areaMembers(areaConfig, a.id);
      return (
        m.calendarIds.some((id) => calIds.has(id)) ||
        m.listIds.some((id) => listIds.has(id))
      );
    });
  }, [areaConfig, visibleCalendars, visibleLists]);

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

  function rescheduleEvent(event: EventDto, whenId: string, hour: number) {
    const dt = rescheduleDate(whenId as never, hour);
    const dur = new Date(event.end).getTime() - new Date(event.start).getTime();
    updateEventTimes(
      event,
      dt.toISOString(),
      new Date(dt.getTime() + dur).toISOString(),
    );
  }

  function rescheduleReminder(reminder: ReminderDto, whenId: string, hour: number) {
    updateReminderDue(reminder, toLocalDateTime(rescheduleDate(whenId as never, hour)));
  }

  function rescheduleNode(onPick: (whenId: string, hour: number) => void): MenuNode {
    return {
      id: "reschedule",
      label: "Reschedule",
      icon: Clock,
      separatorBefore: true,
      children: WHENS.map((w) => ({
        id: w.id,
        label: w.label,
        children: TIMES_OF_DAY.map((t) => ({
          id: `${w.id}-${t.id}`,
          label: t.label,
          hint: rescheduleHint(w.id, t.hour),
          onSelect: () => onPick(w.id, t.hour),
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
        children: cals.length
          ? cals.map((c) => ({
              id: `cal-${c.id}`,
              label: c.title,
              colorDot: c.color,
              disabled: c.id === event.calendarId,
              onSelect: () => moveEventToCalendar(event, c.id),
            }))
          : [{ id: "none", label: "No calendars in area", disabled: true }],
      },
      rescheduleNode((w, h) => rescheduleEvent(event, w, h)),
      {
        id: "delete",
        label: "Delete",
        icon: Trash2,
        danger: true,
        separatorBefore: true,
        onSelect: () => event.id && deleteEvent(event.id),
      },
    ];
  }

  function buildReminderMenu(reminder: ReminderDto): MenuNode[] {
    const lists = eligible(
      visibleLists,
      areaMembers(areaConfig, activeArea).listIds,
    );
    const items: MenuNode[] = [
      {
        id: "edit",
        label: "Edit…",
        icon: Pencil,
        onSelect: () => openReminderEditor(reminder),
      },
      {
        id: "move",
        label: "Move to List",
        icon: ListTodo,
        separatorBefore: true,
        children: lists.length
          ? lists.map((c) => ({
              id: `list-${c.id}`,
              label: c.title,
              colorDot: c.color,
              disabled: c.id === reminder.listId,
              onSelect: () => moveReminderToList(reminder, c.id),
            }))
          : [{ id: "none", label: "No lists in area", disabled: true }],
      },
      rescheduleNode((w, h) => rescheduleReminder(reminder, w, h)),
    ];
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
      onSelect: () => reminder.id && deleteReminder(reminder.id),
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
    const children: MenuNode[] = eligibleCalendars.length
      ? eligibleCalendars.map((c) => ({
          id: `new-cal-${c.id}`,
          label: c.title,
          colorDot: c.color,
          onSelect: () => openEventEditor(null, start, addMinutes(start, 60), c.id),
        }))
      : [{ id: "none", label: "No calendars in this area", disabled: true }];
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [{ id: "create-event", label: "Create event in", icon: CalendarIcon, children }],
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
  const inspectorOpen = eventDialog.open || reminderDialog.open;

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
        setSettingsOpen(true);
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
        onOpenAreas={() => setAreasOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        sync={{ connected: sync.account.connected, syncing: sync.syncing, error: sync.error }}
      />

      <main className="flex min-w-0 flex-1 flex-col">
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
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <LayoutDashboard className="mx-auto mb-2 size-8 opacity-40" />
                  <p className="text-sm">Planner view — coming soon</p>
                </div>
              </div>
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
                workHours={{
                  workdayStart: settings.workdayStart,
                  workdayEnd: settings.workdayEnd,
                  weekendStart: settings.weekendStart,
                  weekendEnd: settings.weekendEnd,
                }}
              />
            )}
          </div>

          {!isPlanner && showReminders && !inspectorOpen && (
            <ReminderList
              reminders={filteredReminders}
              groups={availableGroups}
              loading={reminders.isLoading}
              onToggle={(id, completed) =>
                reminderMx.toggle.mutate({ id, completed }, { onError: fail })
              }
              onEdit={(r) => openReminderEditor(r)}
              onDelete={deleteReminder}
              onContextMenu={openReminderMenu}
              onEmptyContextMenu={openEmptyReminderMenu}
            />
          )}

          <EventInspector
            open={eventDialog.open}
            onClose={() =>
              setEventDialog({ open: false, event: null, initialStart: null, initialEnd: null, initialCalendarId: null })
            }
            event={eventDialog.event}
            initialStart={eventDialog.initialStart}
            initialEnd={eventDialog.initialEnd}
            initialCalendarId={eventDialog.initialCalendarId}
            calendars={eligibleCalendars}
            onSubmit={submitEvent}
            onDelete={deleteEvent}
            busy={eventBusy}
          />

          <ReminderInspector
            open={reminderDialog.open}
            onClose={() => setReminderDialog({ open: false, reminder: null, initialDue: null, initialListId: null })}
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
            busy={reminderBusy}
          />
        </div>
      </main>

      <AreasDialog
        open={areasOpen}
        onClose={() => setAreasOpen(false)}
        calendars={visibleCalendars}
        lists={visibleLists}
        config={areaConfig}
        onChange={setAreaConfig}
      />

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={updateSettings}
        calendars={calendars.data?.events ?? []}
        lists={calendars.data?.reminderLists ?? []}
        sync={sync}
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
    </div>
  );
}
