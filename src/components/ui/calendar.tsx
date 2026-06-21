import "react-day-picker/style.css";
import { DayPicker, type DayPickerProps } from "react-day-picker";
import { cn } from "@/lib/utils";

/**
 * Thin wrapper over react-day-picker. It's pure React (no native date input),
 * so it works in WKWebView where `<input type="date|time">` misbehave.
 * Theming lives in `.fp-calendar` in index.css, mapping rdp's CSS variables
 * onto the app's design tokens.
 */
export function Calendar({ className, showOutsideDays = true, ...props }: DayPickerProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("fp-calendar", className)}
      {...props}
    />
  );
}
