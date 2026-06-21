import { useRef, useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  CircleCheck,
  Cloud,
  CloudOff,
  GripVertical,
  Layers,
  LayoutDashboard,
  Loader2,
  Settings,
  Settings2,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { Area } from "@/lib/areas";
import { isAreaDue, reviewSinceLabel } from "@/lib/review";
import { cn } from "@/lib/utils";
import { SidebarCalendar } from "@/components/SidebarCalendar";
import { ReviewPanel } from "@/components/ReviewPanel";

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
  onOpenSync: () => void;
  sync: SyncStatus;
  /** Mini-calendar state. */
  anchor: Date;
  weekStartsOn: 0 | 1;
  weekView: boolean;
  onSelectDay: (day: Date) => void;
  /** New area order (area ids) after a drag-to-reorder. */
  onReorderAreas: (ids: string[]) => void;
  /** Review panel (Planner view) state. */
  reviewedAt: Record<string, string>;
  reviewIntervalDays: number;
  onMarkReviewed: (id: string) => void;
  inboxCount: number;
  overdueCount: number;
}

/** Drag-to-reorder list of areas (pointer-based; HTML5 DnD is flaky in WKWebView). */
function SortableAreas({
  areas,
  activeArea,
  onSelectArea,
  onReorder,
  showReview = false,
  reviewedAt = {},
  intervalDays = 7,
  onMarkReviewed,
}: {
  areas: Area[];
  activeArea: string;
  onSelectArea: (id: string) => void;
  onReorder: (ids: string[]) => void;
  /** Planner view: show per-area review status + a "mark reviewed" checkmark. */
  showReview?: boolean;
  reviewedAt?: Record<string, string>;
  intervalDays?: number;
  onMarkReviewed?: (id: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; overIndex: number } | null>(null);

  function indexForY(y: number): number {
    const nodes = listRef.current?.querySelectorAll<HTMLElement>("[data-area-id]");
    if (!nodes) return areas.length;
    let i = 0;
    for (const n of nodes) {
      const r = n.getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
      i++;
    }
    return areas.length;
  }

  function startDrag(e: React.PointerEvent, area: Area) {
    if (e.button !== 0) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let active = false;
    const onMove = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        active = true;
      }
      setDrag({ id: area.id, overIndex: indexForY(ev.clientY) });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!active) {
        onSelectArea(area.id); // no movement → treat as a click
      } else {
        const to = indexForY(ev.clientY);
        const ids = areas.map((a) => a.id);
        const from = ids.indexOf(area.id);
        const target = to > from ? to - 1 : to;
        if (target !== from) {
          ids.splice(from, 1);
          ids.splice(target, 0, area.id);
          onReorder(ids);
        }
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div ref={listRef} className="space-y-0.5">
      {areas.map((a, index) => {
        const dueNow = showReview && isAreaDue(reviewedAt, a.id, intervalDays);
        return (
          <div key={a.id} data-area-id={a.id} className="relative">
            {drag && drag.overIndex === index && (
              <div className="absolute -top-px inset-x-1 z-10 h-0.5 rounded bg-primary" />
            )}
            <div
              onPointerDown={(e) => startDrag(e, a)}
              className={cn(
                "group flex w-full cursor-default select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                activeArea === a.id
                  ? "bg-accent font-medium text-foreground"
                  : "text-foreground/70 hover:bg-accent/60",
                drag?.id === a.id && "opacity-40",
              )}
            >
              <a.icon className="size-3.5 shrink-0" style={{ color: a.color }} />
              <span className="truncate">{a.label}</span>
              {showReview ? (
                <>
                  <span
                    className={cn(
                      "ml-auto shrink-0 text-[10px]",
                      dueNow ? "font-medium text-primary" : "text-muted-foreground/70",
                    )}
                  >
                    {dueNow ? "review" : reviewSinceLabel(reviewedAt, a.id)}
                  </span>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkReviewed?.(a.id);
                    }}
                    title="Mark reviewed"
                    aria-label={`Mark ${a.label} reviewed`}
                    className={cn(
                      "shrink-0 rounded p-0.5 transition-colors",
                      dueNow
                        ? "text-primary hover:bg-primary/10"
                        : "text-muted-foreground/40 hover:text-foreground",
                    )}
                  >
                    <CircleCheck className="size-3.5" />
                  </button>
                </>
              ) : (
                <GripVertical className="ml-auto size-3.5 shrink-0 cursor-grab text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60" />
              )}
            </div>
          </div>
        );
      })}
      {drag && drag.overIndex === areas.length && (
        <div className="mx-1 h-0.5 rounded bg-primary" />
      )}
    </div>
  );
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
  { id: "today", label: "Daily", icon: CalendarDays },
  { id: "weekly", label: "Weekly", icon: CalendarRange },
  { id: "planner", label: "Planner", icon: LayoutDashboard },
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
  onOpenSync,
  sync,
  anchor,
  weekStartsOn,
  weekView,
  onSelectDay,
  onReorderAreas,
  reviewedAt,
  reviewIntervalDays,
  onMarkReviewed,
  inboxCount,
  overdueCount,
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

      <div className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto pl-2">
        <SortableAreas
          areas={areas}
          activeArea={activeArea}
          onSelectArea={onSelectArea}
          onReorder={onReorderAreas}
          showReview={section === "planner"}
          reviewedAt={reviewedAt}
          intervalDays={reviewIntervalDays}
          onMarkReviewed={onMarkReviewed}
        />
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

      {/* Fixed panel between Areas of Focus and Settings: the Review panel in
          the Planner view, otherwise a mini-calendar. */}
      <div className="mt-2 shrink-0 border-t border-border pt-2">
        {section === "planner" ? (
          <ReviewPanel
            areas={areas}
            onSelectArea={onSelectArea}
            reviewedAt={reviewedAt}
            intervalDays={reviewIntervalDays}
            onMarkReviewed={onMarkReviewed}
            inboxCount={inboxCount}
            overdueCount={overdueCount}
          />
        ) : (
          <SidebarCalendar
            anchor={anchor}
            weekStartsOn={weekStartsOn}
            weekView={weekView}
            onSelectDay={onSelectDay}
          />
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 pt-2">
        <div className="min-w-0 flex-1">
          <NavButton
            active={false}
            label="Settings"
            icon={Settings}
            onClick={onOpenSettings}
          />
        </div>
        <SyncIndicator sync={sync} onClick={onOpenSync} />
      </div>
    </aside>
  );
}
