import {
  CalendarDays,
  CalendarRange,
  Cloud,
  CloudOff,
  Layers,
  LayoutDashboard,
  Loader2,
  Settings,
  Settings2,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { Area } from "@/lib/areas";
import { cn } from "@/lib/utils";

export type Section = "today" | "weekly" | "planner";

interface SyncStatus {
  connected: boolean;
  syncing: boolean;
  error: string | null;
}

interface Props {
  section: Section;
  onSelect: (section: Section) => void;
  areas: Area[];
  activeArea: string;
  onSelectArea: (id: string) => void;
  onOpenAreas: () => void;
  onOpenSettings: () => void;
  sync: SyncStatus;
}

function SyncIndicator({ sync, onClick }: { sync: SyncStatus; onClick: () => void }) {
  if (!sync.connected) return null;
  const { syncing, error } = sync;
  const Icon = syncing ? Loader2 : error ? CloudOff : Cloud;
  return (
    <button
      onClick={onClick}
      title={syncing ? "Syncing…" : error ? `Sync error: ${error}` : "Synced"}
      aria-label="Sync status"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-accent",
        error ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <Icon className={cn("size-4", syncing && "animate-spin")} />
    </button>
  );
}

const NAV: { id: Section; label: string; icon: LucideIcon; soon?: boolean }[] = [
  { id: "today", label: "Today", icon: CalendarDays },
  { id: "weekly", label: "Weekly", icon: CalendarRange },
  { id: "planner", label: "Planner", icon: LayoutDashboard, soon: true },
];

function NavButton({
  active,
  label,
  icon: Icon,
  soon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-foreground/80 hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {soon && (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted-foreground">
          soon
        </span>
      )}
    </button>
  );
}

function AreaItem({
  active,
  label,
  icon: Icon,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: LucideIcon;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
        active ? "bg-accent font-medium text-foreground" : "text-foreground/70 hover:bg-accent/60",
      )}
    >
      <Icon className="size-3.5 shrink-0" style={color ? { color } : undefined} />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function AppSidebar({
  section,
  onSelect,
  areas,
  activeArea,
  onSelectArea,
  onOpenAreas,
  onOpenSettings,
  sync,
}: Props) {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-sidebar px-2.5 pb-4 text-sidebar-foreground">
      {/* Top strip doubles as the window drag region; clears the macOS traffic lights.
          Children are pointer-events-none so a click targets the drag region itself. */}
      <div
        data-tauri-drag-region
        className="mb-3 flex select-none items-end gap-2 px-2 pt-8"
      >
        <img
          src="/icon.png"
          alt=""
          className="pointer-events-none size-6 rounded-md"
        />
        <span className="pointer-events-none text-lg font-semibold">
          FocalPlanner
        </span>
      </div>

      <nav className="space-y-1">
        {NAV.map((n) => (
          <NavButton
            key={n.id}
            active={section === n.id}
            label={n.label}
            icon={n.icon}
            soon={n.soon}
            onClick={() => onSelect(n.id)}
          />
        ))}
      </nav>

      <div className="my-3 border-t border-border" />

      {/* Areas of Focus group with selectable sub-items */}
      <div className="flex items-center justify-between px-2.5 py-1">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
          <Target className="size-4" />
          Areas of Focus
        </div>
        <button
          onClick={onOpenAreas}
          title="Manage areas"
          aria-label="Manage areas"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <Settings2 className="size-3.5" />
        </button>
      </div>

      <div className="mt-1 space-y-0.5 pl-2">
        {areas.map((a) => (
          <AreaItem
            key={a.id}
            active={activeArea === a.id}
            label={a.label}
            icon={a.icon}
            color={a.color}
            onClick={() => onSelectArea(a.id)}
          />
        ))}
        {areas.length === 0 && (
          <button
            onClick={onOpenAreas}
            className="px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:underline"
          >
            Set up areas…
          </button>
        )}
        <AreaItem
          active={activeArea === "all"}
          label="All Areas"
          icon={Layers}
          onClick={() => onSelectArea("all")}
        />
      </div>

      <div className="mt-auto flex items-center gap-1 pt-3">
        <div className="min-w-0 flex-1">
          <NavButton
            active={false}
            label="Settings"
            icon={Settings}
            onClick={onOpenSettings}
          />
        </div>
        <SyncIndicator sync={sync} onClick={onOpenSettings} />
      </div>
    </aside>
  );
}
