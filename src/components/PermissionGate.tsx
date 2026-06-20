import { useState } from "react";
import { CalendarCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, type AccessStatus } from "@/lib/api";

interface Props {
  status: AccessStatus;
  onGranted: () => void;
}

export function PermissionGate({ status, onGranted }: Props) {
  const [requesting, setRequesting] = useState(false);
  const denied =
    status.events === "denied" || status.reminders === "denied" ||
    status.events === "restricted" || status.reminders === "restricted";

  async function request() {
    setRequesting(true);
    try {
      const next = await api.requestAccess();
      if (next.events === "fullAccess" || next.reminders === "fullAccess") {
        onGranted();
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
      </Card>
    </div>
  );
}
