import * as React from "react";
import { useState } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const bannerVariants = cva(
  "flex items-center gap-2 border-t px-4 py-2 text-sm",
  {
    variants: {
      variant: {
        info: "border-border bg-primary/10 text-foreground [&_.banner-accent]:text-primary",
        neutral:
          "border-border bg-muted text-muted-foreground [&_.banner-accent]:text-foreground",
        success:
          "border-emerald-500/20 bg-emerald-500/10 text-foreground [&_.banner-accent]:text-emerald-600 dark:[&_.banner-accent]:text-emerald-400",
        warning:
          "border-amber-500/20 bg-amber-500/10 text-foreground [&_.banner-accent]:text-amber-600 dark:[&_.banner-accent]:text-amber-400",
        destructive:
          "border-destructive/20 bg-destructive/10 text-foreground [&_.banner-accent]:text-destructive",
        // Sticky-note look: solid pale yellow, like a Post-it.
        note:
          "border-yellow-300/70 bg-yellow-100 text-yellow-900 [&_.banner-accent]:text-yellow-600 dark:border-yellow-500/25 dark:bg-yellow-400/15 dark:text-yellow-100 dark:[&_.banner-accent]:text-yellow-300",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

export interface BannerProps extends VariantProps<typeof bannerVariants> {
  /** Optional leading icon, tinted to the variant accent color. */
  icon?: LucideIcon;
  /** Optional trailing control (button/link). */
  action?: React.ReactNode;
  /** When provided the banner is dismissable and renders a ✕ button. Omit for a
   *  non-dismissable, condition-driven ("modal") banner. */
  onDismiss?: () => void;
  className?: string;
  children: React.ReactNode;
}

/** A full-width notice bar. Presentational only — the caller controls visibility. */
export function Banner({
  variant,
  icon: Icon,
  action,
  onDismiss,
  className,
  children,
}: BannerProps) {
  return (
    <div role="status" className={cn(bannerVariants({ variant }), className)}>
      {Icon && <Icon className="banner-accent size-4 shrink-0" />}
      <div className="min-w-0 flex-1 truncate">{children}</div>
      {action}
      {onDismiss && (
        <button
          onClick={onDismiss}
          title="Dismiss"
          aria-label="Dismiss"
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Remembers whether a dismissable banner (e.g. a usage tip) was closed, in
 * localStorage. Mirrors the app's existing one-shot UI persistence convention.
 */
export function useDismissibleBanner(key: string) {
  const storageKey = `fp:banner:${key}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
  };
  return { dismissed, dismiss };
}
