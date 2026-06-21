import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { format, parseISO, startOfDay } from "date-fns";
import {
  AlignLeft,
  ChevronDown,
  ChevronRight,
  Circle,
  Flag,
  Loader2,
  PanelRight,
  Plus,
  Repeat,
  Rows3,
} from "lucide-react";
import type { ReminderDto } from "@/lib/api";
import type { PlannerLayout } from "@/lib/settings";
import {
  SECTORS,
  dueForSector as dueForSectorLib,
  sectorOf as sectorOfLib,
  type Sector,
} from "@/lib/sectors";
import { cn } from "@/lib/utils";
import { LaneCritters } from "@/components/LaneCritters";
import { LaneScenery } from "@/components/LaneScenery";
import { POOF_ANIMATE, POOF_EXIT, POOF_INITIAL, POOF_TRANSITION } from "@/lib/anim";

const UPCOMING: Sector[] = ["nextWeek", "thisMonth", "nextMonth", "longTerm"];

const LAYOUTS: { id: PlannerLayout; label: string; icon: typeof Rows3 }[] = [
  { id: "swimlanes", label: "Lanes", icon: Rows3 },
  { id: "pipeline", label: "Focus", icon: PanelRight },
  { id: "horizon", label: "Horizon", icon: AlignLeft },
];

interface Props {
  reminders: ReminderDto[] | undefined;
  loading: boolean;
  weekStartsOn: 0 | 1;
  layout: PlannerLayout;
  onLayoutChange: (layout: PlannerLayout) => void;
  /** Sector to highlight while a reminder is dragged in from the sidebar. */
  externalSector?: Sector | null;
  /** Animated bird/fish silhouettes drifting across the lanes. */
  animations?: boolean;
  onEdit: (reminder: ReminderDto) => void;
  onComplete: (reminder: ReminderDto, completed: boolean) => void;
  /** Set the due (or clear it with null) — drives which sector the task lands in. */
  onReschedule: (reminder: ReminderDto, dueLocal: string | null) => void;
  onQuickAdd: (dueLocal: string | null) => void;
  onContextMenu: (e: React.MouseEvent, reminder: ReminderDto) => void;
}

