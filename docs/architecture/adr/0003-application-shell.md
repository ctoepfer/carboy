# ADR 0003: Tauri 2 shell with a web UI

- Status: Accepted for development (2026-11-25, owner); a signed, notarized macOS build is a Phase 6 release gate
- Date: 2026-10-09
- Decision owner: Charles Toepfer

## Context

Carboy targets Windows, macOS, Linux, Android, and iOS from one codebase.
Its hardest UI is an accessible, touch- and keyboard-operable process graph.
Lumina's visual design exists as CSS tokens and components. The team is small.

## Decision

- Use a **web UI in TypeScript**: the strongest ecosystem for graph editing
  (e.g. xyflow, MIT) and the most mature accessibility model (ARIA, focus
  management) for custom widgets; Lumina's tokens are reusable directly.
- Host it in **Tauri 2** on desktop and mobile. Keep Rust thin: storage,
  secrets, files, outbound HTTP, notifications, sidecar supervision. No domain
  logic in Rust.
- **Fallback: Electron + Capacitor**, using the same TypeScript core and UI.
  Bundled Chromium removes WebKitGTK risk; Capacitor's mobile tooling is more
  mature. Costs: larger installers (~100 MB+), higher memory.

The UI framework (React vs. Svelte) is a separate decision (D-010), evaluated
together with the graph spike.

## Alternatives considered

| Option | Why not (now) |
|---|---|
| Flutter | Consistent rendering, strong mobile; but Dart, no CSS reuse, weaker graph libraries, harder accessibility for custom canvas UI. Runner-up. |
| React Native + desktop variants | No Linux support. |
| BeeWare / Python everywhere | Would reuse Python code, but its UI toolkit cannot support an accessible interactive graph editor. |
| Kotlin / Compose Multiplatform | Viable, but JVM desktop and nothing reused. |

## Consequences

- Webview differences (WebView2, WKWebView, WebKitGTK) must be tested; Linux
  is the highest risk.
- On Linux, Tauri 2 (via wry and webkit2gtk) depends on the GTK 3 Rust
  bindings, which are tied to glib 0.18; advisories fixed only in newer
  glib cannot be taken until upstream moves (example: RUSTSEC-2024-0429,
  not exploitable in the spike; [SPIKE_PLAN](../../../spikes/phase1/SPIKE_PLAN.md#dependency-advisories)).
- Tauri mobile is younger than its desktop support; plugin gaps may need small
  native plugins.

## Evidence required to accept

1. Graph spike (selection, drag with non-drag alternative, pan/zoom, keyboard,
   screen-reader names) performs acceptably on WebKitGTK and iOS WKWebView
   with a representative large recipe.
2. Minimal app builds and runs on Windows, macOS, Linux, Android, and iOS.
3. Signed/notarized macOS build succeeds (with sidecar if ADR 0005 track runs).

## Evidence (2026-11-25)

The evidence below comes from the throwaway Phase 1 spike shell
(`spikes/phase1/shell-tauri`); the production shell doesn't exist yet.

| Item | State |
|---|---|
| 1. Graph on WebKitGTK and iOS WKWebView | **Open.** Automated runs pass on WebKitGTK and the iOS Simulator, with the provisional large recipe. Stage semantics solved for Orca ([GRAPH_REPORT](../../../spikes/phase1/GRAPH_REPORT.md)). Still open: a person listening to a screen reader, VoiceOver, a measured large recipe, touch |
| 2. Runs on all five targets | **Met for development, with caveats.** Desktops: Windows, macOS, and Linux pass in CI, and on a real machine of each the version 1 → 2 migration check passes 12/12 through the shell (at `2e91048`). The Recipe Library kill test passes 3/3 rounds on Linux and Windows; on macOS round 3 hangs (open under ADR 0006, below). Android: on a physical Nexus 5X (Android 8.1, API 27, WebView 138), save and reopen at `b28d334` (2026-11-11), and the session check at `4ac5873` (2026-11-24) — start 6/6, then reopen 12/12 after an app restart (draft offered, resumed with its undo history, saved, reopened clean) — both pass. iOS: on a physical iPhone 13 (iOS 27.0.1), the same session check at `4ac5873` passes, start 6/6 and reopen 12/12, with `fullfsync` 1. **iPhone caveats:** (a) the test database was in the app container's `Documents/` folder through `SPIKE_DATA_DIR`, not the app's usual data folder, because the test procedure's file copy had left `Library/Application Support` owned by root, where the app can't create files; (b) both launches ended with SIGABRT (signal 6) after writing their reports, not a clean exit; cause not established. The restarts on both phones followed the app's own exit; neither was a kill test |
| 3. Signed macOS build | **Not met; release gate.** Not attempted: the build Mac has only a free Personal Team "Apple Development" identity, no Developer ID Application identity, and no notarization credentials (checked 2026-11-25) |

## Acceptance for development (2026-11-25)

Accepted by the owner for development: Phase 4 UI work and later phases build
on this shell, and nothing further is spent on the fallback unless the evidence
below turns against Tauri. It isn't accepted for release:

- **Release gate (Phase 6, desktop 1.0):** a signed, notarized macOS build
  succeeds (item 3), with a sidecar if the ADR 0005 track runs. If it can't
  be made to succeed, this ADR is revisited before Phase 6.
- **Still open, and evidence that can still count against this shell:**
  item 1 (a person listening to a screen reader, VoiceOver, a measured large
  recipe, touch); the macOS kill-test hang (round 3, ADR 0006); the iPhone's
  abort at exit and its run outside the usual data folder (item 2's caveats).

This acceptance doesn't decide the UI framework (D-010), the UI direction
(D-035), or the graph library (D-017).
