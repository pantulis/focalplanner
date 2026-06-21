import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Cloud, Loader2, Lock, Sparkles } from "lucide-react";
import type { CalendarDto } from "@/lib/api";
import type { AreaConfig } from "@/lib/areas";
import type { SyncController } from "@/lib/sync";
import { AreasPane } from "@/components/AreasPane";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FONTS,
  HOURS,
  SCALES,
  THEMES,
  type Settings,
} from "@/lib/settings";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type Pane = "general" | "areas" | "calendars" | "appearance" | "sync";

interface Props {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  calendars: CalendarDto[];
  lists: CalendarDto[];
  /** Visible (non-ignored) calendars/lists for the Areas of Focus editor. */
  areaCalendars: CalendarDto[];
  areaLists: CalendarDto[];
  areaConfig: AreaConfig;
  onAreaConfigChange: (next: AreaConfig) => void;
  sync: SyncController;
  onConnectClick: () => void;
  /** Pane to show when the dialog is (re)opened. */
  initialPane?: Pane;
  /** Re-run the first-launch feature tour. */
  onReplayTour: () => void;
}

const PANES: { id: Pane; label: string }[] = [
  { id: "general", label: "General" },
  { id: "areas", label: "Areas of Focus" },
  { id: "calendars", label: "Calendars" },
  { id: "appearance", label: "Appearance" },
  { id: "sync", label: "Sync" },
];

function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

function HourSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (h: number) => void;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-8 w-24 text-xs"
    >
      {HOURS.map((h) => (
        <option key={h} value={h}>
          {hourLabel(h)}
        </option>
      ))}
    </Select>
  );
}

