import { useEffect, useState } from "react";
import { CalendarCheck, Loader2 } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AboutDialog } from "@/components/AboutDialog";
import { api, type AccessStatus } from "@/lib/api";

interface Props {
  status: AccessStatus;
  onGranted: (status: AccessStatus) => void;
}

export function PermissionGate({ status, onGranted }: Props) {
  const [requesting, setRequesting] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  // Make the About dialog reachable from the gate (button + native "About
  // FocalPlanner" menu) so a user who is stuck here can read the app version to
  // report issues.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("menu-about", () => setAboutOpen(true)).then((un) => {
      unlisten = un;
    });
    return () => unlisten?.();
  }, []);

  const denied =
    status.events === "denied" || status.reminders === "denied" ||
    status.events === "restricted" || status.reminders === "restricted";

  async function request() {
    setRequesting(true);
    try {
      const next = await api.requestAccess();
      if (next.events === "fullAccess" || next.reminders === "fullAccess") {
        // Pass the authoritative status up; the App seeds it into the query cache
        // so the gate advances without re-reading the (briefly lagging) TCC status.
        onGranted(next);
      }
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-secondary">
          <CalendarCheck className="size-6" />
        </div>
        <h1 className="mb-2 text-xl font-semibold">Access required</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          FocalPlanner needs permission to read and manage your Calendar events
          and Reminders.
        </p>

        {denied ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">
              Access was denied. Enable it in System Settings → Privacy &
              Security → Calendars and Reminders, then reopen the app.
            </p>
            <Button variant="outline" onClick={() => api.openPrivacySettings()}>
              Open System Settings
            </Button>
          </div>
        ) : (
          <Button onClick={request} disabled={requesting}>
            {requesting && <Loader2 className="size-4 animate-spin" />}
            Grant access
          </Button>
        )}

        <div className="mt-6 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            About FocalPlanner
          </button>
        </div>
      </Card>

      <AboutDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        connected={false}
        login={null}
      />
    </div>
  );
}
