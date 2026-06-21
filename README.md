# FocalPlanner

A macOS desktop app to **view and manage Apple Reminders and Calendar events**,
built with [Tauri v2](https://tauri.app), a Rust backend over Apple's EventKit
(via the [`eventkit`](https://crates.io/crates/eventkit) crate), and a React +
TypeScript + Tailwind + shadcn-style UI.

> **macOS only.** EventKit is an Apple framework; the app does not build/run on
> other platforms.

## Download & install

Grab the latest `.dmg` from the [**Releases**](https://github.com/pantulis/focalplanner/releases)
page, open it, and drag **FocalPlanner** into your **Applications** folder.

> [!IMPORTANT]
> These builds are **ad-hoc signed but not notarized by Apple** (the project has no
> paid Apple Developer membership). macOS Gatekeeper therefore blocks the app the
> **first** time you open it. This is a one-time step.

After moving the app to **Applications**, do **one** of the following:

- **macOS 14 (Sonoma) and earlier** — right-click (or Control-click) **FocalPlanner**
  in Applications → **Open**, then confirm **Open** in the dialog.
- **macOS 15 (Sequoia)** — double-click it once (it gets blocked), then open
  **System Settings → Privacy & Security**, scroll to the FocalPlanner notice and
  click **Open Anyway**.
- **Terminal (any version)** — remove the download quarantine flag:
  ```bash
  xattr -dr com.apple.quarantine /Applications/FocalPlanner.app
  ```

Once approved, the app launches normally from then on. On first run, grant
**Calendar** and **Reminders** access when prompted (or later via
System Settings → Privacy & Security).

### Why the extra step?
Notarization requires a paid Apple Developer account. Everything else
(signing, distribution, the app itself) works without it — only this first-launch
approval is affected.

## Features

- Apple-style **sidebar + lists** layout: calendars and reminder lists on the
  left, an event **agenda** and **reminders** in the main pane.
- Full **CRUD** for both events and reminders (create, edit, complete, delete).
- Native data: reads/writes the same store as Apple Calendar & Reminders.

## Architecture

| Layer    | Detail                                                                 |
|----------|------------------------------------------------------------------------|
| Backend  | `src-tauri/src/eventkit_service.rs` (sync EventKit access), `models.rs` (serde DTOs), `commands.rs` (Tauri commands). |
| Threading| EventKit's `EKEventStore` is `!Send`, so every command runs its work inside `tauri::async_runtime::spawn_blocking` using the crate's synchronous API. Authorization is system-level (TCC) and persists, so a fresh store is created per call. |
| Frontend | `src/lib/api.ts` (typed `invoke` wrappers), `src/lib/queries.ts` (TanStack Query), components in `src/components`. |
| Perms    | `src-tauri/Info.plist` declares the EventKit usage-description keys (Tauri merges it into the bundle). |

### Swift runtime linking

The `eventkit` crate links a Swift bridge that references the Swift runtime
(`libswift_Concurrency.dylib`). A dependency's link args don't propagate to the
final binary, so `src-tauri/build.rs` adds the required `-rpath` entries
(`/usr/lib/swift` and the active Xcode toolchain's Swift libs). Without this the
binary builds but crashes at startup with a `dyld: Library not loaded` error.

## Development

```bash
npm install
npm run tauri dev      # launch the app (Vite + Rust)
```

On first launch the app shows an **Access required** screen. Click **Grant
access** and approve the macOS Calendar and Reminders permission prompts. (To
change it later: System Settings → Privacy & Security → Calendars / Reminders.)

## Preference sync (optional)

FocalPlanner can sync your **preferences and areas of focus** across machines via a private
GitHub Gist, authenticated with GitHub's Device Flow. Your calendar and reminder *data*
stays in macOS/iCloud and is never uploaded. The OAuth token is stored in the macOS
Keychain, and an optional passphrase enables end-to-end encryption of the synced blob.

If you build your own copy, register your **own** GitHub OAuth App and use its Client ID —
the bundled one identifies the upstream app's authorization screen:

1. GitHub → Settings → **Developer settings → OAuth Apps → New OAuth App**.
2. Set any Homepage / Authorization callback URL (unused by Device Flow) and **enable Device Flow**.
3. Copy the **Client ID** (starts with `Ov…`) into `GITHUB_CLIENT_ID` in
   `src-tauri/src/github_sync.rs`, then rebuild.

Sync is entirely optional — the app works fully without connecting GitHub.

## Build

```bash
npm run tauri build    # produces a .app bundle in src-tauri/target/release/bundle
```

### Cutting a release

A GitHub Actions workflow (`.github/workflows/release.yml`) builds a **universal,
ad-hoc-signed `.dmg`** and attaches it to a GitHub Release. To publish:

1. Bump the version in `package.json`, `src-tauri/tauri.conf.json` and
   `src-tauri/Cargo.toml` (keep them in sync), commit, and push.
2. Tag the commit and push the tag:
   ```bash
   git tag v0.4.0
   git push origin v0.4.0
   ```
3. The workflow builds on a macOS runner and creates a **draft** Release with the
   DMG attached. Review it on GitHub and click **Publish release**.

No Apple Developer secrets are required. The build is signed ad-hoc (`APPLE_SIGNING_IDENTITY: "-"`)
and **not notarized**, so the first-launch Gatekeeper step above applies. To enable
notarization later, add the `APPLE_*` secrets to the repo and the workflow will use them.
You can also run the workflow manually from the **Actions** tab (`workflow_dispatch`).

## Useful checks

```bash
npm run build                       # tsc + vite production build
(cd src-tauri && cargo clippy)      # Rust lints
```
