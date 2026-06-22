import { useState } from "react";
import { Calendar as CalendarIcon, ChevronDown, Repeat } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { RecurrenceFrequency, RecurrenceInput } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const UNIT: Record<RecurrenceFrequency, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
};
const DOW_LABEL = ["S", "M", "T", "W", "T", "F", "S"]; // index = 0 Sun … 6 Sat

interface Props {
  value: RecurrenceInput | null;
  onChange: (value: RecurrenceInput | null) => void;
  weekStartsOn?: 0 | 1;
}

/**
 * Recurrence editor shared by the event and reminder inspectors: frequency +
 * interval + optional weekly weekday selection + an end condition (never / on a
 * date / after N times). A null value means "does not repeat".
 *
 * The whole group is collapsed to a one-line summary when there is no rule, and
 * shown expanded when a rule is set. Day ordering (weekday chips and the
 * end-date calendar) follows the user's week-start preference.
 */
export function RecurrencePicker({ value, onChange, weekStartsOn = 1 }: Props) {
  const [dateOpen, setDateOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const expanded = value != null || manualOpen;

  const patch = (p: Partial<RecurrenceInput>) => value && onChange({ ...value, ...p });

  function setFrequency(freq: string) {
    if (!freq) {
      onChange(null);
      setManualOpen(false); // collapse when turned off
      return;
    }
    const f = freq as RecurrenceFrequency;
    if (!value) {
      onChange({ frequency: f, interval: 1, daysOfWeek: [], endDate: null, count: null });
    } else {
      onChange({ ...value, frequency: f, daysOfWeek: f === "weekly" ? value.daysOfWeek ?? [] : [] });
    }
  }

  const endMode: "never" | "onDate" | "after" = value?.endDate
    ? "onDate"
    : value?.count
      ? "after"
      : "never";

  function setEndMode(mode: string) {
    if (!value) return;
    if (mode === "onDate") onChange({ ...value, endDate: format(new Date(), "yyyy-MM-dd"), count: null });
    else if (mode === "after") onChange({ ...value, endDate: null, count: 10 });
    else onChange({ ...value, endDate: null, count: null });
  }

  const dows = weekStartsOn === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  const selected = new Set(value?.daysOfWeek ?? []);
  function toggleDow(n: number) {
    if (!value) return;
    const next = new Set(value.daysOfWeek ?? []);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    onChange({ ...value, daysOfWeek: [...next].sort((a, b) => a - b) });
  }

  // Collapsed: a single summary row that expands on click.
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setManualOpen(true)}
        className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent"
      >
        <Repeat className="size-4 shrink-0 text-muted-foreground" />
        <span>Repeat</span>
        <span className="ml-auto text-muted-foreground">Never</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-2.5">
      <div className="space-y-1.5">
        <Label htmlFor="rec-freq" className="flex items-center gap-1.5">
          <Repeat className="size-3.5" /> Repeat
        </Label>
        <Select id="rec-freq" value={value?.frequency ?? ""} onChange={(e) => setFrequency(e.target.value)}>
          <option value="">Never</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </Select>
      </div>

      {value && (
        <div className="space-y-2 border-t border-border pt-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Every</span>
            <Input
              type="number"
              min={1}
              value={value.interval}
              onChange={(e) => patch({ interval: Math.max(1, Number(e.target.value) || 1) })}
              className="h-8 w-16"
              aria-label="Interval"
            />
            <span className="text-muted-foreground">
              {UNIT[value.frequency]}
              {value.interval === 1 ? "" : "s"}
            </span>
          </div>

          {value.frequency === "weekly" && (
            <div className="flex gap-1">
              {dows.map((n, i) => (
                <button
                  key={`${n}-${i}`}
                  type="button"
                  onClick={() => toggleDow(n)}
                  aria-pressed={selected.has(n)}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-xs transition-colors",
                    selected.has(n)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent",
                  )}
                >
                  {DOW_LABEL[n]}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 text-sm">
            <span className="w-10 shrink-0 text-muted-foreground">Ends</span>
            <Select value={endMode} onChange={(e) => setEndMode(e.target.value)} className="h-8 flex-1">
              <option value="never">Never</option>
              <option value="onDate">On date</option>
              <option value="after">After…</option>
            </Select>
          </div>

          {endMode === "onDate" && (
            <Popover
              open={dateOpen}
              onOpenChange={setDateOpen}
              align="end"
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start font-normal"
                  onClick={() => setDateOpen((o) => !o)}
                >
                  <CalendarIcon className="size-4" />
                  {value.endDate ? format(parseISO(value.endDate), "EEE, MMM d, yyyy") : "Pick a date"}
                </Button>
              }
            >
              <Calendar
                mode="single"
                selected={value.endDate ? parseISO(value.endDate) : undefined}
                onSelect={(d) => {
                  if (d) {
                    patch({ endDate: format(d, "yyyy-MM-dd"), count: null });
                    setDateOpen(false);
                  }
                }}
                defaultMonth={value.endDate ? parseISO(value.endDate) : undefined}
                weekStartsOn={weekStartsOn}
              />
            </Popover>
          )}

          {endMode === "after" && (
            <div className="flex items-center gap-2 text-sm">
              <Input
                type="number"
                min={1}
                value={value.count ?? 1}
                onChange={(e) => patch({ count: Math.max(1, Number(e.target.value) || 1), endDate: null })}
                className="h-8 w-20"
                aria-label="Occurrences"
              />
              <span className="text-muted-foreground">times</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
