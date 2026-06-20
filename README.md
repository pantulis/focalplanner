# FocalPlanner

A macOS desktop app to **view and manage Apple Reminders and Calendar events**,
built with [Tauri v2](https://tauri.app), a Rust backend over Apple's EventKit
(via the [`eventkit`](https://crates.io/crates/eventkit) crate), and a React +
TypeScript + Tailwind + shadcn-style UI.

> **macOS only.** EventKit is an Apple framework; the app does not build/run on
> other platforms.

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

## Build

```bash
npm run tauri build    # produces a .app bundle in src-tauri/target/release/bundle
```

## Useful checks

```bash
npm run build                       # tsc + vite production build
(cd src-tauri && cargo clippy)      # Rust lints
```
