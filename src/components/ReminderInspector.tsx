import { useEffect, useState } from "react";
import { parseISO } from "date-fns";
import { Circle, CircleCheck, Trash2, X } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import type { CalendarDto, RecurrenceInput, ReminderDto, ReminderInput } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RecurrencePicker } from "@/components/RecurrencePicker";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MiniPlanner } from "@/components/MiniPlanner";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  onClose: () => void;
  reminder: ReminderDto | null;
  /** Pre-fills the due date/time when creating (e.g. drag-to-create at a slot). */
  initialDue?: string | null;
  /** Pre-selects the list when creating (e.g. "Create reminder in →"). */
  initialListId?: string | null;
  /** Active area's default list; leads the picker and is the creation fallback. */
  defaultListId?: string | null;
  lists: CalendarDto[];
  onSubmit: (input: ReminderInput) => void;
  onDelete: (id: string) => void;
  onToggleComplete: (reminder: ReminderDto, completed: boolean) => void;
  weekStartsOn?: 0 | 1;
  contextHours?: number;
  /** Calendars/lists (area-assigned, not hidden) the schedule-context view considers. */
  contextCalendarIds?: string[];
  contextListIds?: string[];
  busy?: boolean;
}

/** Split a stored due ("YYYY-MM-DD" or "YYYY-MM-DDTHH:MM") into [date, time]. */
function splitDue(s?: string | null): [string, string] {
  if (!s) return ["", ""];
  const [d, t] = s.split("T");
  return [d ?? "", t ? t.slice(0, 5) : ""];
}

// EventKit priority buckets: 0 none, 1 high, 5 medium, 9 low.
const PRIORITIES = [
  { value: 0, label: "None" },
  { value: 1, label: "High" },
  { value: 5, label: "Medium" },
  { value: 9, label: "Low" },
];

export function ReminderInspector({
  open,
  onClose,
  reminder,
  initialDue,
  initialListId,
  defaultListId,
  lists,
  onSubmit,
  onDelete,
  onToggleComplete,
  weekStartsOn = 1,
  contextHours = 2,
  contextCalendarIds,
  contextListIds,
  busy,
}: Props) {
  const editable = lists.filter((c) => c.editable);
  // For a NEW reminder, surface the area default first (tagged), then the rest.
  const defaultList = !reminder ? editable.find((c) => c.id === defaultListId) : undefined;
  const orderedLists = defaultList
    ? [defaultList, ...editable.filter((c) => c.id !== defaultList.id)]
    : editable;
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  // type="time" doesn't capture in WKWebView, so use hour/minute selects.
  const [dueHour, setDueHour] = useState("");
  const [dueMinute, setDueMinute] = useState("00");
  const [priority, setPriority] = useState(0);
  const [listId, setListId] = useState("");
  const [notes, setNotes] = useState("");
  const [completed, setCompleted] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceInput | null>(null);
  // A reminder is "all-day" when it has a due date but no time component.
  const [allDay, setAllDay] = useState(false);

  useEffect(() => {
    if (!open) return;
    const [d, t] = splitDue(reminder ? reminder.due : initialDue);
    setDueDate(d);
    const [hh, mm] = t ? t.split(":") : ["", ""];
    setDueHour(hh ?? "");
    setDueMinute(mm || "00");
    setAllDay(!!d && !t);
    if (reminder) {
      setTitle(reminder.title);
      setPriority(reminder.priority);
      setListId(reminder.listId ?? editable[0]?.id ?? "");
      setNotes(reminder.notes ?? "");
      setCompleted(reminder.completed);
      setRecurrence(reminder.recurrence);
    } else {
      setTitle("");
      setPriority(0);
      setListId(initialListId ?? defaultListId ?? editable[0]?.id ?? "");
      setNotes("");
      setCompleted(false);
      setRecurrence(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reminder]);

  function toggleComplete() {
    if (!reminder?.id) return;
    const next = !completed;
    setCompleted(next);
    onToggleComplete(reminder, next);
  }

  function submit() {
    if (!title.trim()) return;
    const time = !allDay && dueHour ? `${dueHour}:${dueMinute || "00"}` : "";
    const due = dueDate ? (time ? `${dueDate}T${time}` : dueDate) : null;
    onSubmit({
      id: reminder?.id ?? null,
      title: title.trim(),
      due,
      priority,
      listId: listId || null,
      notes: notes || null,
      // A reminder can only repeat relative to a due date.
      recurrence: due ? recurrence : null,
    });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} className="w-[clamp(384px,38vw,680px)]">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">
          {reminder ? "Reminder" : "New reminder"}
        </h2>
        <button
          onClick={onClose}
          className="rounded-sm text-muted-foreground transition-opacity hover:opacity-70"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="flex items-center gap-3">
          {reminder && (
            <button
              onClick={toggleComplete}
              className="shrink-0"
              aria-label={completed ? "Mark incomplete" : "Mark complete"}
              title={completed ? "Mark incomplete" : "Mark complete"}
            >
              {completed ? (
                <CircleCheck
                  className="size-6"
                  style={{ color: reminder.color ?? "var(--primary)" }}
                  strokeWidth={2.25}
                />
              ) : (
                <Circle
                  className="size-6"
                  style={{ color: reminder.color ?? "var(--muted-foreground)" }}
                  strokeWidth={2.25}
                />
              )}
            </button>
          )}
          <Input
            id="rm-title"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Reminder title"
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className={cn(
              "flex-1 text-base",
              completed && "text-muted-foreground line-through",
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rm-due">Due</Label>
          <DateTimePicker
            date={dueDate}
            hour={dueHour}
            minute={dueMinute}
            onDateChange={setDueDate}
            onHourChange={setDueHour}
            onMinuteChange={setDueMinute}
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

        {dueDate ? (
          <RecurrencePicker
            value={recurrence}
            onChange={setRecurrence}
            weekStartsOn={weekStartsOn}
          />
        ) : (
          <p className="text-xs text-muted-foreground">Set a due date to repeat this reminder.</p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="rm-priority">Priority</Label>
          <Select
            id="rm-priority"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rm-list">List</Label>
          <Select
            id="rm-list"
            value={listId}
            onChange={(e) => setListId(e.target.value)}
          >
            {orderedLists.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
                {c.id === defaultList?.id ? " — Default" : ""}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rm-notes">Notes</Label>
          <Textarea
            id="rm-notes"
            value={notes}
            rows={4}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>

      {dueDate && dueHour && (
        <div className="shrink-0 border-t border-border px-4 py-3">
          <MiniPlanner
            focusStart={parseISO(`${dueDate}T${dueHour}:${dueMinute || "00"}`)}
            focusEnd={parseISO(`${dueDate}T${dueHour}:${dueMinute || "00"}`)}
            contextHours={contextHours}
            calendarIds={contextCalendarIds}
            listIds={contextListIds}
            kind="reminder"
            selfId={reminder?.id}
            selfTitle={title}
            selfColor={reminder?.color}
          />
        </div>
      )}

      <footer className="flex items-center gap-2 border-t border-border px-4 py-3">
        {reminder?.id && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDelete(reminder.id!)}
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
          {reminder ? "Save" : "Create"}
        </Button>
      </footer>
    </Sheet>
  );
}
