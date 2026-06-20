import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  api,
  type EventInput,
  type ReminderInput,
} from "./api";

export function useAccessStatus() {
  return useQuery({ queryKey: ["access"], queryFn: api.getAccessStatus });
}

export function useCalendars(enabled: boolean) {
  return useQuery({
    queryKey: ["calendars"],
    queryFn: api.listCalendars,
    enabled,
  });
}

export function useEvents(
  start: string,
  end: string,
  calendarIds: string[] | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["events", start, end, calendarIds],
    queryFn: () => api.fetchEvents(start, end, calendarIds),
    enabled,
  });
}

export function useReminders(
  listIds: string[] | undefined,
  includeCompleted: boolean,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["reminders", listIds, includeCompleted],
    queryFn: () => api.fetchReminders(listIds, includeCompleted),
    enabled,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────

function useInvalidate(keys: string[]) {
  const qc = useQueryClient();
  return () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function useEventMutations() {
  const invalidate = useInvalidate(["events"]);
  const create = useMutation({
    mutationFn: (input: EventInput) => api.createEvent(input),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: (input: EventInput) => api.updateEvent(input),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteEvent(id),
    onSuccess: invalidate,
  });
  return { create, update, remove };
}

export function useReminderMutations() {
  const invalidate = useInvalidate(["reminders"]);
  const create = useMutation({
    mutationFn: (input: ReminderInput) => api.createReminder(input),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: (input: ReminderInput) => api.updateReminder(input),
    onSuccess: invalidate,
  });
  const toggle = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      api.setReminderCompleted(id, completed),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteReminder(id),
    onSuccess: invalidate,
  });
  return { create, update, toggle, remove };
}
