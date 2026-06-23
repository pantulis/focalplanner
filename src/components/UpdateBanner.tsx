import { ArrowUpCircle } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { UpdateInfo } from "@/lib/useUpdateCheck";
import { Banner } from "@/components/ui/Banner";

/** Notify-only "update available" banner, shown in the window's footer. */
export function UpdateBanner({
  update,
  onDismiss,
}: {
  update: UpdateInfo;
  onDismiss: () => void;
}) {
  return (
    <Banner
      variant="info"
      icon={ArrowUpCircle}
      onDismiss={onDismiss}
      action={
        <button
          onClick={() => openUrl(update.url).catch(() => {})}
          className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Download
        </button>
      }
    >
      <span className="font-medium">{update.name}</span> is available.
    </Banner>
  );
}
