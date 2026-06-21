import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edge the panel slides in from. */
  side?: "right" | "left";
  className?: string;
  children: React.ReactNode;
}

const DURATION = 200;

/**
 * Side panel ("sheet") in the same hand-rolled style as Dialog: portal +
 * backdrop, Escape to close, with a CSS slide/fade in and out. Kept mounted
 * through the exit transition so the close animation can play.
 */
function Sheet({ open, onOpenChange, side = "right", className, children }: SheetProps) {
  const [mounted, setMounted] = React.useState(open);
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setMounted(true);
      // Mount in the hidden state, let that frame paint, then flip to visible so
      // the transition has a starting point. A single rAF can run before the
      // first paint of the freshly-mounted node, which makes the enter jump.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), DURATION);
    return () => clearTimeout(t);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!mounted) return null;

  const hidden = side === "right" ? "translate-x-full" : "-translate-x-full";

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className={cn(
          "absolute inset-0 bg-black/40 transition-opacity duration-200",
          shown ? "opacity-100" : "opacity-0",
        )}
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "absolute top-0 flex h-full flex-col bg-background shadow-lg transition-transform duration-200 ease-out",
          side === "right" ? "right-0 border-l border-border" : "left-0 border-r border-border",
          shown ? "translate-x-0" : hidden,
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export { Sheet };
