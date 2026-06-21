import * as React from "react";
import { cn } from "@/lib/utils";

interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The anchor element; clicking it should toggle `open` (handled by caller). */
  trigger: React.ReactNode;
  children: React.ReactNode;
  /** Horizontal alignment of the panel against the trigger. */
  align?: "start" | "end";
  className?: string;
}

/**
 * Lightweight popover (no Radix), matching the project's hand-rolled `Dialog`.
 * Closes on outside-click and Escape; the Escape handler stops propagation so it
 * doesn't also close a parent inspector listening on `window`.
 */
export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  align = "start",
  className,
}: PopoverProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    // Close on Escape, but let it propagate so a parent inspector also closes
    // (Escape should always cancel the whole editor, not just this popover).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div className="relative" ref={ref}>
      {trigger}
      {open && (
        <div
          role="dialog"
          className={cn(
            "absolute z-50 mt-2 w-auto rounded-md border border-border bg-background p-3 shadow-lg",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
