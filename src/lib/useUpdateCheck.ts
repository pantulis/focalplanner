import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

/** GitHub repo that publishes releases. */
const REPO = "pantulis/focalplanner";
/** localStorage key remembering the last version the user dismissed. */
const DISMISS_KEY = "fp:update-dismissed";

export interface UpdateInfo {
  /** Latest release version without the leading "v", e.g. "0.9.0". */
  version: string;
  /** Release page URL to open for the download. */
  url: string;
  /** Human-friendly release name, e.g. "FocalPlanner v0.9.0". */
  name: string;
}

/** Whether dotted-numeric version `a` is strictly newer than `b`. */
function isNewer(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * Lightweight, notify-only update check: once per launch, ask GitHub for the
 * latest published release and surface a banner if it is newer than the running
 * version. No signing keys or in-app install — the user downloads the DMG.
 */
export function useUpdateCheck() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = await getVersion();
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!res.ok) return;
        const data = await res.json();
        const tag: string = String(data.tag_name ?? "").replace(/^v/, "");
        if (!tag || !isNewer(tag, current)) return;
        // Respect a per-version dismissal so we don't nag for the same release.
        if (localStorage.getItem(DISMISS_KEY) === tag) return;
        if (!cancelled) {
          setUpdate({ version: tag, url: data.html_url, name: data.name || `v${tag}` });
        }
      } catch {
        /* offline, rate-limited, or no releases yet — stay quiet */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    if (update) localStorage.setItem(DISMISS_KEY, update.version);
    setUpdate(null);
  };

  return { update, dismiss };
}
