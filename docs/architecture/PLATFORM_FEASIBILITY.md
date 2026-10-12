# Carboy — Platform Feasibility

Status: Planning assessment, 2026-10-09, based on framework and store
knowledge as of mid-2026. **Re-verify versions, minimums, and store policies
when targets are fixed (Phase 0) and again before release (Phases 6, 12).**

## Summary

| Target | Verdict | Key constraints |
|---|---|---|
| Windows x64 (arm64 later) | Feasible | WebView2 ships with Windows 10/11. Code signing (certificate or Azure Trusted Signing) avoids SmartScreen warnings. Firewall prompt when a LAN listener (iSpindel receiver) starts. |
| macOS universal | Feasible, effortful | Apple Developer Program ($99/yr) for notarization. Every nested binary in a bundled Python sidecar must be signed with hardened runtime. Bluetooth usage descriptions in the parent app; child-process Bluetooth permission attribution needs testing. Tauri 2 minimum is macOS 10.15. |
| Linux x64 (arm64 later) | Feasible; weakest webview | WebKitGTK lags other webviews in performance, touch, and rendering — the main risk for the process graph. AppImage and deb/rpm are straightforward; Flatpak is not first-class. BLE via BlueZ works. arm64 matters for Raspberry Pi BrewIO hosts. |
| Android | Feasible if Recipe Core is not Python | Tauri 2 Android works; plugin ecosystem is thinner. BLE requires runtime permissions and a native plugin. Foreground service enables background monitoring. Google Play: one-time $25; new personal accounts must complete a closed test (recently 12 testers for 14 days) before production. F-Droid is a natural open-source channel. |
| iOS | Feasible as a scoped app | See below. |

## iOS constraints

1. **No subprocesses.** No Python sidecar; App Store Review Guideline 2.5.2
   bars downloading executable code. Everything iOS runs must be compiled into
   the app — hence a TypeScript Recipe Core ([ADR 0004](adr/0004-typescript-recipe-core.md)).
2. **Tilt is an iBeacon.** CoreBluetooth hides iBeacon advertisement data;
   iOS needs CoreLocation beacon ranging with Tilt's known UUIDs and location
   permission. BrewPanel's desktop Tilt driver does not port.
3. **No reliable background monitoring.** Apps are suspended; BLE background
   modes are limited. Unattended logging requires a LAN BrewIO host.
4. **Phone cannot be an iSpindel receiver.** iSpindel pushes HTTP to a fixed
   address; a suspended phone with a changing IP cannot receive it.
5. **Local network access** needs `NSLocalNetworkUsageDescription`; plain
   HTTP to LAN hosts needs App Transport Security local-networking exceptions.
6. **Distribution**: Apple Developer Program required even for free apps.
   Keep the dependency tree free of GPL-family licenses, which conflict with
   App Store terms; MIT/Apache/BSD are fine.

## Cross-cutting

- **macOS hardware needed.** The current development host runs Pop!_OS. iOS
  builds and macOS notarization require macOS — a Mac or hosted macOS CI
  runners. This is a Phase 0 blocker for Phase 1's mobile proof.
- **Python sidecar builds are native per OS/architecture** (PyInstaller or
  Nuitka do not cross-compile). Requires a CI matrix; macOS universal means two
  builds merged or two downloads.
- **AI calls go through the Rust side**, not the webview: avoids Ollama's
  origin restrictions for `tauri://` origins and keeps API keys out of web
  context.
- **Fixed costs of a free release**: Apple $99/yr, Google Play $25 once,
  possibly a Windows signing certificate.

## Recommended target set (proposed, D-007)

- **Desktop 1.0**: Windows x64, macOS universal, Linux x64 (AppImage + deb).
  Add arm64 builds on evidence of demand.
- **Mobile**: Android first. Then an iOS app that edits recipes offline and
  reaches hardware and AI only through a LAN host or remote providers.

## Evidence Phase 1 must produce

1. The process-graph spike runs acceptably on WebKitGTK and iOS WKWebView.
2. Recipe Core runs unchanged on Android and iOS.
3. A signed, notarized macOS build launches a bundled Python sidecar and
   exchanges simulator telemetry (non-blocking track if Python is not needed
   for Recipe Core).

If (1) fails, switch the shell to Electron + Capacitor (same TypeScript core
and UI) per [ADR 0003](adr/0003-application-shell.md).
