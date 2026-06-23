// Startup tips, shown one at a time in the footer banner. The displayed tip
// rotates sequentially across launches via a local (per-machine) index, so users
// gradually see all of them without immediate repeats.
export const TIPS: string[] = [
  "Work *and* Life on one screen? Hold ⇧ or ⌘ and click areas of focus to mash them together.",
  "Don't want to see that event? Right-click → Hide event. Miss it already? ⌘⇧H brings your secrets back.",
  "Squint no more — hold ⌥ and scroll to stretch or squish the hours of your day.",
  "Crown a favorite calendar and list per area in Settings → Areas of Focus, and new items land there automatically.",
  "Right-click → Clone to Calendar to copy an event around; the twins show up in cheerful zebra stripes.",
  "Grab an event's edge to stretch it, or drag the whole thing somewhere better. It won't complain.",
  "Drag across empty grid space and — poof — a new event appears right where you drew it.",
  "Got a floating reminder? Drag it from the sidebar onto the grid to pin it to a time.",
  "Speed-run your views: ⌘1 Daily, ⌘2 Weekly, ⌘3 Planner.",
  "Channel-surf your areas of focus with ⌘] and ⌘[ — but, you know, productive.",
  "One day hogging the spotlight? Click the ↔ on its header in Weekly view to give it more room.",
  "Two Macs, one you. Connect GitHub in Settings → Sync and your setup tags along.",
  "Feeling secretive? Add a passphrase in Settings → Sync to lock your data with end-to-end encryption.",
  "Peek at what's next without opening the app — flip on the menu-bar agenda in Settings.",
  "Some things never end (in a good way): open an event and add a recurrence rule.",
  "Meeting o'clock? Open the event and smash Join to teleport into the call.",
  "Invited to something? Respond in Calendar pops open Apple Calendar so you can RSVP.",
  "Reminders too noisy? Filter to Today, Scheduled, Unscheduled, or Next 7 Days with ⌘⌥1–4.",
  "Plan like a pro — drop reminders into time sectors over in the Planner view.",
  "Lost? ⌘, opens Settings, your mission control for all things FocalPlanner.",
];

const INDEX_KEY = "fp:tip-index";

/** The next startup tip; advances (and wraps) a local rotation counter. */
export function pickStartupTip(): string {
  let i = 0;
  try {
    i = parseInt(localStorage.getItem(INDEX_KEY) ?? "0", 10) || 0;
  } catch {
    /* ignore */
  }
  const tip = TIPS[((i % TIPS.length) + TIPS.length) % TIPS.length];
  try {
    localStorage.setItem(INDEX_KEY, String((i + 1) % TIPS.length));
  } catch {
    /* ignore */
  }
  return tip;
}
