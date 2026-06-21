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
}

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, m) => String(m).padStart(2, "0"));

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
}: Props) {
  const [open, setOpen] = useState(false);

  const label = date
    ? hour
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
          {MINUTES.map((m) => (
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
    </Popover>
  );
}
