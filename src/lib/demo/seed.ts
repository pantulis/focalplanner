/**
 * ────────────────────────────────────────────────────────────────────────────
 *  DEMO MODE SEED DATA  —  safe to edit by hand
 * ────────────────────────────────────────────────────────────────────────────
 *
 * This file is the single source of truth for the sample calendars, reminder
 * lists, events and reminders used by Demo Mode (a dev-only feature for taking
 * screenshots without exposing real data).
 *
 * Everything is dated *relative to the moment Demo Mode is switched on*:
 *   - `dayOffset` / `dueOffset`  = number of days from "today" (0 = today,
 *     1 = tomorrow, -1 = yesterday, 45 = in ~6 weeks, …)
 *   - times are local wall-clock "HH:MM" strings.
 *
 * Edit freely: add/remove calendars, lists, events and reminders, change
 * titles, offsets, priorities, etc. Keep `calendarId` / `listId` pointing at an
 * `id` that exists in `calendars` / `lists`, and keep `area` values among the
 * app's area ids: personal, work, health, finance, family, learning, social.
 */

export type AreaId =
  | "personal"
  | "work"
  | "health"
  | "finance"
  | "family"
  | "learning"
  | "social";

export interface SeedCalendar {
  id: string;
  title: string;
  /** Any CSS color. */
  color: string;
  /** Read-only calendars (editable: false) showcase non-editable handling. */
  editable: boolean;
  account: string;
  /** Area of Focus this calendar belongs to. */
  area: AreaId;
}

export interface SeedList {
  id: string;
  title: string;
  color: string;
  editable: boolean;
  account: string;
  area: AreaId;
}

export interface SeedEvent {
  calendarId: string;
  title: string;
  /** Day relative to "today" (0 = today). */
  dayOffset: number;
  /** "HH:MM" start; omit for all-day. */
  start?: string;
  /** "HH:MM" end; omit for all-day. */
  end?: string;
  allDay?: boolean;
  /** For multi-day all-day events: last day (inclusive), relative to today. */
  endDayOffset?: number;
  /** Whether the event repeats (shows a recurring icon). */
  recurring?: boolean;
  /** An invitation the current user hasn't responded to (shown greyed out). */
  needsResponse?: boolean;
  /** Attendees with their RSVP status (shown in the inspector). */
  participants?: SeedParticipant[];
  location?: string;
  url?: string;
  notes?: string;
}

export interface SeedParticipant {
  name: string;
  status: "accepted" | "declined" | "tentative" | "pending";
  isOrganizer?: boolean;
  isCurrentUser?: boolean;
}

export interface SeedReminder {
  listId: string;
  title: string;
  /** Day relative to today; null/undefined = no due date (Inbox). */
  dueOffset?: number | null;
  /** Optional "HH:MM" time-of-day for the due date. */
  dueTime?: string;
  /** EventKit buckets: 0 none, 1 high, 5 medium, 9 low. */
  priority?: number;
  recurring?: boolean;
  completed?: boolean;
  notes?: string;
}

export interface DemoSeed {
  calendars: SeedCalendar[];
  lists: SeedList[];
  events: SeedEvent[];
  reminders: SeedReminder[];
  /**
   * Seeds the Review panel: how many days ago each area was last reviewed.
   * Omit an area (or set null) to leave it "never reviewed" → due now.
   */
  reviewedDaysAgo: Partial<Record<AreaId, number>>;
}

// Palette aligned with the app's Area-of-Focus colors.
const C = {
  personal: "#8b5cf6",
  work: "#3b82f6",
  health: "#10b981",
  finance: "#f59e0b",
  family: "#ef4444",
  learning: "#06b6d4",
  social: "#ec4899",
  holiday: "#94a3b8",
};

