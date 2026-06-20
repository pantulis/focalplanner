import { useEffect, useState } from "react";
import { Circle, CircleCheck, Repeat, Trash2, X } from "lucide-react";
import type { CalendarDto, ReminderDto, ReminderInput } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  lists: CalendarDto[];
  onSubmit: (input: ReminderInput) => void;
  onDelete: (id: string) => void;
  onToggleComplete: (reminder: ReminderDto, completed: boolean) => void;
  busy?: boolean;
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
  lists,
  onSubmit,
  onDelete,
  onToggleComplete,
  busy,
}: Props) {
  const editable = lists.filter((c) => c.editable);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState(0);
  const [listId, setListId] = useState("");
  const [notes, setNotes] = useState("");
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (reminder) {
      setTitle(reminder.title);
      setDue(reminder.due ?? "");
      setPriority(reminder.priority);
      setListId(reminder.listId ?? editable[0]?.id ?? "");
      setNotes(reminder.notes ?? "");
      setCompleted(reminder.completed);
    } else {
      setTitle("");
      setDue(initialDue ?? "");
      setPriority(0);
      setListId(initialListId ?? editable[0]?.id ?? "");
      setNotes("");
      setCompleted(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reminder]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function toggleComplete() {
    if (!reminder?.id) return;
    const next = !completed;
    setCompleted(next);
    onToggleComplete(reminder, next);
  }

  function submit() {
    if (!title.trim()) return;
    onSubmit({
      id: reminder?.id ?? null,
      title: title.trim(),
      due: due || null,
      priority,
      listId: listId || null,
      notes: notes || null,
    });
  }

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-border bg-background">
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

        {reminder?.recurring && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Repeat className="size-4 shrink-0" />
            Repeats
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="rm-due">Due</Label>
          <Input
            id="rm-due"
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </div>

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
            {editable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
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
    </aside>
  );
}