export function FocusBoard({
  reminders,
  loading,
  weekStartsOn,
  layout,
  onLayoutChange,
  externalSector,
  animations,
  onEdit,
  onComplete,
  onReschedule,
  onQuickAdd,
  onContextMenu,
}: Props) {
  const now = new Date();
  const todayMs = startOfDay(now).getTime();

  const sectorOf = (r: ReminderDto): Sector => sectorOfLib(r.due, now, weekStartsOn);
  const dueForSector = (sector: Sector, existing: string | null): string | null =>
    dueForSectorLib(sector, existing, now, weekStartsOn);
  const isOverdue = (r: ReminderDto) =>
    !!r.due && startOfDay(parseISO(r.due)).getTime() < todayMs;
  // The date a task dropped into this sector gets scheduled for.
  const sectorDate = (sector: Sector): string => {
    const due = dueForSector(sector, null);
    return due ? format(parseISO(due), "EEE, MMM d") : "No date";
  };

  const bySector = useMemo(() => {
    const groups: Record<Sector, ReminderDto[]> = {
      inbox: [],
      thisWeek: [],
      nextWeek: [],
      thisMonth: [],
      nextMonth: [],
      longTerm: [],
    };
    for (const r of (reminders ?? []).filter((x) => !x.completed)) groups[sectorOf(r)].push(r);
    const dueMs = (r: ReminderDto) => (r.due ? parseISO(r.due).getTime() || Infinity : Infinity);
    for (const s of Object.keys(groups) as Sector[]) {
      groups[s].sort((a, c) => {
        if (s === "thisWeek") {
          const ao = isOverdue(a) ? 0 : 1;
          const co = isOverdue(c) ? 0 : 1;
          if (ao !== co) return ao - co;
        }
        const d = dueMs(a) - dueMs(c);
        return d !== 0 ? d : a.title.localeCompare(c.title);
      });
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminders, todayMs]);

  // ── Pointer drag between sectors (shared by all layouts) ─────────────────
  const [drag, setDrag] = useState<{ reminder: ReminderDto; x: number; y: number; over: Sector | null } | null>(null);

  function sectorAt(x: number, y: number): Sector | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-sector]");
    return (el?.dataset.sector as Sector | undefined) ?? null;
  }

  function startDrag(e: React.PointerEvent, reminder: ReminderDto) {
    if (e.button !== 0 || !reminder.id) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let active = false;
    const onMove = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        active = true;
      }
      setDrag({ reminder, x: ev.clientX, y: ev.clientY, over: sectorAt(ev.clientX, ev.clientY) });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!active) {
        onEdit(reminder);
      } else {
        const target = sectorAt(ev.clientX, ev.clientY);
        if (target && target !== sectorOf(reminder)) {
          onReschedule(reminder, dueForSector(target, reminder.due));
        }
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const dimOf = (r: ReminderDto) =>
    drag?.reminder.id === r.id ? { opacity: 0.4 } : POOF_ANIMATE;
  const targeting = (s: Sector) =>
    (drag?.over === s && sectorOf(drag.reminder) !== s) || externalSector === s;

  // ── Shared item renderers ────────────────────────────────────────────────
  function completeButton(r: ReminderDto) {
    return (
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (r.id) onComplete(r, true);
        }}
        className="shrink-0"
        aria-label="Mark complete"
      >
        <Circle
          className="size-3.5"
          style={{ color: r.color ?? "var(--muted-foreground)" }}
          strokeWidth={2.5}
        />
      </button>
    );
  }

  function Chip({ r }: { r: ReminderDto }) {
    return (
      <motion.div
        key={r.id ?? r.title}
        layout
        initial={POOF_INITIAL}
        animate={dimOf(r)}
        exit={POOF_EXIT}
        transition={POOF_TRANSITION}
        onPointerDown={(e) => startDrag(e, r)}
        onContextMenu={(e) => onContextMenu(e, r)}
        title={r.title}
        className="flex max-w-[16rem] cursor-grab items-center gap-1.5 rounded-full border border-border bg-background py-1 pl-1.5 pr-2.5 text-xs shadow-sm transition-colors hover:bg-accent active:cursor-grabbing"
      >
        {completeButton(r)}
        {isOverdue(r) && <Flag className="size-3 shrink-0 text-destructive" />}
        <span className="truncate">{r.title}</span>
        {r.recurring && <Repeat className="size-3 shrink-0 opacity-70" />}
      </motion.div>
    );
  }

  function Row({ r }: { r: ReminderDto }) {
    return (
      <motion.div
        key={r.id ?? r.title}
        layout
        initial={POOF_INITIAL}
        animate={dimOf(r)}
        exit={POOF_EXIT}
        transition={POOF_TRANSITION}
        onPointerDown={(e) => startDrag(e, r)}
        onContextMenu={(e) => onContextMenu(e, r)}
        title={r.title}
        className="flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent active:cursor-grabbing"
      >
        {completeButton(r)}
        <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
        {isOverdue(r) && <Flag className="size-3 shrink-0 text-destructive" />}
        {r.recurring && <Repeat className="size-3 shrink-0 opacity-70" />}
        {r.listTitle && (
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: r.color ?? "var(--muted-foreground)" }}
            title={r.listTitle}
          />
        )}
      </motion.div>
    );
  }

  function AddButton({ sector, full }: { sector: Sector; full?: boolean }) {
    return (
      <button
        onClick={() => onQuickAdd(dueForSector(sector, null))}
        title="Add a task here"
        className={cn(
          "flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          full && "w-full justify-center",
        )}
      >
        <Plus className="size-3.5" /> {full && "Add"}
      </button>
    );
  }

  // ── Layout: swimlanes ────────────────────────────────────────────────────
  function Swimlanes() {
    return (
      <div className="flex h-full select-none flex-col overflow-y-auto">
        {/* Rendered far→near (Long Term at the top): the distant future is the
            sky/horizon up high with soaring birds; the present is the water at
            the bottom with fish. `ti` is the canonical time index (0 = Inbox). */}
        {SECTORS.map((s, ti) => ({ s, ti }))
          .reverse()
          .map(({ s, ti }) => {
            const items = bySector[s.id];
            const critter = ti <= 1 ? "fish" : ti >= SECTORS.length - 2 ? "bird" : null;
            return (
            <div
              key={s.id}
              data-sector={s.id}
              // Light at the top (sky/horizon) deepening to dark at the bottom
              // (the depths) — i.e. faintest at Long Term, strongest at Inbox.
              style={{ backgroundColor: `color-mix(in srgb, var(--primary) ${5 + (SECTORS.length - 1 - ti) * 4}%, transparent)` }}
              className={cn(
                "relative flex min-h-[4rem] flex-1 items-start gap-3 overflow-hidden border-b border-border px-3 py-4 transition-colors",
                targeting(s.id) && "ring-2 ring-inset ring-primary/60",
              )}
            >
              {animations && critter && (
                <>
                  <LaneScenery kind={critter === "fish" ? "bubble" : "cloud"} />
                  <LaneCritters kind={critter} />
                </>
              )}
              <div className="relative z-10 w-28 shrink-0 pt-1">
                <div className="text-xs font-semibold">{s.label}</div>
                <div className="text-[10px] text-muted-foreground">
                  {items.length} {items.length === 1 ? "task" : "tasks"}
                </div>
                <div className="mt-1 text-[10px] font-medium tabular-nums text-muted-foreground/90">
                  {sectorDate(s.id)}
                </div>
              </div>
              <div className="relative z-10 flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {loading && s.id === "inbox" && (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                )}
                <AnimatePresence initial={false}>
                  {items.map((r) => (
                    <Chip key={r.id ?? r.title} r={r} />
                  ))}
                </AnimatePresence>
                {!loading && items.length === 0 && (
                  <span className="text-xs text-muted-foreground/60">No tasks</span>
                )}
                <AddButton sector={s.id} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Layout: vertical horizon (time flows down a spine) ───────────────────
  function Horizon() {
    return (
      <div className="h-full select-none overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-3">
          {SECTORS.map((s) => {
            const items = bySector[s.id];
            const isNow = s.id === "thisWeek";
            return (
              <div
                key={s.id}
                data-sector={s.id}
                className={cn(
                  "relative border-l-2 pl-5 pb-3 transition-colors",
                  isNow ? "border-primary" : "border-border",
                  targeting(s.id) && "bg-primary/5",
                )}
              >
                <span
                  className={cn(
                    "absolute -left-[5px] top-1.5 size-2 rounded-full",
                    isNow ? "bg-primary" : "bg-border",
                  )}
                />
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide">{s.label}</span>
                  {isNow && (
                    <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary">
                      now
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">{items.length}</span>
                </div>
                <AnimatePresence initial={false}>
                  {items.map((r) => (
                    <Row key={r.id ?? r.title} r={r} />
                  ))}
                </AnimatePresence>
                <div className="mt-1 pl-2">
                  <AddButton sector={s.id} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Layout: focus + pipeline ─────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Set<Sector>>(new Set());
  function Pipeline() {
    const inbox = bySector.inbox;
    const week = bySector.thisWeek;
    return (
      <div className="flex h-full select-none flex-col gap-3 p-3">
        {/* Inbox capture strip */}
        <div
          data-sector="inbox"
          className={cn(
            "flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/20 px-3 py-2 transition-colors",
            targeting("inbox") && "ring-1 ring-inset ring-primary/50",
          )}
        >
          <span className="mr-1 text-xs font-semibold text-muted-foreground">
            Inbox <span className="font-normal">({inbox.length})</span>
          </span>
          <AnimatePresence initial={false}>
            {inbox.map((r) => (
              <Chip key={r.id ?? r.title} r={r} />
            ))}
          </AnimatePresence>
          <AddButton sector="inbox" />
        </div>

        <div className="flex min-h-0 flex-1 gap-3">
          {/* This Week — the hero */}
          <div
            data-sector="thisWeek"
            className={cn(
              "flex min-w-0 flex-[2] flex-col rounded-lg border border-border transition-colors",
              targeting("thisWeek") && "ring-2 ring-inset ring-primary/60",
            )}
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-sm font-semibold">This Week — your focus</span>
              <span className="text-xs text-muted-foreground">{week.length}</span>
            </div>
            <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
              {loading && (
                <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </div>
              )}
              <AnimatePresence initial={false}>
                {week.map((r) => (
                  <Row key={r.id ?? r.title} r={r} />
                ))}
              </AnimatePresence>
              {!loading && week.length === 0 && (
                <p className="px-1 py-2 text-xs text-muted-foreground/70">
                  Nothing scheduled for this week.
                </p>
              )}
            </div>
            <div className="p-2 pt-0">
              <AddButton sector="thisWeek" full />
            </div>
          </div>

          {/* Upcoming pipeline */}
          <div className="flex w-72 shrink-0 flex-col gap-2 overflow-y-auto">
            <div className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Upcoming
            </div>
            {UPCOMING.map((sector) => {
              const items = bySector[sector];
              const label = SECTORS.find((s) => s.id === sector)!.label;
              const open = expanded.has(sector);
              return (
                <div
                  key={sector}
                  data-sector={sector}
                  className={cn(
                    "rounded-lg border border-border bg-muted/20 transition-colors",
                    targeting(sector) && "ring-2 ring-inset ring-primary/60",
                  )}
                >
                  <button
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        next.has(sector) ? next.delete(sector) : next.add(sector);
                        return next;
                      })
                    }
                    className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left text-sm"
                  >
                    {open ? (
                      <ChevronDown className="size-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-3.5 text-muted-foreground" />
                    )}
                    <span className="flex-1 font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground">{items.length}</span>
                  </button>
                  {open && (
                    <div className="space-y-0.5 px-1.5 pb-1.5">
                      <AnimatePresence initial={false}>
                        {items.map((r) => (
                          <Row key={r.id ?? r.title} r={r} />
                        ))}
                      </AnimatePresence>
                      {items.length === 0 && (
                        <p className="px-1 py-1 text-xs text-muted-foreground/70">Empty.</p>
                      )}
                      <div className="pt-0.5">
                        <AddButton sector={sector} full />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-end border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          {LAYOUTS.map((l) => {
            const Icon = l.icon;
            return (
              <button
                key={l.id}
                onClick={() => onLayoutChange(l.id)}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors",
                  layout === l.id
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" /> {l.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {layout === "swimlanes" && <Swimlanes />}
        {layout === "pipeline" && <Pipeline />}
        {layout === "horizon" && <Horizon />}
      </div>

      {drag && (
        <div
          className="pointer-events-none fixed z-[100] max-w-[14rem] truncate rounded-full border border-border bg-background px-2.5 py-1 text-xs shadow-lg"
          style={{ left: drag.x + 12, top: drag.y + 12 }}
        >
          {drag.reminder.title}
        </div>
      )}
    </div>
  );
}
