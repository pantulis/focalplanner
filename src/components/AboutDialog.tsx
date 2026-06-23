import { useEffect, useState } from "react";
import { Cloud, CloudOff, FlaskConical } from "lucide-react";
import { api, type AboutInfo } from "@/lib/api";
import { useDemoController } from "@/lib/demo/store";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
  connected: boolean;
  login: string | null;
}

export function AboutDialog({ open, onClose, connected, login }: Props) {
  const [info, setInfo] = useState<AboutInfo | null>(null);
  const demo = useDemoController();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open) api.aboutInfo().then(setInfo).catch(() => setInfo(null));
    else setConfirming(false);
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

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Build type</span>
          <span className="tabular-nums">
            {info ? (info.devBuild ? "Debug" : "Release") : "—"}
          </span>
        </div>
      </div>

      {info?.devBuild && (
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <FlaskConical className="size-4" /> Demo Mode
            </span>
            {demo.active && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                Active
              </span>
            )}
          </div>

          {demo.active ? (
            <>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                The app is showing built-in sample data. Your real Calendar and
                Reminders are untouched.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={() => {
                  demo.exit();
                  onClose();
                }}
              >
                Exit Demo Mode
              </Button>
            </>
          ) : confirming ? (
            <>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Demo Mode swaps in a built-in set of sample calendars, events, and
                reminders — generated fresh and dated around today — so you can
                capture screenshots without exposing personal data. Your real
                Calendar and Reminders are never read or modified while it's on,
                and the sample data stays on this device. Turn it off any time to
                return to your real data, exactly as it was.
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    demo.enter();
                    onClose();
                  }}
                >
                  Enter Demo Mode
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Populate the app with safe sample data for screenshots, without
                touching your real Calendar and Reminders.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={() => setConfirming(true)}
              >
                Enter Demo Mode…
              </Button>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
