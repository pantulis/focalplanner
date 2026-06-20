import { useEffect, useState } from "react";
import { load, type Store } from "@tauri-apps/plugin-store";

export interface Settings {
  showCompletedReminders: boolean;
  /** 0 = Sunday, 1 = Monday */
  weekStartsOn: 0 | 1;
  workdayStart: number;
  workdayEnd: number;
  weekendStart: number;
  weekendEnd: number;
  /** Calendars / reminder lists hidden everywhere in the UI. */
  ignoredCalendarIds: string[];
  ignoredListIds: string[];
  theme: string;
  font: string;
  scale: number;
  /** GitHub sync bookkeeping (not secret; the token lives in the Keychain). */
  syncGistId?: string;
  syncUpdatedAt?: string;
  autoSync: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  showCompletedReminders: false,
  weekStartsOn: 0,
  workdayStart: 9,
  workdayEnd: 18,
  weekendStart: 10,
  weekendEnd: 22,
  ignoredCalendarIds: [],
  ignoredListIds: [],
  theme: "light",
  font: "system",
  scale: 1,
  autoSync: true,
};

export interface ThemeOption {
  id: string;
  label: string;
  dark: boolean;
  /** [background, primary, accent] preview swatch. */
  swatch: [string, string, string];
}

export const THEMES: ThemeOption[] = [
  { id: "light", label: "Light", dark: false, swatch: ["#ffffff", "#343434", "#f2f2f2"] },
  { id: "dark", label: "Dark", dark: true, swatch: ["#252525", "#ededed", "#444444"] },
  { id: "nord", label: "Nord", dark: true, swatch: ["#2e3440", "#88c0d0", "#4c566a"] },
  { id: "catppuccin", label: "Catppuccin", dark: true, swatch: ["#1e1e2e", "#cba6f7", "#585b70"] },
  { id: "rose-pine", label: "Rosé Pine", dark: true, swatch: ["#191724", "#c4a7e7", "#403d52"] },
  { id: "solarized", label: "Solarized", dark: false, swatch: ["#fdf6e3", "#268bd2", "#eee8d5"] },
];

export interface FontOption {
  id: string;
  label: string;
  stack: string;
}

export const FONTS: FontOption[] = [
  {
    id: "system",
    label: "System",
    stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  },
  {
    id: "rounded",
    label: "Rounded",
    stack: 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", system-ui, sans-serif',
  },
  {
    id: "serif",
    label: "Serif",
    stack: '"Iowan Old Style", Georgia, "Times New Roman", serif',
  },
  {
    id: "mono",
    label: "Mono",
    stack: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
];

export const SCALES: { value: number; label: string }[] = [
  { value: 0.9, label: "Small" },
  { value: 1, label: "Default" },
  { value: 1.1, label: "Large" },
  { value: 1.25, label: "Extra Large" },
];

export const HOURS = Array.from({ length: 25 }, (_, i) => i); // 0–24 for selects

const STORE_FILE = "settings.json";
const STORE_KEY = "settings";

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) storePromise = load(STORE_FILE, { autoSave: true, defaults: {} });
  return storePromise;
}

export async function loadSettings(): Promise<Settings> {
  try {
    const store = await getStore();
    const saved = (await store.get<Partial<Settings>>(STORE_KEY)) ?? {};
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(settings: Settings): Promise<void> {
  try {
    const store = await getStore();
    await store.set(STORE_KEY, settings);
    await store.save();
  } catch {
    /* ignore */
  }
}

/** Apply theme, font and UI scale to the document. */
export function applyAppearance(settings: Settings): void {
  const root = document.documentElement;
  const theme = THEMES.find((t) => t.id === settings.theme) ?? THEMES[0];
  root.dataset.theme = theme.id;
  root.classList.toggle("dark", theme.dark);

  const font = FONTS.find((f) => f.id === settings.font) ?? FONTS[0];
  root.style.setProperty("--app-font-family", font.stack);

  root.style.fontSize = `${16 * settings.scale}px`;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadSettings().then((s) => {
      if (mounted) {
        setSettings(s);
        setLoaded(true);
        applyAppearance(s);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void saveSettings(next);
      applyAppearance(next);
      return next;
    });
  };

  return { settings, update, loaded };
}
