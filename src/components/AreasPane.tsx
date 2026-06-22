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
import { cn } from "@/lib/utils";

interface Props {
  calendars: CalendarDto[];
  lists: CalendarDto[];
  config: AreaConfig;
  onChange: (next: AreaConfig) => void;
  defaultCalendarByArea: Record<string, string>;
  defaultListByArea: Record<string, string>;
  onSetDefault: (areaId: string, kind: MemberKind, id: string) => void;
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

/** "Is the default" radio for a member row — enabled only when the row is a member. */
function DefaultRadio({
  checked,
  disabled,
  onSelect,
}: {
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-label={checked ? "Default (click to clear)" : "Set as default"}
      title={disabled ? "Add to this area first" : checked ? "Default" : "Set as default"}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
        disabled
          ? "cursor-not-allowed border-border/50 opacity-40"
          : checked
            ? "border-primary"
            : "border-muted-foreground/40 hover:border-primary",
      )}
    >
      {checked && <span className="size-2 rounded-full bg-primary" />}
    </button>
  );
}

/** Assign calendars and reminder lists (grouped by account) to areas of focus. */
export function AreasPane({
  calendars,
  lists,
  config,
  onChange,
  defaultCalendarByArea,
  defaultListByArea,
  onSetDefault,
}: Props) {
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
    const defaults = kind === "calendar" ? defaultCalendarByArea : defaultListByArea;
    const isDefault = defaults[activeArea] === cal.id;
    return (
      <div className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
          <Checkbox
            checked={checked}
            onCheckedChange={(c) => {
              toggle(kind, cal.id, c);
              // Dropping a member that was the default clears the default.
              if (!c && isDefault) onSetDefault(activeArea, kind, "");
            }}
          />
          <ColorDot color={cal.color} />
          <span className="truncate">{cal.title}</span>
        </label>
        <DefaultRadio
          checked={isDefault}
          disabled={!checked}
          onSelect={() => onSetDefault(activeArea, kind, isDefault ? "" : cal.id)}
        />
      </div>
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
        <div className="mb-1.5 flex items-center justify-between gap-2 pr-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {kind === "calendar" ? "Calendars" : "Reminder Lists"}
          </h3>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            Default
          </span>
        </div>
        {items.length === 0 && <p className="px-2 text-sm text-muted-foreground">None.</p>}
        {groupByAccount(items).map(([account, group]) => (
          <AccountGroup key={account} account={account} group={group} kind={kind} />
        ))}
      </section>
    );
  }

  return (
    <div className="flex gap-4">
      {/* Master: vertical rail of areas. */}
      <nav className="w-44 shrink-0 space-y-0.5">
        {AREAS.map((a) => {
          const Icon = a.icon;
          const count = membershipCount(a.id);
          const active = activeArea === a.id;
          return (
            <button
              key={a.id}
              onClick={() => setActiveArea(a.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                active
                  ? "bg-primary/10 font-medium text-foreground"
                  : "text-foreground/70 hover:bg-accent/60",
              )}
            >
              <Icon className="size-4 shrink-0" style={{ color: a.color }} />
              <span className="min-w-0 flex-1 truncate text-left">{a.label}</span>
              {count > 0 && (
                <span className="shrink-0 text-xs text-muted-foreground">{count}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Detail: the selected area's defaults and member calendars/lists. */}
      <div className="min-w-0 flex-1 space-y-4 border-l border-border pl-4">
        <p className="text-xs text-muted-foreground">
          A calendar or list can belong to several areas. Pick the{" "}
          <span className="font-medium text-foreground">Default</span> one used when you
          create an event or reminder while this area is active.
        </p>

        <div className="flex gap-4 border-t border-border pt-3">
          <div className="min-w-0 flex-1">
            <Group items={calendars} kind="calendar" />
          </div>
          <div className="min-w-0 flex-1 border-l border-border pl-4">
            <Group items={lists} kind="list" />
          </div>
        </div>
      </div>
    </div>
  );
}
