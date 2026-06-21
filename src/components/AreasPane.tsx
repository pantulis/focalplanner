import { useState } from "react";
import type { CalendarDto } from "@/lib/api";
import {
  AREAS,
  areaMembers,
  isMember,
  withMembership,
  withMembershipMany,
  type AreaConfig,
  type MemberKind,
} from "@/lib/areas";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Props {
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

/** Assign calendars and reminder lists (grouped by account) to areas of focus. */
export function AreasPane({ calendars, lists, config, onChange }: Props) {
  const [activeArea, setActiveArea] = useState(AREAS[0].id);

  const toggle = (kind: MemberKind, id: string, on: boolean) =>
    onChange(withMembership(config, activeArea, kind, id, on));

  const setGroup = (kind: MemberKind, items: CalendarDto[], on: boolean) =>
    onChange(withMembershipMany(config, activeArea, kind, items.map((c) => c.id), on));

  const membershipCount = (areaId: string) => {
    const m = areaMembers(config, areaId);
    return m.calendarIds.length + m.listIds.length;
  };

  function Row({ cal, kind }: { cal: CalendarDto; kind: MemberKind }) {
    const checked = isMember(config, activeArea, kind, cal.id);
    return (
      <label className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
        <Checkbox checked={checked} onCheckedChange={(c) => toggle(kind, cal.id, c)} />
        <ColorDot color={cal.color} />
        <span className="truncate">{cal.title}</span>
      </label>
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
          <span className="text-[11px] font-medium text-muted-foreground/80">{account}</span>
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
    return (
      <section>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {kind === "calendar" ? "Calendars" : "Reminder Lists"}
        </h3>
        {items.length === 0 && <p className="px-2 text-sm text-muted-foreground">None.</p>}
        {groupByAccount(items).map(([account, group]) => (
          <AccountGroup key={account} account={account} group={group} kind={kind} />
        ))}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Area</Label>
        <p className="text-xs text-muted-foreground">
          A calendar or list can belong to several areas. Reorder areas by dragging them in
          the sidebar.
        </p>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {AREAS.map((a) => {
            const Icon = a.icon;
            const count = membershipCount(a.id);
            const active = activeArea === a.id;
            return (
              <button
                key={a.id}
                onClick={() => setActiveArea(a.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  active
                    ? "border-primary bg-primary/10 font-medium text-foreground"
                    : "border-border text-foreground/70 hover:bg-accent/60",
                )}
              >
                <Icon className="size-3.5 shrink-0" style={{ color: a.color }} />
                {a.label}
                {count > 0 && <span className="text-muted-foreground">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-4 border-t border-border pt-3">
        <div className="min-w-0 flex-1">
          <Group items={calendars} kind="calendar" />
        </div>
        <div className="min-w-0 flex-1 border-l border-border pl-4">
          <Group items={lists} kind="list" />
        </div>
      </div>
    </div>
  );
}
