import { ChevronLeft, ChevronRight, Minus, PanelRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ZOOM_MAX, ZOOM_MIN } from "@/lib/planner";

interface Props {
  title: string;
  label: string;
  navDisabled: boolean;
  showReminders: boolean;
  /** Weekly view: show the 5-day/7-day toggle. */
  weekView: boolean;
  workWeek: boolean;
  onToggleWorkWeek: () => void;
  /** Vertical-zoom multiplier of the time grid (1 = 100%). */
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onToggleReminders: () => void;
}

export function PlannerToolbar({
  title,
  label,
  navDisabled,
  showReminders,
  weekView,
  workWeek,
  onToggleWorkWeek,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onPrev,
  onNext,
  onToday,
  onToggleReminders,
}: Props) {
  return (
    <header
      data-tauri-drag-region
      className="flex select-none items-center gap-3 border-b border-border px-4 py-2.5"
    >
      <h1 className="pointer-events-none text-base font-semibold">{title}</h1>

      {/* Date navigation */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPrev}
          disabled={navDisabled}
          aria-label="Previous"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onToday} disabled={navDisabled}>
          Today
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNext}
          disabled={navDisabled}
          aria-label="Next"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {!navDisabled && (
        <div className="pointer-events-none text-sm font-semibold">{label}</div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {!navDisabled && (
          <div className="flex items-center rounded-md border border-border">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-r-none"
              onClick={onZoomOut}
              disabled={zoom <= ZOOM_MIN}
              aria-label="Zoom out"
              title="Shorter hours (zoom out)"
            >
              <Minus className="size-3.5" />
            </Button>
            <button
              type="button"
              onClick={onResetZoom}
              title="Reset zoom to 100%"
              className="w-12 select-none text-center text-xs tabular-nums text-muted-foreground hover:text-foreground"
            >
              {Math.round(zoom * 100)}%
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-l-none"
              onClick={onZoomIn}
              disabled={zoom >= ZOOM_MAX}
              aria-label="Zoom in"
              title="Taller hours (zoom in)"
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        )}
        {weekView && (
          <Button
            variant={workWeek ? "secondary" : "ghost"}
            size="sm"
            onClick={onToggleWorkWeek}
            title={
              workWeek
                ? "Showing the work week (Mon–Fri). Click for the full 7-day week."
                : "Showing the full 7-day week. Click for the work week (Mon–Fri)."
            }
          >
            {workWeek ? "5 days" : "7 days"}
          </Button>
        )}
        <Button
          variant={showReminders ? "secondary" : "ghost"}
          size="icon"
          onClick={onToggleReminders}
          aria-label="Toggle reminders panel"
          title="Toggle reminders panel"
        >
          <PanelRight className="size-4" />
        </Button>
      </div>
    </header>
  );
}
