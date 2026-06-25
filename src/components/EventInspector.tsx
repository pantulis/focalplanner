import { useEffect, useState } from "react";
import { parseISO } from "date-fns";
import { ExternalLink, Mail, Trash2, Video, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Sheet } from "@/components/ui/sheet";
import {
  api,
  type CalendarDto,
  type EventDto,
  type EventInput,
  type ParticipantStatus,
  type RecurrenceInput,
} from "@/lib/api";
import { findMeetingLink } from "@/lib/meeting";
import { cn } from "@/lib/utils";
import { RecurrencePicker } from "@/components/RecurrencePicker";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MiniPlanner } from "@/components/MiniPlanner";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { localInputToISO, toLocalInput } from "@/lib/dates";

/** Display label + status-dot color for a participant's RSVP status. */
function statusMeta(status: ParticipantStatus): { label: string; dot: string } {
  switch (status) {
    case "accepted":
      return { label: "Accepted", dot: "bg-emerald-500" };
    case "declined":
      return { label: "Declined", dot: "bg-destructive" };
    case "tentative":
      return { label: "Maybe", dot: "bg-amber-500" };
    default:
      return { label: "No reply", dot: "bg-muted-foreground/40" };
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  event: EventDto | null;
  /** Pre-fills the start time when creating a new event (e.g. clicking a grid slot). */
  initialStart?: Date | null;
  /** Pre-fills the end time when creating from a dragged range. */
  initialEnd?: Date | null;
  /** Pre-selects the calendar when creating (e.g. "Create event in →"). */
  initialCalendarId?: string | null;
  /** Pre-check the all-day box when creating (e.g. from the all-day row). */
  initialAllDay?: boolean;
  /** Active area's default calendar; leads the picker and is the creation fallback. */
  defaultCalendarId?: string | null;
  calendars: CalendarDto[];
  onSubmit: (input: EventInput) => void;
  onDelete: (id: string) => void;
  weekStartsOn?: 0 | 1;
  contextHours?: number;
  /** Calendars/lists (area-assigned, not hidden) the schedule-context view considers. */
  contextCalendarIds?: string[];
  contextListIds?: string[];
  busy?: boolean;
}

function defaultStart(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toLocalInput(d.toISOString());
}

function plusHour(local: string): string {
  const d = new Date(local);
  d.setHours(d.getHours() + 1);
  return toLocalInput(d.toISOString());
}

/** Split a "YYYY-MM-DDTHH:MM" local string into picker parts. */
function splitLocal(s: string): { date: string; hour: string; minute: string } {
  const [d, t] = s.split("T");
  const [hh, mm] = (t ?? "").split(":");
  return { date: d ?? "", hour: hh ?? "", minute: mm || "00" };
}

export function EventInspector({
  open,
  onClose,
  event,
  initialStart,
  initialEnd,
  initialCalendarId,
  initialAllDay,
  defaultCalendarId,
  calendars,
  onSubmit,
  onDelete,
  weekStartsOn = 1,
  contextHours = 2,
  contextCalendarIds,
  contextListIds,
  busy,
}: Props) {
  const editable = calendars.filter((c) => c.editable);
  // For a NEW event, surface the area default first (tagged), then the rest.
  const defaultCal = !event ? editable.find((c) => c.id === defaultCalendarId) : undefined;
  const orderedCalendars = defaultCal
    ? [defaultCal, ...editable.filter((c) => c.id !== defaultCal.id)]
    : editable;
  const meeting = event ? findMeetingLink(event) : null;
  const [title, setTitle] = useState("");
  // Date + hour/minute selects instead of <input type="datetime-local">, which
  // doesn't capture values in WKWebView.
  const [startDate, setStartDate] = useState("");
  const [startHour, setStartHour] = useState("");
  const [startMinute, setStartMinute] = useState("00");
  const [endDate, setEndDate] = useState("");
  const [endHour, setEndHour] = useState("");
  const [endMinute, setEndMinute] = useState("00");
  const [allDay, setAllDay] = useState(false);
  const [calendarId, setCalendarId] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrenceInput | null>(null);

  useEffect(() => {
    if (!open) return;
    if (event) {
      const s = splitLocal(toLocalInput(event.start));
      const e = splitLocal(toLocalInput(event.end));
      setTitle(event.title);
      setStartDate(s.date); setStartHour(s.hour); setStartMinute(s.minute);
      setEndDate(e.date); setEndHour(e.hour); setEndMinute(e.minute);
      setAllDay(event.allDay);
      setCalendarId(event.calendarId ?? editable[0]?.id ?? "");
      setLocation(event.location ?? "");
      setNotes(event.notes ?? "");
      setRecurrence(event.recurrence);
    } else {
      const sLocal = initialStart ? toLocalInput(initialStart.toISOString()) : defaultStart();
      const eLocal = initialEnd ? toLocalInput(initialEnd.toISOString()) : plusHour(sLocal);
      const s = splitLocal(sLocal);
      const e = splitLocal(eLocal);
      setTitle("");
      setStartDate(s.date); setStartHour(s.hour); setStartMinute(s.minute);
      setEndDate(e.date); setEndHour(e.hour); setEndMinute(e.minute);
      setAllDay(initialAllDay ?? false);
      setCalendarId(initialCalendarId ?? defaultCalendarId ?? editable[0]?.id ?? "");
      setLocation("");
      setNotes("");
      setRecurrence(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event, initialStart]);


  function submit() {
    if (!title.trim()) return;
    // All-day events carry no meaningful time; pin to midnight (EventKit ignores
    // the time component when all_day is set).
    const startVal = startDate
      ? `${startDate}T${allDay ? "00:00" : `${startHour || "00"}:${startMinute || "00"}`}`
      : defaultStart();
    const endVal = endDate
      ? `${endDate}T${allDay ? "00:00" : `${endHour || "00"}:${endMinute || "00"}`}`
      : allDay
        ? `${startDate}T00:00`
        : plusHour(startVal);
    onSubmit({
      id: event?.id ?? null,
      title: title.trim(),
      start: localInputToISO(startVal),
      end: localInputToISO(endVal),
      allDay,
      calendarId: calendarId || null,
      location: location || null,
      notes: notes || null,
      recurrence,
    });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} className="w-[clamp(384px,38vw,680px)]">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{event ? "Event" : "New event"}</h2>
        <button
          onClick={onClose}
          className="rounded-sm text-muted-foreground transition-opacity hover:opacity-70"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {event?.needsResponse && (
          <div className="space-y-2 rounded-md bg-amber-500/15 p-2.5 text-amber-700 dark:text-amber-400">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Mail className="size-4 shrink-0" />
              You're invited · no response yet
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => api.openCalendar(event.start.slice(0, 10))}
            >
              <ExternalLink className="size-4" /> Respond in Calendar
            </Button>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="ev-title">Title</Label>
          <Input
            id="ev-title"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Event title"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Starts</Label>
          <DateTimePicker
            date={startDate}
            hour={startHour}
            minute={startMinute}
            onDateChange={setStartDate}
            onHourChange={setStartHour}
            onMinuteChange={setStartMinute}
            weekStartsOn={weekStartsOn}
            dateOnly={allDay}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Ends</Label>
          <DateTimePicker
            date={endDate}
            hour={endHour}
            minute={endMinute}
            onDateChange={setEndDate}
            onHourChange={setEndHour}
            onMinuteChange={setEndMinute}
            weekStartsOn={weekStartsOn}
            dateOnly={allDay}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
          All-day
        </label>

        <RecurrencePicker
          value={recurrence}
          onChange={setRecurrence}
          weekStartsOn={weekStartsOn}
        />

        <div className="space-y-1.5">
          <Label htmlFor="ev-cal">Calendar</Label>
          <Select
            id="ev-cal"
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
          >
            {orderedCalendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
                {c.id === defaultCal?.id ? " — Default" : ""}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ev-loc">Location</Label>
          <Input
            id="ev-loc"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Optional"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ev-notes">Notes</Label>
          <Textarea
            id="ev-notes"
            value={notes}
            rows={4}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
          />
        </div>

        {event && event.participants.length > 0 && (
          <div className="space-y-1.5">
            <Label>Participants · {event.participants.length}</Label>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {event.participants.map((p, i) => {
                const m = statusMeta(p.status);
                return (
                  <div key={`${p.name ?? "?"}-${i}`} className="flex items-center gap-2 text-sm">
                    <span
                      className={cn("size-2 shrink-0 rounded-full", m.dot)}
                      title={m.label}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {p.name || "(unknown)"}
                      {p.isCurrentUser && <span className="text-muted-foreground"> · You</span>}
                    </span>
                    {p.isOrganizer && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                        Organizer
                      </span>
                    )}
                    <span className="shrink-0 text-[11px] text-muted-foreground">{m.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {!allDay && startDate && startHour && endDate && endHour && (
        <div className="shrink-0 border-t border-border px-4 py-3">
          <MiniPlanner
            focusStart={parseISO(`${startDate}T${startHour}:${startMinute || "00"}`)}
            focusEnd={parseISO(`${endDate}T${endHour}:${endMinute || "00"}`)}
            contextHours={contextHours}
            calendarIds={contextCalendarIds}
            listIds={contextListIds}
            kind="event"
            selfId={event?.id}
            selfTitle={title}
            selfColor={event?.color}
          />
        </div>
      )}

      <footer className="flex items-center gap-2 border-t border-border px-4 py-3">
        {event?.id && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDelete(event.id!)}
            disabled={busy}
          >
            <Trash2 className="size-4" /> Delete
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {meeting && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openUrl(meeting.url).catch(() => {})}
            >
              <Video className="size-4" /> Join {meeting.provider}
            </Button>
          )}
          <Button size="sm" onClick={submit} disabled={busy || !title.trim()}>
            {event ? "Save" : "Create"}
          </Button>
        </div>
      </footer>
    </Sheet>
  );
}
