import { useState } from "react";
import { ClipboardCheck, Flag, Inbox, Play, X } from "lucide-react";
import type { Area } from "@/lib/areas";
import { isAreaDue } from "@/lib/review";
import { cn } from "@/lib/utils";

interface Props {
  areas: Area[];
  onSelectArea: (id: string) => void;
  reviewedAt: Record<string, string>;
  intervalDays: number;
  onMarkReviewed: (id: string) => void;
  inboxCount: number;
  overdueCount: number;
}

/**
 * OmniFocus-style review for the Time Sector planner: process the Inbox and
 * overdue items, then review each Area of Focus on a configurable interval.
 * Per-area review status + checkmarks live in the Areas of Focus list above;
 * this panel drives the "Start review" walkthrough and the process queues.
 */
export function ReviewPanel({
  areas,
  onSelectArea,
  reviewedAt,
  intervalDays,
  onMarkReviewed,
  inboxCount,
  overdueCount,
}: Props) {
  const due = areas.filter((a) => isAreaDue(reviewedAt, a.id, intervalDays));

  // Guided "Start review" session: a snapshot queue walked one area at a time.
  const [queue, setQueue] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);

  function startReview() {
    if (due.length === 0) return;
    const ids = due.map((a) => a.id);
    setQueue(ids);
    setIndex(0);
    onSelectArea(ids[0]);
  }
  function advance(from: string[], i: number) {
    if (i + 1 < from.length) {
      setIndex(i + 1);
      onSelectArea(from[i + 1]);
    } else {
      endReview();
    }
  }
  function endReview() {
    setQueue(null);
    setIndex(0);
    onSelectArea("all");
  }

  if (queue) {
    const areaId = queue[index];
    const area = areas.find((a) => a.id === areaId);
    const Icon = area?.icon;
    return (
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between px-1">
          <span className="flex items-center gap-1.5 font-medium">
            <ClipboardCheck className="size-4" /> Reviewing
          </span>
          <span className="text-[10px] text-muted-foreground">
            {index + 1} / {queue.length}
          </span>
        </div>
        <div className="space-y-2 rounded-lg border border-border p-2.5">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="size-4 shrink-0" style={{ color: area?.color }} />}
            <span className="truncate font-medium">{area?.label ?? "—"}</span>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Re-sector this area's tasks on the board, then continue.
          </p>
          <button
            onClick={() => {
              onMarkReviewed(areaId);
              advance(queue, index);
            }}
            className="w-full rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Reviewed — next
          </button>
          <div className="flex gap-1.5">
            <button
              onClick={() => advance(queue, index)}
              className="flex-1 rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-accent"
            >
              Skip
            </button>
            <button
              onClick={endReview}
              className="flex items-center justify-center gap-1 rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-accent"
            >
              <X className="size-3" /> End
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between px-1">
        <span className="flex items-center gap-1.5 font-medium">
          <ClipboardCheck className="size-4" /> Review
        </span>
        {due.length > 0 && (
          <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary">
            {due.length} due
          </span>
        )}
      </div>

      {due.length > 0 && (
        <button
          onClick={startReview}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary/10 px-2 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
        >
          <Play className="size-3.5" /> Start review ({due.length})
        </button>
      )}

      <div className="space-y-0.5">
        <button
          onClick={() => onSelectArea("all")}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-accent"
        >
          <Inbox className="size-3.5 text-muted-foreground" />
          <span className="flex-1 text-left">To file</span>
          <span className={cn("tabular-nums", inboxCount > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
            {inboxCount}
          </span>
        </button>
        <button
          onClick={() => onSelectArea("all")}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-accent"
        >
          <Flag className="size-3.5 text-muted-foreground" />
          <span className="flex-1 text-left">Overdue</span>
          <span className={cn("tabular-nums", overdueCount > 0 ? "font-medium text-destructive" : "text-muted-foreground")}>
            {overdueCount}
          </span>
        </button>
      </div>
    </div>
  );
}
