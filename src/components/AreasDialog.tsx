import { useState } from "react";
import type { CalendarDto } from "@/lib/api";
import {
  AREAS,
  areaMembers,
  isMember,
  withMembershipMany,
  withMembership,
  type AreaConfig,
  type MemberKind,
} from "@/lib/areas";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  calendars: CalendarDto[];
  lists: CalendarDto[];
  config: AreaConfig;
  onChange: (next: AreaConfig) => void;
}

const UNGROUPED = "Other";

function groupByAccount(items: CalendarDto[]): [string, CalendarDto[]][] {
  const map = new Map<string, CalendarDto[]>();
  for (const c of items) {
    const key = c.account ?? UNGROUPED;
    const arr = map.get(key) ?? [];
    arr.push(c);
    map.set(key, arr);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function ColorDot({ color }: { color: string | null }) {
  return (
    <span
      className="size-3 shrink-0 rounded-full border border-black/10"
      style={{ backgroundColor: color ?? "var(--muted-foreground)" }}
    />
  );
}

export function AreasDialog({
  open,
  onClose,
  calendars,
  lists,
  config,
  onChange,
}: Props) {
  const [activeArea, setActiveArea] = useState(AREAS[0].id);

  function toggle(kind: MemberKind, id: string, on: boolean) {
    onChange(withMembership(config, activeArea, kind, id, on));
  }

  function setGroup(kind: MemberKind, items: CalendarDto[], on: boolean) {
    onChange(withMembershipMany(config, activeArea, kind, items.map((c) => c.id), on));
  }

  function membershipCount(areaId: string): number {
    const m = areaMembers(config, areaId);
    return m.calendarIds.length + m.listIds.length;
  }

  function Row({ cal, kind }: { cal: CalendarDto; kind: MemberKind }) {
    const checked = isMember(config, activeArea, kind, cal.id);
    return (
      <button
        onClick={() => toggle(kind, cal.id, !checked)}
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
      >
        <Checkbox checked={checked} onCheckedChange={(c) => toggle(kind, cal.id, c)} />
        <ColorDot color={cal.color} />
        <span className="truncate">{cal.title}</span>
      </button>
    );
  }

  function AccountGroup({
    account,
    group,
    kind,
  }: {
    account: string;
    group: CalendarDto[];
    kind: MemberKind;
  }) {
    const allSelected = group.every((c) => isMember(config, activeArea, kind, c.id));
    const noneSelected = group.every((c) => !isMember(config, activeArea, kind, c.id));
    return (
      <div className="group/acct mb-2">
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-[11px] font-medium text-muted-foreground/80">
            {account}
          </span>
          <div className="flex gap-2 text-xs opacity-0 transition-opacity group-hover/acct:opacity-100">
            <button
              className="text-primary hover:underline disabled:opacity-40"
              disabled={allSelected}
              onClick={() => setGroup(kind, group, true)}
            >
              Select all
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              className="text-primary hover:underline disabled:opacity-40"
              disabled={noneSelected}
              onClick={() => setGroup(kind, group, false)}
            >
              Deselect all
            </button>
          </div>
        </div>
        {group.map((c) => (
          <Row key={c.id} cal={c} kind={kind} />
        ))}
      </div>
    );
  }

  function Group({ items, kind }: { items: CalendarDto[]; kind: MemberKind }) {
    const title = kind === "calendar" ? "Calendars" : "Reminder Lists";
    return (
      <section className="mb-5">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>

        {items.length === 0 && (
          <p className="px-2 text-sm text-muted-foreground">None.</p>
        )}

        {groupByAccount(items).map(([account, group]) => (
          <AccountGroup key={account} account={account} group={group} kind={kind} />
        ))}
      </section>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} className="max-w-4xl">
      <DialogHeader>
        <DialogTitle>Areas of Focus</DialogTitle>
        <DialogDescription>
          Assign calendars and reminder lists (grouped by account) to each area. A
          calendar or list can belong to several areas.
        </DialogDescription>
      </DialogHeader>

      <div className="flex gap-4">
        {/* Areas list */}
        <div className="w-44 shrink-0 space-y-1">
          {AREAS.map((a) => {
            const Icon = a.icon;
            const count = membershipCount(a.id);
            return (
              <button
                key={a.id}
                onClick={() => setActiveArea(a.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                  activeArea === a.id ? "bg-accent font-medium" : "hover:bg-accent/60",
                )}
              >
                <Icon className="size-4 shrink-0" style={{ color: a.color }} />
                <span className="flex-1 truncate">{a.label}</span>
                {count > 0 && (
                  <span className="text-xs text-muted-foreground">{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Membership editor: Calendars (left) and Reminder Groups (right) */}
        <div className="flex min-w-0 flex-1 gap-4">
          <div className="max-h-[60vh] flex-1 overflow-y-auto">
            <Group items={calendars} kind="calendar" />
          </div>
          <div className="max-h-[60vh] flex-1 overflow-y-auto border-l border-border pl-4">
            <Group items={lists} kind="list" />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
