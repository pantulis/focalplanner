import { CalendarX2, Info } from "lucide-react";
import type { EventDto } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const FALLBACK_COLOR = "#3b82f6";

export interface CloneDialogState {
  /** "delete" asks which copies to remove; "edit-notice" warns edits don't propagate. */
  mode: "delete" | "edit-notice";
  /** The event the user acted on. */
  event: EventDto;
  /** All clone members (this one + the copies in other calendars). */
  group: EventDto[];
}

interface Props {
  state: CloneDialogState | null;
  onClose: () => void;
  onDeleteOne: (event: EventDto) => void;
  onDeleteAll: (group: EventDto[]) => void;
}

/** Table of the calendars holding a copy of the cloned event. */
function CalendarTable({ group, currentId }: { group: EventDto[]; currentId: string | null }) {
  return (
    <div className="divide-y divide-border rounded-md border border-border">
      {group.map((e, i) => (
        <div key={e.id ?? i} className="flex items-center gap-2 px-3 py-2 text-sm">
          <span
            className="size-2.5 shrink-0 rounded-full border border-black/10"
            style={{ backgroundColor: e.color ?? FALLBACK_COLOR }}
          />
          <span className="min-w-0 flex-1 truncate">{e.calendarTitle ?? "Calendar"}</span>
          {e.id === currentId && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
              this copy
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Modal for clone (multi-calendar copy) interactions: choosing which copies to
 * delete, or informing that an edit only affected the clicked copy.
 */
export function CloneDialog({ state, onClose, onDeleteOne, onDeleteAll }: Props) {
  if (!state) return null;
  const { mode, event, group } = state;
  const isDelete = mode === "delete";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} className="max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {isDelete ? <CalendarX2 className="size-4" /> : <Info className="size-4" />}
          {isDelete ? "Delete cloned event?" : "Edits apply to this copy only"}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {isDelete ? (
            <>
              &ldquo;{event.title}&rdquo; is copied across {group.length} calendars. Delete just
              this copy, or every copy?
            </>
          ) : (
            <>
              Your changes were saved to <span className="font-medium">this copy only</span>. The
              copies of &ldquo;{event.title}&rdquo; in the other calendars are unchanged.
            </>
          )}
        </p>

        <CalendarTable group={group} currentId={event.id ?? null} />
      </div>

      {isDelete ? (
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => onDeleteOne(event)}>
            Delete this copy
          </Button>
          <Button variant="destructive" onClick={() => onDeleteAll(group)}>
            Delete all {group.length} copies
          </Button>
        </DialogFooter>
      ) : (
        <DialogFooter>
          <Button onClick={onClose}>Got it</Button>
        </DialogFooter>
      )}
    </Dialog>
  );
}