export const DEMO_SEED: DemoSeed = {
  calendars: [
    { id: "cal-work", title: "Work", color: C.work, editable: true, account: "Work", area: "work" },
    { id: "cal-personal", title: "Personal", color: C.personal, editable: true, account: "iCloud", area: "personal" },
    { id: "cal-fitness", title: "Fitness", color: C.health, editable: true, account: "iCloud", area: "health" },
    { id: "cal-finance", title: "Finance", color: C.finance, editable: true, account: "iCloud", area: "finance" },
    { id: "cal-family", title: "Family", color: C.family, editable: true, account: "iCloud", area: "family" },
    { id: "cal-learning", title: "Learning", color: C.learning, editable: true, account: "iCloud", area: "learning" },
    { id: "cal-social", title: "Social", color: C.social, editable: true, account: "iCloud", area: "social" },
    { id: "cal-holidays", title: "US Holidays", color: C.holiday, editable: false, account: "Other", area: "personal" },
  ],

  lists: [
    { id: "list-personal", title: "Personal", color: C.personal, editable: true, account: "iCloud", area: "personal" },
    { id: "list-work", title: "Work", color: C.work, editable: true, account: "Work", area: "work" },
    { id: "list-health", title: "Health & Fitness", color: C.health, editable: true, account: "iCloud", area: "health" },
    { id: "list-finance", title: "Finance", color: C.finance, editable: true, account: "iCloud", area: "finance" },
    { id: "list-family", title: "Family", color: C.family, editable: true, account: "iCloud", area: "family" },
    { id: "list-learning", title: "Learning", color: C.learning, editable: true, account: "iCloud", area: "learning" },
    { id: "list-social", title: "Social", color: C.social, editable: true, account: "iCloud", area: "social" },
  ],

  events: [
    // ── Work ──────────────────────────────────────────────────────────────
    { calendarId: "cal-work", title: "Team standup", dayOffset: 0, start: "09:30", end: "09:45", recurring: true, location: "Zoom", notes: "Daily sync" },
    { calendarId: "cal-work", title: "Team standup", dayOffset: 1, start: "09:30", end: "09:45", recurring: true, location: "Zoom" },
    { calendarId: "cal-work", title: "Team standup", dayOffset: 2, start: "09:30", end: "09:45", recurring: true, location: "Zoom" },
    { calendarId: "cal-work", title: "1:1 with Manager", dayOffset: 0, start: "14:00", end: "14:30", location: "Conf Room B" },
    {
      calendarId: "cal-work",
      title: "Budget planning sync",
      dayOffset: 0,
      start: "15:30",
      end: "16:00",
      needsResponse: true,
      url: "https://meet.google.com/abc-defg-hij",
      notes: "Join with Google Meet: https://meet.google.com/abc-defg-hij",
      participants: [
        { name: "Sandra Munuera", status: "accepted", isOrganizer: true },
        { name: "You", status: "pending", isCurrentUser: true },
        { name: "Pedro Sanz", status: "accepted" },
        { name: "Lorena Velasco", status: "tentative" },
        { name: "Victor Cacicedo", status: "declined" },
        { name: "Ana Isabel Martin", status: "pending" },
      ],
    },
    { calendarId: "cal-work", title: "Interview: Senior Engineer", dayOffset: 0, start: "16:00", end: "16:45", notes: "Review resume beforehand" },
    { calendarId: "cal-work", title: "Product roadmap review", dayOffset: 1, start: "11:00", end: "12:00", location: "Conf Room A" },
    { calendarId: "cal-work", title: "Sprint planning", dayOffset: 2, start: "10:00", end: "11:30", location: "Zoom" },
    { calendarId: "cal-work", title: "Design critique", dayOffset: 3, start: "15:00", end: "16:00" },
    // A "clone": the same event copied into two calendars (shown zebra-striped in All Areas).
    { calendarId: "cal-work", title: "Leadership review", dayOffset: 1, start: "11:00", end: "12:00", location: "Conf Room A" },
    { calendarId: "cal-personal", title: "Leadership review", dayOffset: 1, start: "11:00", end: "12:00", location: "Conf Room A" },
    {
      calendarId: "cal-work",
      title: "Quarterly business review",
      dayOffset: 4,
      start: "13:00",
      end: "15:00",
      needsResponse: true,
      notes: "Bring the Q3 deck.\nMicrosoft Teams meeting: https://teams.microsoft.com/l/meetup-join/19%3ameeting_demo%40thread.v2/0",
      participants: [
        { name: "Fernando Oramas", status: "accepted", isOrganizer: true },
        { name: "You", status: "pending", isCurrentUser: true },
        { name: "Javier Oyarzun", status: "accepted" },
        { name: "Isabel Freyre", status: "declined" },
        { name: "Natalia Gasulla", status: "tentative" },
      ],
    },
    { calendarId: "cal-work", title: "Company offsite", dayOffset: 8, endDayOffset: 9, allDay: true, location: "Mountain Lodge" },

    // ── Personal ─────────────────────────────────────────────────────────
    { calendarId: "cal-personal", title: "Call plumber", dayOffset: 0, start: "12:30", end: "12:45" },
    { calendarId: "cal-personal", title: "Dentist appointment", dayOffset: 2, start: "08:30", end: "09:15", location: "Downtown Dental" },
    { calendarId: "cal-personal", title: "Haircut", dayOffset: 5, start: "18:00", end: "18:45", location: "Sharp Cuts" },
    { calendarId: "cal-personal", title: "Apartment inspection", dayOffset: 7, start: "10:00", end: "10:30" },

    // ── Fitness ──────────────────────────────────────────────────────────
    { calendarId: "cal-fitness", title: "Morning run", dayOffset: 0, start: "07:00", end: "07:30", recurring: true, location: "Riverside Trail" },
    { calendarId: "cal-fitness", title: "Morning run", dayOffset: 2, start: "07:00", end: "07:30", recurring: true, location: "Riverside Trail" },
    { calendarId: "cal-fitness", title: "Yoga class", dayOffset: 1, start: "18:30", end: "19:30", recurring: true, location: "Flow Studio" },
    { calendarId: "cal-fitness", title: "Personal training", dayOffset: 4, start: "07:00", end: "08:00", location: "Gold's Gym" },
    { calendarId: "cal-fitness", title: "Annual physical", dayOffset: 10, start: "09:00", end: "09:45", location: "City Medical" },

    // ── Finance ──────────────────────────────────────────────────────────
    { calendarId: "cal-finance", title: "Meeting with financial advisor", dayOffset: 9, start: "11:00", end: "11:45", url: "https://meet.example.com/advisor" },
    { calendarId: "cal-finance", title: "Tax prep session", dayOffset: 15, start: "16:00", end: "17:00", notes: "Gather receipts and W-2s" },

    // ── Family ───────────────────────────────────────────────────────────
    { calendarId: "cal-family", title: "Family dinner", dayOffset: 0, start: "19:30", end: "21:00", location: "Home" },
    { calendarId: "cal-family", title: "Parent-teacher conference", dayOffset: 3, start: "17:30", end: "18:00", location: "Lincoln Elementary" },
    { calendarId: "cal-family", title: "Emma's soccer game", dayOffset: 6, start: "10:00", end: "11:30", location: "Riverside Park" },
    { calendarId: "cal-family", title: "Mom's birthday", dayOffset: 12, allDay: true },
    { calendarId: "cal-family", title: "Weekend trip", dayOffset: 13, endDayOffset: 14, allDay: true, location: "Lake Tahoe" },

    // ── Learning ─────────────────────────────────────────────────────────
    { calendarId: "cal-learning", title: "Spanish lesson", dayOffset: 1, start: "20:00", end: "20:45", recurring: true, url: "https://meet.example.com/spanish" },
    { calendarId: "cal-learning", title: "Online course: System Design", dayOffset: 2, start: "21:00", end: "22:00" },
    { calendarId: "cal-learning", title: "Book club", dayOffset: 7, start: "19:00", end: "20:30", location: "Central Library" },

    // ── Social ───────────────────────────────────────────────────────────
    { calendarId: "cal-social", title: "Coffee with Alex", dayOffset: 0, start: "10:30", end: "11:00", location: "Blue Bottle" },
    { calendarId: "cal-social", title: "Dinner with friends", dayOffset: 5, start: "20:00", end: "22:00", location: "Trattoria Roma" },
    { calendarId: "cal-social", title: "Concert: Indie Night", dayOffset: 11, start: "20:00", end: "23:00", url: "https://tickets.example.com/indie" },

    // ── Holidays (read-only) ─────────────────────────────────────────────
    { calendarId: "cal-holidays", title: "Public Holiday", dayOffset: 17, allDay: true },
  ],

  reminders: [
    // ── Work ──────────────────────────────────────────────────────────────
    { listId: "list-work", title: "Finish Q3 OKRs draft", dueOffset: 0, dueTime: "17:00", priority: 1, notes: "Share with leadership" },
    { listId: "list-work", title: "Reply to vendor proposal", dueOffset: 0 },
    { listId: "list-work", title: "Prepare standup notes", dueOffset: 0, dueTime: "09:00", priority: 9, recurring: true },
    { listId: "list-work", title: "Review PR #482", dueOffset: 1, priority: 5 },
    { listId: "list-work", title: "Send weekly sprint report", dueOffset: 4, recurring: true },
    { listId: "list-work", title: "Plan team offsite agenda", dueOffset: 8, priority: 1 },
    { listId: "list-work", title: "Draft hiring plan", dueOffset: 10, priority: 5 },
    { listId: "list-work", title: "Update product roadmap", dueOffset: 20 },
    { listId: "list-work", title: "Performance reviews", dueOffset: 45, priority: 1 },
    { listId: "list-work", title: "Renew software licenses", dueOffset: 70 },
    { listId: "list-work", title: "Research competitor X", dueOffset: null },
    { listId: "list-work", title: "Archive old Jira tickets", completed: true },

    // ── Personal ─────────────────────────────────────────────────────────
    { listId: "list-personal", title: "Take out recycling", dueOffset: 0, dueTime: "20:00", priority: 9, recurring: true },
    { listId: "list-personal", title: "Back up laptop", dueOffset: 3, recurring: true },
    { listId: "list-personal", title: "Buy birthday gift for Mom", dueOffset: 10, priority: 5 },
    { listId: "list-personal", title: "Schedule car service", dueOffset: 12 },
    { listId: "list-personal", title: "Renew passport", dueOffset: 25, priority: 1, notes: "Expires in 3 months" },
    { listId: "list-personal", title: "Fix leaky faucet", dueOffset: null },
    { listId: "list-personal", title: "Cancel unused subscription", completed: true },

    // ── Health & Fitness ─────────────────────────────────────────────────
    { listId: "list-health", title: "Drink 2L water", dueOffset: 0, priority: 9, recurring: true },
    { listId: "list-health", title: "Meal prep for the week", dueOffset: 2, recurring: true },
    { listId: "list-health", title: "Buy running shoes", dueOffset: 9, priority: 5 },
    { listId: "list-health", title: "Weekly weigh-in", dueOffset: 6, priority: 9, recurring: true },
    { listId: "list-health", title: "Try new healthy recipe", dueOffset: null },
    { listId: "list-health", title: "Book annual physical", completed: true },

    // ── Finance ──────────────────────────────────────────────────────────
    { listId: "list-finance", title: "Review monthly budget", dueOffset: 1 },
    { listId: "list-finance", title: "File expense report", dueOffset: 3, priority: 5 },
    { listId: "list-finance", title: "Pay credit card bill", dueOffset: 5, priority: 1, recurring: true },
    { listId: "list-finance", title: "Cancel duplicate insurance", dueOffset: 18 },
    { listId: "list-finance", title: "Rebalance investment portfolio", dueOffset: 30, priority: 5 },
    { listId: "list-finance", title: "Set up 529 college fund", dueOffset: null },

    // ── Family ───────────────────────────────────────────────────────────
    { listId: "list-family", title: "Sign Emma's permission slip", dueOffset: 0, priority: 1 },
    { listId: "list-family", title: "Grocery shopping", dueOffset: 1, recurring: true, notes: "Milk, eggs, bread, spinach, chicken" },
    { listId: "list-family", title: "Call grandparents", dueOffset: 2, priority: 9, recurring: true },
    { listId: "list-family", title: "Plan weekend trip", dueOffset: 9, priority: 5 },
    { listId: "list-family", title: "Buy school supplies", dueOffset: 22 },
    { listId: "list-family", title: "Schedule kids' dentist", dueOffset: null },

    // ── Learning ─────────────────────────────────────────────────────────
    { listId: "list-learning", title: "Practice Spanish (Duolingo)", dueOffset: 0, priority: 9, recurring: true },
    { listId: "list-learning", title: "Finish 'System Design' chapter 4", dueOffset: 2, priority: 5 },
    { listId: "list-learning", title: "Read 30 pages of book-club book", dueOffset: 6 },
    { listId: "list-learning", title: "Complete online course module", dueOffset: 11, priority: 5 },
    { listId: "list-learning", title: "Watch conference talk", dueOffset: null },
    { listId: "list-learning", title: "Learn keyboard shortcuts", completed: true },

    // ── Social ───────────────────────────────────────────────────────────
    { listId: "list-social", title: "Reply to Alex about weekend", dueOffset: 0 },
    { listId: "list-social", title: "Send thank-you note", dueOffset: 2, priority: 9 },
    { listId: "list-social", title: "Buy concert tickets", dueOffset: 4, priority: 5 },
    { listId: "list-social", title: "Plan dinner party", dueOffset: 14 },
    { listId: "list-social", title: "RSVP to wedding", dueOffset: 28, priority: 1 },
    { listId: "list-social", title: "Catch up with old colleague", dueOffset: null },
  ],

  reviewedDaysAgo: {
    work: 1,
    family: 2,
    personal: 3,
    health: 9, // > interval → shows as due
    social: 8, // > interval → shows as due
    // finance & learning omitted → never reviewed → due
  },
};

/** Demo defaults for the full-sandbox settings (editable while in demo). */
export const DEMO_SETTINGS = {
  theme: "light",
  font: "system",
  scale: 1,
  weekStartsOn: 1 as 0 | 1,
  workdayStart: 9,
  workdayEnd: 18,
  weekendStart: 10,
  weekendEnd: 16,
  showCompletedReminders: false,
  inspectorContextHours: 2,
  menubarEnabled: true,
  plannerLayout: "swimlanes" as const,
  plannerAnimations: true,
  reviewIntervalDays: 7,
  areaOrder: ["work", "personal", "health", "finance", "family", "learning", "social"],
};
