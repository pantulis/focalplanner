import { useEffect, useState } from "react";
import { DayPicker } from "react-day-picker";
import {
  endOfWeek,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";

interface Props {
  /** The currently selected day (daily view) or a day within the selected week. */
  anchor: Date;
  weekStartsOn: 0 | 1;
  /** Highlight the whole week instead of a single day. */
  weekView: boolean;
  onSelectDay: (day: Date) => void;
}

/**
 * Compact month calendar for the sidebar. Indicates the active day (daily view)
 * or the active week (weekly view), and lets the user jump to any day or browse
 * across weeks/months. Pure React (react-day-picker), so WKWebView-safe.
 */
export function SidebarCalendar({ anchor, weekStartsOn, weekView, onSelectDay }: Props) {
  const [month, setMonth] = useState(() => startOfMonth(anchor));

  // Follow the anchor when it jumps to another month (e.g. via toolbar nav).
  useEffect(() => {
    if (!isSameMonth(month, anchor)) setMonth(startOfMonth(anchor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  const modifiers = weekView
    ? {
        weekSel: {
          from: startOfWeek(anchor, { weekStartsOn }),
          to: endOfWeek(anchor, { weekStartsOn }),
        },
      }
    : { daySel: anchor };

  return (
    <div className="fp-mini-wrap">
      <DayPicker
        className="fp-mini-calendar"
        month={month}
        onMonthChange={setMonth}
        navLayout="around"
        weekStartsOn={weekStartsOn}
        showOutsideDays
        onDayClick={(day) => onSelectDay(day)}
        modifiers={modifiers}
        modifiersClassNames={{ weekSel: "fp-mini-week", daySel: "fp-mini-day" }}
      />
      <button
        type="button"
        onClick={() => onSelectDay(new Date())}
        className="mx-auto mt-1 block rounded-md px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Today
      </button>
    </div>
  );
}
