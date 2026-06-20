import { useEffect, useState } from "react";
import { load, type Store } from "@tauri-apps/plugin-store";
import {
  Briefcase,
  Coffee,
  GraduationCap,
  HeartPulse,
  Home,
  User,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface Area {
  id: string;
  label: string;
  color: string;
  icon: LucideIcon;
}

/** Predefined areas of focus. */
export const AREAS: Area[] = [
  { id: "personal", label: "Personal", color: "#8b5cf6", icon: User },
  { id: "work", label: "Work", color: "#3b82f6", icon: Briefcase },
  { id: "health", label: "Health", color: "#10b981", icon: HeartPulse },
  { id: "finance", label: "Finance", color: "#f59e0b", icon: Wallet },
  { id: "family", label: "Family", color: "#ef4444", icon: Home },
  { id: "learning", label: "Learning", color: "#06b6d4", icon: GraduationCap },
  { id: "social", label: "Social", color: "#ec4899", icon: Coffee },
];

export function areaById(id: string): Area | undefined {
  return AREAS.find((a) => a.id === id);
}

export type MemberKind = "calendar" | "list";

export interface AreaMembers {
  calendarIds: string[];
  listIds: string[];
}

/** Maps an area id to the calendars / reminder lists assigned to it (many-to-many). */
export type AreaConfig = Record<string, AreaMembers>;

const STORE_FILE = "areas.json";
const STORE_KEY = "areaConfig";

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) storePromise = load(STORE_FILE, { autoSave: true, defaults: {} });
  return storePromise;
}

export async function loadAreaConfig(): Promise<AreaConfig> {
  try {
    const store = await getStore();
    return (await store.get<AreaConfig>(STORE_KEY)) ?? {};
  } catch {
    return {};
  }
}

async function saveAreaConfig(config: AreaConfig): Promise<void> {
  try {
    const store = await getStore();
    await store.set(STORE_KEY, config);
    await store.save();
  } catch {
    /* ignore store errors */
  }
}

export function areaMembers(config: AreaConfig, areaId: string): AreaMembers {
  return config[areaId] ?? { calendarIds: [], listIds: [] };
}

export function isMember(
  config: AreaConfig,
  areaId: string,
  kind: MemberKind,
  id: string,
): boolean {
  const members = areaMembers(config, areaId);
  return (kind === "calendar" ? members.calendarIds : members.listIds).includes(id);
}

/** Returns a new config with `id` added/removed from `areaId`'s membership. */
export function withMembership(
  config: AreaConfig,
  areaId: string,
  kind: MemberKind,
  id: string,
  on: boolean,
): AreaConfig {
  const members = areaMembers(config, areaId);
  const key = kind === "calendar" ? "calendarIds" : "listIds";
  const current = members[key];
  const nextList = on
    ? current.includes(id)
      ? current
      : [...current, id]
    : current.filter((x) => x !== id);
  return { ...config, [areaId]: { ...members, [key]: nextList } };
}

/** Add or remove a set of ids (e.g. one account group) for an area/kind. */
export function withMembershipMany(
  config: AreaConfig,
  areaId: string,
  kind: MemberKind,
  ids: string[],
  on: boolean,
): AreaConfig {
  const members = areaMembers(config, areaId);
  const key = kind === "calendar" ? "calendarIds" : "listIds";
  const current = members[key];
  const idSet = new Set(ids);
  const nextList = on
    ? [...current, ...ids.filter((id) => !current.includes(id))]
    : current.filter((id) => !idSet.has(id));
  return { ...config, [areaId]: { ...members, [key]: nextList } };
}

/** Whether an area has at least one calendar or reminder list assigned. */
export function areaHasMembers(config: AreaConfig, areaId: string): boolean {
  const m = areaMembers(config, areaId);
  return m.calendarIds.length > 0 || m.listIds.length > 0;
}

/** Hook over the persisted area config (Tauri store file). */
export function useAreaConfig() {
  const [config, setConfig] = useState<AreaConfig>({});

  useEffect(() => {
    let mounted = true;
    loadAreaConfig().then((c) => {
      if (mounted) setConfig(c);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const update = (next: AreaConfig) => {
    setConfig(next);
    void saveAreaConfig(next);
  };
  return [config, update] as const;
}