export function SettingsDialog({
  open,
  onClose,
  settings,
  onChange,
  calendars,
  lists,
  areaCalendars,
  areaLists,
  areaConfig,
  onAreaConfigChange,
  sync,
  onConnectClick,
  initialPane,
  onReplayTour,
}: Props) {
  const [pane, setPane] = useState<Pane>("general");
  const [passphrase, setPassphrase] = useState("");

  // Jump to the requested pane each time the dialog opens.
  useEffect(() => {
    if (open) setPane(initialPane ?? "general");
  }, [open, initialPane]);

  async function doPull(force: boolean) {
    if (force && !window.confirm("Replace local preferences with the synced copy?")) return;
    const result = await sync.pull(force);
    if (result === "applied") toast.success("Pulled latest preferences");
    else if (result === "up-to-date") toast("Already up to date");
    else if (result === "empty") toast("Nothing to pull yet");
  }

  const ignoredCals = new Set(settings.ignoredCalendarIds);
  const ignoredLists = new Set(settings.ignoredListIds);

  function toggleIgnoreCal(id: string, ignore: boolean) {
    const next = new Set(ignoredCals);
    if (ignore) next.add(id);
    else next.delete(id);
    onChange({ ignoredCalendarIds: [...next] });
  }
  function toggleIgnoreList(id: string, ignore: boolean) {
    const next = new Set(ignoredLists);
    if (ignore) next.add(id);
    else next.delete(id);
    onChange({ ignoredListIds: [...next] });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>Settings</DialogTitle>
      </DialogHeader>

      <div className="flex gap-4">
        <div className="w-36 shrink-0 space-y-1">
          {PANES.map((p) => (
            <button
              key={p.id}
              onClick={() => setPane(p.id)}
              className={cn(
                "w-full rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                pane === p.id ? "bg-accent font-medium" : "hover:bg-accent/60",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="h-[30rem] min-w-0 flex-1 overflow-y-auto pr-1">
          {pane === "general" && (
            <div className="space-y-5">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={settings.showCompletedReminders}
                  onCheckedChange={(c) => onChange({ showCompletedReminders: c })}
                />
                Show completed reminders
              </label>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={settings.menubarEnabled}
                  onCheckedChange={(c) => onChange({ menubarEnabled: c })}
                />
                Show current event &amp; today's agenda in the menu bar
              </label>

              <div className="space-y-1.5">
                <Label>Week begins on</Label>
                <Select
                  value={settings.weekStartsOn}
                  onChange={(e) =>
                    onChange({ weekStartsOn: Number(e.target.value) as 0 | 1 })
                  }
                  className="h-8 w-40 text-xs"
                >
                  <option value={0}>Sunday</option>
                  <option value={1}>Monday</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Scheduling context for inspector view</Label>
                <Select
                  value={settings.inspectorContextHours}
                  onChange={(e) =>
                    onChange({ inspectorContextHours: Number(e.target.value) })
                  }
                  className="h-8 w-40 text-xs"
                >
                  {[1, 2, 3, 4, 6].map((h) => (
                    <option key={h} value={h}>
                      ± {h} hour{h > 1 ? "s" : ""}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Workday hours</Label>
                <div className="flex items-center gap-2">
                  <HourSelect
                    value={settings.workdayStart}
                    onChange={(h) => onChange({ workdayStart: h })}
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <HourSelect
                    value={settings.workdayEnd}
                    onChange={(h) => onChange({ workdayEnd: h })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Weekend hours</Label>
                <div className="flex items-center gap-2">
                  <HourSelect
                    value={settings.weekendStart}
                    onChange={(h) => onChange({ weekendStart: h })}
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <HourSelect
                    value={settings.weekendEnd}
                    onChange={(h) => onChange({ weekendEnd: h })}
                  />
                </div>
              </div>

              <div className="space-y-1.5 border-t border-border pt-4">
                <Label>Feature tour</Label>
                <div>
                  <Button variant="outline" size="sm" onClick={onReplayTour}>
                    <Sparkles className="size-4" /> Replay tour
                  </Button>
                </div>
              </div>
            </div>
          )}

          {pane === "areas" && (
            <AreasPane
              calendars={areaCalendars}
              lists={areaLists}
              config={areaConfig}
              onChange={onAreaConfigChange}
            />
          )}

          {pane === "calendars" && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Hidden calendars and lists are excluded everywhere — areas of focus,
                filters, and the planner.
              </p>
              <IgnoreSection
                title="Calendars"
                items={calendars}
                ignored={ignoredCals}
                onToggle={toggleIgnoreCal}
              />
              <IgnoreSection
                title="Reminder Lists"
                items={lists}
                ignored={ignoredLists}
                onToggle={toggleIgnoreList}
              />
            </div>
          )}

          {pane === "appearance" && (
            <div className="space-y-5">
              <div className="flex gap-4">
                <div className="flex-1 space-y-1.5">
                  <Label>Typeface</Label>
                  <Select
                    value={settings.font}
                    onChange={(e) => onChange({ font: e.target.value })}
                    className="h-8 w-full text-xs"
                  >
                    {FONTS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="flex-1 space-y-1.5">
                  <Label>UI scale</Label>
                  <Select
                    value={settings.scale}
                    onChange={(e) => onChange({ scale: Number(e.target.value) })}
                    className="h-8 w-full text-xs"
                  >
                    {SCALES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label} ({Math.round(s.value * 100)}%)
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Theme</Label>
                <div className="grid grid-cols-3 gap-2">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => onChange({ theme: t.id })}
                      className={cn(
                        "flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors",
                        settings.theme === t.id
                          ? "border-primary ring-1 ring-primary"
                          : "border-border hover:bg-accent/50",
                      )}
                    >
                      <div className="flex h-8 overflow-hidden rounded">
                        {t.swatch.map((c, i) => (
                          <span key={i} className="flex-1" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                      <span className="flex items-center gap-1 text-xs font-medium">
                        {settings.theme === t.id && <Check className="size-3" />}
                        {t.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {pane === "sync" && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Sync your preferences and areas of focus across your Macs via a private
                GitHub gist. Calendars and reminders themselves stay in macOS.
              </p>

              {!sync.account.connected ? (
                <Button onClick={onConnectClick}>
                  <Cloud className="size-4" /> Connect GitHub
                </Button>
              ) : sync.locked ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Lock className="size-4" />
                    Connected as{" "}
                    <span className="font-medium">@{sync.account.login ?? "unknown"}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This account's synced data is encrypted. Enter the passphrase you set
                    on your other Mac to unlock it.
                  </p>
                  {sync.error && (
                    <p className="text-xs text-destructive">{sync.error}</p>
                  )}
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      placeholder="Passphrase"
                      className="h-8 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && passphrase) {
                          sync.unlock(passphrase);
                          setPassphrase("");
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      disabled={!passphrase || sync.syncing}
                      onClick={() => {
                        sync.unlock(passphrase);
                        setPassphrase("");
                      }}
                    >
                      {sync.syncing && <Loader2 className="size-4 animate-spin" />} Unlock
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => sync.disconnect()}
                    disabled={sync.syncing}
                  >
                    Disconnect
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Cloud className="size-4" />
                    Connected as{" "}
                    <span className="font-medium">
                      @{sync.account.login ?? "unknown"}
                    </span>
                    {sync.syncing && (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {sync.lastSyncedAt
                      ? `Last synced ${new Date(sync.lastSyncedAt).toLocaleString()}`
                      : "Not synced yet"}
                    {sync.error && (
                      <span className="block text-destructive">{sync.error}</span>
                    )}
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={settings.autoSync}
                      onCheckedChange={(c) => onChange({ autoSync: c })}
                    />
                    Sync automatically on changes
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => sync.push()} disabled={sync.syncing}>
                      Sync now
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => doPull(false)}
                      disabled={sync.syncing}
                    >
                      Pull from GitHub
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => doPull(true)}
                      disabled={sync.syncing}
                    >
                      Force pull (replace local)
                    </Button>
                  </div>

                  <div className="space-y-2 border-t border-border pt-3">
                    <Label>Encryption</Label>
                    {sync.hasPassphrase ? (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Lock className="size-3.5" /> End-to-end encrypted
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={sync.syncing}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Remove the passphrase and store synced preferences unencrypted?",
                              )
                            )
                              sync.clearPassphrase();
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground">
                          Optional: encrypt the synced gist with a passphrase. Use the
                          same passphrase on each Mac. It can't be recovered if lost.
                        </p>
                        <div className="flex gap-2">
                          <Input
                            type="password"
                            value={passphrase}
                            onChange={(e) => setPassphrase(e.target.value)}
                            placeholder="Passphrase"
                            className="h-8 text-xs"
                          />
                          <Button
                            size="sm"
                            disabled={!passphrase || sync.syncing}
                            onClick={() => {
                              sync.setPassphrase(passphrase);
                              setPassphrase("");
                            }}
                          >
                            Encrypt
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => sync.disconnect()}
                    disabled={sync.syncing}
                  >
                    Disconnect
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function IgnoreSection({
  title,
  items,
  ignored,
  onToggle,
}: {
  title: string;
  items: CalendarDto[];
  ignored: Set<string>;
  onToggle: (id: string, ignore: boolean) => void;
}) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {items.length === 0 && <p className="px-2 text-sm text-muted-foreground">None.</p>}
      {items.map((c) => (
        <label
          key={c.id}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
        >
          <Checkbox
            checked={!ignored.has(c.id)}
            onCheckedChange={(visible) => onToggle(c.id, !visible)}
          />
          <span
            className="size-3 shrink-0 rounded-full border border-black/10"
            style={{ backgroundColor: c.color ?? "var(--muted-foreground)" }}
          />
          <span className={cn("truncate", ignored.has(c.id) && "text-muted-foreground line-through")}>
            {c.title}
          </span>
          {c.account && (
            <span className="ml-auto text-xs text-muted-foreground">{c.account}</span>
          )}
        </label>
      ))}
    </section>
  );
}
