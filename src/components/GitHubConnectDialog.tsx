import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Copy, ExternalLink, Loader2 } from "lucide-react";
import { api, type DeviceStart, type GithubAccount } from "@/lib/api";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: (account: GithubAccount) => void;
}

type Phase = "starting" | "awaiting" | "error";

export function GitHubConnectDialog({ open, onClose, onSuccess }: Props) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [device, setDevice] = useState<DeviceStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setPhase("starting");
      setError(null);
      setDevice(null);
      try {
        const d = await api.githubDeviceStart();
        if (cancelled) return;
        setDevice(d);
        setPhase("awaiting");
        try {
          await navigator.clipboard.writeText(d.userCode);
        } catch {
          /* clipboard may be unavailable */
        }
        openUrl(d.verificationUri).catch(() => {});
        const account = await api.githubDevicePoll(d.deviceCode, d.interval);
        if (cancelled) return;
        onSuccess(account);
      } catch (e) {
        if (cancelled) return;
        const msg = String(e);
        if (msg.includes("cancelled")) return;
        setError(msg);
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, attempt]);

  function close() {
    api.githubDeviceCancel().catch(() => {});
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogHeader>
        <DialogTitle>Connect GitHub</DialogTitle>
        <DialogDescription>
          Sync your preferences across Macs via a private gist.
        </DialogDescription>
      </DialogHeader>

      {phase === "starting" && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Requesting a device code…
        </div>
      )}

      {phase === "awaiting" && device && (
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Enter this code at{" "}
            <span className="font-medium text-foreground">github.com/login/device</span>{" "}
            (we opened it in your browser):
          </p>
          <div className="flex items-center justify-center gap-3">
            <span className="rounded-md border border-border bg-muted px-4 py-2 font-mono text-2xl tracking-widest">
              {device.userCode}
            </span>
            <Button
              variant="outline"
              size="icon"
              title="Copy code"
              onClick={() => navigator.clipboard.writeText(device.userCode).catch(() => {})}
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Waiting for approval…
          </div>
          <div className="flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => openUrl(device.verificationUri)}>
              <ExternalLink className="size-4" /> Open GitHub
            </Button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="space-y-3 py-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <DialogFooter>
        {phase === "error" && (
          <Button variant="outline" onClick={() => setAttempt((a) => a + 1)}>
            Try again
          </Button>
        )}
        <Button variant="ghost" onClick={close}>
          {phase === "error" ? "Close" : "Cancel"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
