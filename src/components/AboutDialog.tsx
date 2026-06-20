import { useEffect, useState } from "react";
import { Cloud, CloudOff } from "lucide-react";
import { api, type AboutInfo } from "@/lib/api";
import { Dialog } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
  connected: boolean;
  login: string | null;
}

export function AboutDialog({ open, onClose, connected, login }: Props) {
  const [info, setInfo] = useState<AboutInfo | null>(null);

  useEffect(() => {
    if (open) api.aboutInfo().then(setInfo).catch(() => setInfo(null));
  }, [open]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} className="max-w-sm">
      <div className="flex flex-col items-center text-center">
        <img src="/icon.png" alt="" className="size-16 rounded-2xl shadow-sm" />
        <h2 className="mt-3 text-lg font-semibold">FocalPlanner</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A native macOS planner that unifies your Apple Calendar events and Reminders,
          organized by Areas of Focus.
        </p>
      </div>

      <div className="mt-5 space-y-3 text-sm">
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-muted-foreground">Sync</span>
          <span className="flex items-center gap-1.5">
            {connected ? (
              <>
                <Cloud className="size-4 text-muted-foreground" />
                Connected as @{login ?? "unknown"}
              </>
            ) : (
              <>
                <CloudOff className="size-4 text-muted-foreground" />
                Not connected
              </>
            )}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Version</span>
          <span className="tabular-nums">{info?.version ?? "—"}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Build</span>
          <span className="tabular-nums">
            {info?.buildEpochMs
              ? new Date(info.buildEpochMs).toLocaleString()
              : "—"}
          </span>
        </div>
      </div>
    </Dialog>
  );
}
