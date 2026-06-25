import { useState } from "react";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  /** Date as "YYYY-MM-DD", or "" for no due date. */
  date: string;
  /** Hour as "HH" (00-23), or "" for date-only. */
  hour: string;
  /** Minute as "MM" (00-59). */
  minute: string;
  onDateChange: (date: string) => void;
  onHourChange: (hour: string) => void;
  onMinuteChange: (minute: string) => void;
  weekStartsOn?: 0 | 1;
  /** All-day mode: show only the calendar (no time selects) and a date-only label. */
  dateOnly?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
// Quarter-hour granularity keeps the picker quick to use.
const MINUTES = ["00", "15", "30", "45"];

/**
 * Friendly due-date control: a button showing the formatted date/time that
 * opens a popover with a calendar (react-day-picker) plus hour/minute selects.
 * Uses selects for time because `<input type="time">` doesn't capture in WKWebView.
 */
export function DateTimePicker({
  date,
  hour,
  minute,
  onDateChange,
  onHourChange,
  onMinuteChange,
  weekStartsOn = 1,
  dateOnly = false,
}: Props) {
  const [open, setOpen] = useState(false);

  // Keep an existing off-quarter minute (e.g. a pre-existing :37) selectable.
  const minuteOptions =
    minute && !MINUTES.includes(minute) ? [...MINUTES, minute].sort() : MINUTES;

  const label = date
    ? hour && !dateOnly
      ? format(parseISO(`${date}T${hour}:${minute || "00"}`), "EEE, MMM d · HH:mm")
      : format(parseISO(date), "EEE, MMM d")
    : "No due date";

  function clear() {
    onDateChange("");
    onHourChange("");
    onMinuteChange("00");
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      trigger={
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start font-normal",
            !date && "text-muted-foreground",
          )}
          onClick={() => setOpen((o) => !o)}
        >
          <CalendarIcon className="size-4" />
          {label}
        </Button>
      }
    >
      <Calendar
        mode="single"
        selected={date ? parseISO(date) : undefined}
        onSelect={(d) => d && onDateChange(format(d, "yyyy-MM-dd"))}
        defaultMonth={date ? parseISO(date) : undefined}
        weekStartsOn={weekStartsOn}
      />
      {!dateOnly && (
        <div className="mt-1 flex items-center gap-2 border-t border-border pt-3">
          <Clock className="size-4 shrink-0 text-muted-foreground" />
          <Select
            value={hour}
            onChange={(e) => onHourChange(e.target.value)}
            className="h-8 w-16 text-sm"
            aria-label="Hour"
            disabled={!date}
          >
            <option value="">--</option>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </Select>
          <span className="text-muted-foreground">:</span>
          <Select
            value={minute}
            onChange={(e) => onMinuteChange(e.target.value)}
            className="h-8 w-16 text-sm"
            aria-label="Minute"
            disabled={!date || !hour}
          >
            {minuteOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          {date && (
            <button
              type="button"
              onClick={clear}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}
