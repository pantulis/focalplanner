import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import type { CalendarDto, EventDto, EventInput } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  busy,
}: Props) {
  const editable = calendars.filter((c) => c.editable);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(defaultStart());
  const [end, setEnd] = useState(plusHour(defaultStart()));
  const [allDay, setAllDay] = useState(false);
  const [calendarId, setCalendarId] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (event) {
      setTitle(event.title);
      setStart(toLocalInput(event.start));
      setEnd(toLocalInput(event.end));
      setAllDay(event.allDay);
      setCalendarId(event.calendarId ?? editable[0]?.id ?? "");
      setLocation(event.location ?? "");
      setNotes(event.notes ?? "");
    } else {
      const s = initialStart ? toLocalInput(initialStart.toISOString()) : defaultStart();
      setTitle("");
      setStart(s);
      setEnd(initialEnd ? toLocalInput(initialEnd.toISOString()) : plusHour(s));
      setAllDay(false);
      setCalendarId(initialCalendarId ?? editable[0]?.id ?? "");
      setLocation("");
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event, initialStart]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function submit() {
    if (!title.trim()) return;
    onSubmit({
      id: event?.id ?? null,
      title: title.trim(),
      start: localInputToISO(start),
      end: localInputToISO(end),
      allDay,
      calendarId: calendarId || null,
      location: location || null,
      notes: notes || null,
    });
  }

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-border bg-background">
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
          <Label htmlFor="ev-start">Starts</Label>
          <Input
            id="ev-start"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ev-end">Ends</Label>
          <Input
            id="ev-end"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
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
    </aside>
  );
}
