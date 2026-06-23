import { useCallback, useState } from "react";

// Locally-hidden calendar events. View-only: never written to EventKit and never
// part of the synced preferences (Settings/areaConfig). Persisted in localStorage
// so it survives relaunches, following the app's `fp:` local-only convention.
const HIDDEN_KEY = "fp:hidden-events";
const SHOW_KEY = "fp:show-hidden-events";

function loadHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persistHidden(ids: Set<string>) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

/**
 * Hidden calendar events + the "show hidden" reveal toggle, both persisted
 * locally across sessions. Events are hidden by their (series-level) id, so
 * hiding a recurring event hides the whole series.
 */
export function useHiddenEvents() {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(loadHidden);
  const [showHidden, setShowHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SHOW_KEY) === "1";
    } catch {
      return false;
    }
  });

  const hide = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      persistHidden(next);
      return next;
    });
  }, []);

  const unhide = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      persistHidden(next);
      return next;
    });
  }, []);

  const toggleShowHidden = useCallback(() => {
    setShowHidden((prev) => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(SHOW_KEY, "1");
        else localStorage.removeItem(SHOW_KEY);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const isHidden = useCallback(
    (id: string | null | undefined) => !!id && hiddenIds.has(id),
    [hiddenIds],
  );

  return { hiddenIds, isHidden, hide, unhide, showHidden, toggleShowHidden };
}
