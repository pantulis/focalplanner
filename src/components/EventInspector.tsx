import { useEffect, useState } from "react";
import { parseISO } from "date-fns";
import { Trash2, X } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import type { CalendarDto, EventDto, EventInput } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MiniPlanner } from "@/components/MiniPlanner";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { localInputToISO, toLocalInput } from "@/lib/dates";

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
  calendars: CalendarDto[];
  onSubmit: (input: EventInput) => void;
  onDelete: (id: string) => void;
  weekStartsOn?: 0 | 1;
  contextHours?: number;
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
  calendars,
  onSubmit,
  onDelete,
  weekStartsOn = 1,
  contextHours = 2,
  busy,
}: Props) {
  const editable = calendars.filter((c) => c.editable);
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
    } else {
      const sLocal = initialStart ? toLocalInput(initialStart.toISOString()) : defaultStart();
      const eLocal = initialEnd ? toLocalInput(initialEnd.toISOString()) : plusHour(sLocal);
      const s = splitLocal(sLocal);
      const e = splitLocal(eLocal);
      setTitle("");
      setStartDate(s.date); setStartHour(s.hour); setStartMinute(s.minute);
      setEndDate(e.date); setEndHour(e.hour); setEndMinute(e.minute);
      setAllDay(false);
      setCalendarId(initialCalendarId ?? editable[0]?.id ?? "");
      setLocation("");
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event, initialStart]);


  function submit() {
    if (!title.trim()) return;
    const startVal = startDate
      ? `${startDate}T${startHour || "00"}:${startMinute || "00"}`
      : defaultStart();
    const endVal = endDate
      ? `${endDate}T${endHour || "00"}:${endMinute || "00"}`
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
    });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} className="w-[360px]">
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

        <div className="space-y-1.5">
          <Label htmlFor="ev-cal">Calendar</Label>
          <Select
            id="ev-cal"
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
          >
            {editable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
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
      </div>

      {!allDay && startDate && startHour && endDate && endHour && (
        <div className="shrink-0 border-t border-border px-4 py-3">
          <MiniPlanner
            focusStart={parseISO(`${startDate}T${startHour}:${startMinute || "00"}`)}
            focusEnd={parseISO(`${endDate}T${endHour}:${endMinute || "00"}`)}
            contextHours={contextHours}
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
        <Button
          className="ml-auto"
          size="sm"
          onClick={submit}
          disabled={busy || !title.trim()}
        >
          {event ? "Save" : "Create"}
        </Button>
      </footer>
    </Sheet>
  );
}
