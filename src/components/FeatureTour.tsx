import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarRange,
  Cloud,
  MousePointerClick,
  Palette,
  PanelRight,
  PartyPopper,
  Sparkles,
  Target,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Step {
  icon: LucideIcon;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: "Welcome to FocalPlanner",
    body: "Your Apple Calendar events and Reminders, unified into one focused planner. Here's a 30-second tour of what you can do.",
  },
  {
    icon: Target,
    title: "Areas of Focus",
    body: "Group your calendars and reminder lists into areas like Work or Personal in the sidebar. Drag to reorder them, and switch areas to filter the whole planner at once.",
  },
  {
    icon: CalendarRange,
    title: "Daily & weekly views",
    body: "Switch between Today and Weekly in the sidebar, jump around with the mini-calendar, and use the toolbar — or the arrow keys — to move between dates.",
  },
  {
    icon: MousePointerClick,
    title: "Drag to schedule",
    body: "Drag a reminder from the sidebar onto any time slot to schedule it, and drag or resize events right on the grid. Right-click empty space to create something new.",
  },
  {
    icon: PanelRight,
    title: "Inspectors with context",
    body: "Click any event or reminder to edit it in the side panel. A mini schedule-context view shows what else is happening nearby and flags conflicts or busy times.",
  },
  {
    icon: Palette,
    title: "Make it yours",
    body: "Open Settings (⌘,) to pick from 12 themes, choose a typeface, set your work hours and week start, and tune the inspector context window.",
  },
  {
    icon: Cloud,
    title: "Sync across Macs (optional)",
    body: "Connect a GitHub account to sync your settings and areas of focus between machines. Your calendar and reminder data always stays in macOS.",
  },
  {
    icon: PartyPopper,
    title: "You're all set",
    body: "You can replay this tour anytime from Settings → General. Happy planning!",
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function FeatureTour({ open, onClose }: Props) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setI((n) => Math.min(STEPS.length - 1, n + 1));
      else if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const step = STEPS[i];
  const Icon = step.icon;
  const first = i === 0;
  const last = i === STEPS.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-border bg-background shadow-xl"
      >
        <button
          onClick={onClose}
          aria-label="Close tour"
          className="absolute right-3 top-3 rounded-sm text-muted-foreground transition-opacity hover:opacity-70"
        >
          <X className="size-4" />
        </button>

        <div className="flex flex-col items-center gap-4 px-6 pb-5 pt-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="size-7" />
          </div>
          <h2 className="text-lg font-semibold">{step.title}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
        </div>

        <div className="flex items-center justify-center gap-1.5 pb-4">
          {STEPS.map((_, n) => (
            <span
              key={n}
              className={cn(
                "h-1.5 rounded-full transition-all",
                n === i ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30",
              )}
            />
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <span className="text-xs text-muted-foreground">
            {i + 1} / {STEPS.length}
          </span>
          <div className="flex items-center gap-2">
            {!first && (
              <Button variant="ghost" size="sm" onClick={() => setI((n) => n - 1)}>
                Back
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => (last ? onClose() : setI((n) => n + 1))}
            >
              {last ? "Get started" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
