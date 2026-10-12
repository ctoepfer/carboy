# ADR 0003: Tauri 2 shell with a web UI

- Status: Proposed
- Date: 2026-10-09
- Decision owner: Charles Toepfer

## Context

Carboy targets Windows, macOS, Linux, Android, and iOS from one codebase.
Its hardest UI is an accessible, touch- and keyboard-operable process graph.
Lumina's visual design exists as CSS tokens and components. The team is small.

## Decision (proposed)

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
- Tauri mobile is younger than its desktop support; plugin gaps may need small
  native plugins.

## Evidence required to accept

1. Graph spike (selection, drag with non-drag alternative, pan/zoom, keyboard,
   screen-reader names) performs acceptably on WebKitGTK and iOS WKWebView
   with a representative large recipe.
2. Minimal app builds and runs on Windows, macOS, Linux, Android, and iOS.
3. Signed/notarized macOS build succeeds (with sidecar if ADR 0005 track runs).
