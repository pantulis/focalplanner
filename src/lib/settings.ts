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
  /** Hours of timeline shown before/after an item in the inspector mini-planner. */
  inspectorContextHours: number;
  /** Custom order of areas of focus in the sidebar (area ids). */
  areaOrder: string[];
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
  inspectorContextHours: 2,
  areaOrder: [],
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
  // Light
  { id: "light", label: "Light", dark: false, swatch: ["#ffffff", "#343434", "#f2f2f2"] },
  { id: "macos", label: "macOS", dark: false, swatch: ["#f5f5f7", "#007aff", "#e3e3e8"] },
  { id: "github-light", label: "GitHub Light", dark: false, swatch: ["#ffffff", "#0969da", "#eaeef2"] },
  { id: "catppuccin-latte", label: "Catppuccin Latte", dark: false, swatch: ["#eff1f5", "#8839ef", "#ccd0da"] },
  { id: "solarized", label: "Solarized Light", dark: false, swatch: ["#fdf6e3", "#268bd2", "#eee8d5"] },
  { id: "gruvbox-light", label: "Gruvbox Light", dark: false, swatch: ["#fbf1c7", "#b57614", "#ebdbb2"] },
  // Dark
  { id: "dark", label: "Dark", dark: true, swatch: ["#252525", "#ededed", "#444444"] },
  { id: "nord", label: "Nord", dark: true, swatch: ["#2e3440", "#88c0d0", "#4c566a"] },
  { id: "dracula", label: "Dracula", dark: true, swatch: ["#282a36", "#bd93f9", "#44475a"] },
  { id: "tokyo-night", label: "Tokyo Night", dark: true, swatch: ["#1a1b26", "#7aa2f7", "#414868"] },
  { id: "catppuccin", label: "Catppuccin Mocha", dark: true, swatch: ["#1e1e2e", "#cba6f7", "#585b70"] },
  { id: "gruvbox", label: "Gruvbox", dark: true, swatch: ["#282828", "#fabd2f", "#504945"] },
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
  { id: "inter", label: "Inter", stack: '"Inter Variable", system-ui, sans-serif' },
  { id: "roboto", label: "Roboto", stack: '"Roboto Flex Variable", system-ui, sans-serif' },
  { id: "open-sans", label: "Open Sans", stack: '"Open Sans Variable", system-ui, sans-serif' },
  {
    id: "nunito",
    label: "Nunito",
    stack: '"Nunito Variable", ui-rounded, system-ui, sans-serif',
  },
  {
    id: "source-serif",
    label: "Source Serif",
    stack: '"Source Serif 4 Variable", Georgia, "Times New Roman", serif',
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    stack: '"JetBrains Mono Variable", ui-monospace, Menlo, monospace',
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
