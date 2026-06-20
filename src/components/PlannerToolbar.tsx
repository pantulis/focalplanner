import { ChevronLeft, ChevronRight, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  title: string;
  label: string;
  navDisabled: boolean;
  showReminders: boolean;
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
  onPrev,
  onNext,
  onToday,
  onToggleReminders,
}: Props) {
  return (
    <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
      <h1 className="text-base font-semibold">{title}</h1>

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

      {!navDisabled && <div className="text-sm font-semibold">{label}</div>}

      <div className="ml-auto flex items-center gap-2">
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
