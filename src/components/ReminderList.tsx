import { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { addDays, parseISO, startOfDay } from "date-fns";
import { Loader2, Repeat, Trash2 } from "lucide-react";
import type { CalendarDto, ReminderDto } from "@/lib/api";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatReminderDue } from "@/lib/dates";
import { POOF_ANIMATE, POOF_EXIT, POOF_INITIAL, POOF_TRANSITION } from "@/lib/anim";

export type StatusFilter = "all" | "scheduled" | "unscheduled" | "today" | "week";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "unscheduled", label: "Unscheduled" },
  { value: "today", label: "Today & Overdue" },
  { value: "week", label: "Next 7 days" },
];

interface Props {
  reminders: ReminderDto[] | undefined;
  groups: CalendarDto[];
  loading: boolean;
  /** Controlled filters — persisted per area of focus by the parent. */
  listFilter: string;
  statusFilter: StatusFilter;
  onListFilterChange: (value: string) => void;
  onStatusFilterChange: (value: StatusFilter) => void;
  onToggle: (id: string, completed: boolean) => void;
  onEdit: (reminder: ReminderDto) => void;
  onDelete: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, reminder: ReminderDto) => void;
  onEmptyContextMenu: (e: React.MouseEvent) => void;
}

function dueStartOfDay(due: string): number | null {
  const d = parseISO(due);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d).getTime();
}

function matchesStatus(r: ReminderDto, status: StatusFilter): boolean {
  if (status === "all") return true;
  if (status === "scheduled") return r.due != null;
  if (status === "unscheduled") return r.due == null;
  if (!r.due) return false;
  const sd = dueStartOfDay(r.due);
  if (sd == null) return false;
  const today = startOfDay(new Date()).getTime();
  if (status === "today") return sd <= today;
  if (status === "week") return sd >= today && sd <= startOfDay(addDays(new Date(), 7)).getTime();
  return true;
}

export function ReminderList({
  reminders,
  groups,
  loading,
  listFilter,
  statusFilter,
  onListFilterChange,
  onStatusFilterChange,
  onToggle,
  onEdit,
  onDelete,
  onContextMenu,
  onEmptyContextMenu,
}: Props) {
  const groupFilter = listFilter;

  // Reset the list filter if the active area no longer contains it.
  useEffect(() => {
    if (groupFilter !== "all" && !groups.some((g) => g.id === groupFilter)) {
      onListFilterChange("all");
    }
  }, [groups, groupFilter, onListFilterChange]);

  const visible = useMemo(() => {
    const dueMs = (r: ReminderDto) =>
      r.due ? parseISO(r.due).getTime() || Infinity : Infinity;
    return (reminders ?? [])
      .filter(
        (r) =>
          (groupFilter === "all" || r.listId === groupFilter) &&
          matchesStatus(r, statusFilter),
      )
      .sort((a, b) => {
        // Incomplete before completed, then by due date (undated last), then title.
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const d = dueMs(a) - dueMs(b);
        return d !== 0 ? d : a.title.localeCompare(b.title);
      });
  }, [reminders, groupFilter, statusFilter]);

  return (
    <section className="flex h-full w-[22rem] shrink-0 flex-col border-l border-border">
      <header className="flex items-center justify-between px-4 pt-3">
        <h2 className="text-base font-semibold">Reminders</h2>
      </header>

      {/* Filters */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <Select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value as StatusFilter)}
          className="h-8 text-xs"
          aria-label="Status filter"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select
          value={groupFilter}
          onChange={(e) => onListFilterChange(e.target.value)}
          className="h-8 text-xs"
          aria-label="List filter"
        >
          <option value="all">All Lists</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </Select>
      </div>

      <div
        className="flex-1 overflow-y-auto border-t border-border px-3 py-3"
        onContextMenu={onEmptyContextMenu}
      >
        {loading && (
          <div className="flex items-center gap-2 px-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        )}

        {!loading && visible.length === 0 && (
          <p className="px-2 text-sm text-muted-foreground">No reminders match.</p>
        )}

        <div className="space-y-0.5">
          <AnimatePresence initial={false}>
          {visible.map((r) => {
            const due = formatReminderDue(r.due);
            return (
              <motion.div
                key={r.id ?? r.title}
                layout
                initial={POOF_INITIAL}
                animate={POOF_ANIMATE}
                exit={POOF_EXIT}
                transition={POOF_TRANSITION}
                draggable={!!r.id}
                onDragStartCapture={(e) => {
                  e.dataTransfer.setData("text/plain", r.id ?? "");
                  e.dataTransfer.effectAllowed = "move";
                }}
                onContextMenu={(e) => {
                  e.stopPropagation();
                  onContextMenu(e, r);
                }}
                className="group flex items-start gap-2.5 rounded-md px-2 py-2 hover:bg-accent"
                title="Drag onto the planner to schedule"
              >
                <Checkbox
                  checked={r.completed}
                  onCheckedChange={(c) => r.id && onToggle(r.id, c)}
                  aria-label="Toggle completed"
                  className="mt-0.5"
                />
                <button
                  onClick={() => onEdit(r)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div
                    className={cn(
                      "truncate text-sm",
                      r.completed && "text-muted-foreground line-through",
                    )}
                  >
                    {r.title}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {due && <span>{due}</span>}
                    {r.recurring && (
                      <Repeat className="size-3 shrink-0" aria-label="Repeats" />
                    )}
                    {r.listTitle && <span>· {r.listTitle}</span>}
                  </div>
                </button>
                <button
                  onClick={() => r.id && onDelete(r.id)}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Delete reminder"
                >
                  <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                </button>
              </motion.div>
            );
          })}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
