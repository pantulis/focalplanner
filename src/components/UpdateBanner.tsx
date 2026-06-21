import { ArrowUpCircle, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { UpdateInfo } from "@/lib/useUpdateCheck";

/** Notify-only "update available" banner shown atop the content column. */
export function UpdateBanner({
  update,
  onDismiss,
}: {
  update: UpdateInfo;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-primary/10 px-4 py-2 text-sm">
      <ArrowUpCircle className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{update.name}</span> is available.
      </span>
      <button
        onClick={() => openUrl(update.url).catch(() => {})}
        className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Download
      </button>
      <button
        onClick={onDismiss}
        title="Dismiss"
        aria-label="Dismiss update notification"
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
