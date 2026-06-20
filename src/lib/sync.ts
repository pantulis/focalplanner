import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, type GithubAccount } from "./api";
import type { Settings } from "./settings";
import type { AreaConfig } from "./areas";

const SYNC_VERSION = 1;
const PUSH_DEBOUNCE_MS = 1500;

interface SyncPayload {
  version: number;
  updatedAt: string;
  settings: Partial<Settings>;
  areaConfig: AreaConfig;
}

/** Fields that are per-machine and must NOT be synced. */
function syncedSettings(s: Settings): Partial<Settings> {
  const { syncGistId, syncUpdatedAt, autoSync, ...rest } = s;
  void syncGistId;
  void syncUpdatedAt;
  void autoSync;
  return rest;
}

function snapshot(s: Settings, a: AreaConfig): string {
  return JSON.stringify({ settings: syncedSettings(s), areaConfig: a });
}

export type PullResult = "applied" | "up-to-date" | "empty" | "locked";

interface Params {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  areaConfig: AreaConfig;
  setAreaConfig: (next: AreaConfig) => void;
  settingsLoaded: boolean;
}

export interface SyncController {
  account: GithubAccount;
  syncing: boolean;
  error: string | null;
  lastSyncedAt?: string;
  hasPassphrase: boolean;
  locked: boolean;
  refreshAccount: () => Promise<void>;
  afterConnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  push: () => Promise<void>;
  pull: (force?: boolean) => Promise<PullResult>;
  setPassphrase: (passphrase: string) => Promise<void>;
  clearPassphrase: () => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
}

export function useSyncController({
  settings,
  updateSettings,
  areaConfig,
  setAreaConfig,
  settingsLoaded,
}: Params): SyncController {
  const [account, setAccount] = useState<GithubAccount>({ connected: false, login: null });
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPassphrase, setHasPassphrase] = useState(false);
  const [locked, setLocked] = useState(false);

  // Snapshot of what we last wrote/applied, to avoid echo auto-pushes.
  const lastSyncedRef = useRef<string | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fail = (e: unknown) => {
    const msg = String(e);
    setError(msg);
    toast.error(msg);
  };

  async function refreshAccount() {
    try {
      setAccount(await api.githubAccount());
      setHasPassphrase(await api.syncHasPassphrase());
    } catch {
      /* offline / token issue — leave as-is */
    }
  }

  async function setPassphrase(passphrase: string) {
    try {
      await api.syncSetPassphrase(passphrase);
      setHasPassphrase(true);
      await push(); // re-write the gist encrypted
    } catch (e) {
      fail(e);
    }
  }

  async function clearPassphrase() {
    try {
      await api.syncClearPassphrase();
      setHasPassphrase(false);
      await push(); // re-write the gist as plaintext
    } catch (e) {
      fail(e);
    }
  }

  async function resolveGistId(): Promise<string | null> {
    if (settings.syncGistId) return settings.syncGistId;
    return await api.gistFind();
  }

  async function push() {
    if (!account.connected) return;
    setSyncing(true);
    setError(null);
    try {
      const updatedAt = new Date().toISOString();
      const payload: SyncPayload = {
        version: SYNC_VERSION,
        updatedAt,
        settings: syncedSettings(settings),
        areaConfig,
      };
      const gistId = await api.gistPush(JSON.stringify(payload), settings.syncGistId ?? null);
      updateSettings({ syncGistId: gistId, syncUpdatedAt: updatedAt });
      lastSyncedRef.current = snapshot(settings, areaConfig);
    } catch (e) {
      fail(e);
    } finally {
      setSyncing(false);
    }
  }

  async function pull(force = false): Promise<PullResult> {
    if (!account.connected) return "empty";
    setSyncing(true);
    setError(null);
    try {
      const gistId = await resolveGistId();
      if (!gistId) return "empty";
      let content: string | null;
      try {
        content = await api.gistPull(gistId);
      } catch (e) {
        // Encrypted gist we can't read (no / wrong passphrase) → locked, don't push.
        if (/encrypt|passphrase/i.test(String(e))) {
          updateSettings({ syncGistId: gistId });
          setLocked(true);
          return "locked";
        }
        throw e;
      }
      setLocked(false);
      if (!content) {
        updateSettings({ syncGistId: gistId });
        return "empty";
      }
      const remote = JSON.parse(content) as SyncPayload;
      const newer =
        !settings.syncUpdatedAt ||
        (remote.updatedAt ?? "") > settings.syncUpdatedAt;
      if (!force && !newer) {
        updateSettings({ syncGistId: gistId });
        return "up-to-date";
      }
      // Apply remote (preserving per-machine fields via the merge in updateSettings).
      updateSettings({
        ...remote.settings,
        syncGistId: gistId,
        syncUpdatedAt: remote.updatedAt,
      });
      setAreaConfig(remote.areaConfig ?? {});
      lastSyncedRef.current = JSON.stringify({
        settings: remote.settings,
        areaConfig: remote.areaConfig ?? {},
      });
      return "applied";
    } catch (e) {
      fail(e);
      return "empty";
    } finally {
      setSyncing(false);
    }
  }

  async function afterConnect() {
    await refreshAccount();
    // Reconcile: take remote if present (newer wins), then push so the gist is current.
    const result = await pull(false);
    if (result === "locked") return; // wait for the user to unlock; never overwrite
    await push();
  }

  // Provide the passphrase for an encrypted remote, then pull (never push first).
  async function unlock(passphrase: string) {
    setSyncing(true);
    try {
      await api.syncSetPassphrase(passphrase);
      setHasPassphrase(true);
      const result = await pull(false);
      if (result === "locked") {
        // Wrong passphrase — drop it so the user can retry.
        await api.syncClearPassphrase();
        setHasPassphrase(false);
        setError("Wrong passphrase");
        toast.error("Wrong passphrase");
      } else {
        setLocked(false);
      }
    } catch (e) {
      fail(e);
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    try {
      await api.githubDisconnect();
    } catch (e) {
      fail(e);
    }
    setAccount({ connected: false, login: null });
    setLocked(false);
    updateSettings({ syncGistId: undefined });
    lastSyncedRef.current = null;
  }

  // Check connection on launch.
  useEffect(() => {
    refreshAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One-time guarded pull once connected + settings loaded.
  const pulledOnce = useRef(false);
  useEffect(() => {
    if (account.connected && settingsLoaded && !pulledOnce.current) {
      pulledOnce.current = true;
      pull(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.connected, settingsLoaded]);

  // Debounced auto-push on local changes.
  useEffect(() => {
    if (!settingsLoaded || !account.connected || !settings.autoSync || locked) return;
    const snap = snapshot(settings, areaConfig);
    if (lastSyncedRef.current === null) {
      // First observation this session — adopt as baseline, don't push.
      lastSyncedRef.current = snap;
      return;
    }
    if (snap === lastSyncedRef.current) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => void push(), PUSH_DEBOUNCE_MS);
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, areaConfig, account.connected, settingsLoaded, locked]);

  return {
    account,
    syncing,
    error,
    lastSyncedAt: settings.syncUpdatedAt,
    hasPassphrase,
    locked,
    refreshAccount,
    afterConnect,
    disconnect,
    push,
    pull,
    setPassphrase,
    clearPassphrase,
    unlock,
  };
}
