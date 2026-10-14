# Phase 1 Spike Plan

- Status: **Active, started 2026-10-12.**
- Purpose: produce the evidence that decides ADRs 0003 (shell), 0004
  (TypeScript Recipe Core), and 0006 (persistence), plus D-010 (UI
  framework) and D-017 (graph library). See
  [ROADMAP.md](../../docs/ROADMAP.md).
- Spike code lives under [`spikes/phase1/`](./). It is
  **throwaway**: no package names, bundle IDs, or layouts are decided by it,
  and it is deleted or archived once the ADRs are decided. Real packages
  start in Phase 2.

## Tracks

| Track | Question | Done when | Decides |
|---|---|---|---|
| **A. Recipe Core proof** | Can a pure TypeScript core (no DOM, no Node, Web-standard APIs only) do decimal arithmetic, RFC 8785 hashing, and a parity-checked statistic? | Tests pass in Node **and** unchanged inside each target webview | ADR 0004 |
| **B. Shell** | Does Tauri 2 build and run the same core, save and reopen through SQLite, and export and import a native file on every target? | Minimal app on Linux, Windows, macOS, Android, iOS (simulator acceptable, marked as such) | ADR 0003, ADR 0006 |
| **C. Graph** | Do xyflow (React Flow) or Svelte Flow meet the accessibility and performance bars on the weakest webviews (WebKitGTK, iOS WKWebView)? | Report: selection, drag plus non-drag alternative (WCAG 2.2 SC 2.5.7), pan/zoom vs. drag, keyboard, screen-reader names, large-recipe timing | ADR 0003, D-010, D-017, RECIPE_SCHEMA Q4 |
| **D. Sidecar** (non-blocking) | Can the BrewIO host ship as a Tauri sidecar with a defined lifecycle? | Report per the roadmap | ADR 0005 |
| **E. Platform services** | Secret storage, file associations and sharing, Rust-side HTTP | Short notes per platform | ADR 0003 |

## Order and where each runs

| Step | Track | Runs on | Status |
|---|---|---|---|
| 1 | A in Node: decimal, units, RFC 8785 vectors, revision round trip, Lumina OG parity | This Linux host | **Done 2026-10-12**: 10/10 tests ([spike README](README.md)) |
| 2 | A + B on Linux: Tauri 2 desktop app that runs the track A build in WebKitGTK and reports the same results; SQLite save/reopen; native file export/import | This Linux host (Rust installed per user; WebKitGTK 4.1 present) | **Done 2026-10-12**: 5/5 checks on two launches (save, then reopen) |
| 3 | Performance budget input: measure the owner's real recipes (ingredient, addition, and stage counts) and define a "large recipe" for track C | This host | Needs the owner's recipe exports beyond the two fixtures |
| 4 | C on Linux (WebKitGTK), React vs. Svelte | This host | **Automated part done 2026-10-12**: both 7/7 ([GRAPH_REPORT.md](GRAPH_REPORT.md)); Orca and drag-feel checks are manual and open |
| 5 | B on Windows, macOS, iOS, Android; C on iOS WKWebView | GitHub Actions (macOS runners, D-008) and devices | **Desktop CI run 1, 2026-10-13** ([run 38491921666](https://github.com/ctoepfer/carboy/actions/runs/38491921666)): **macOS (WKWebView)** and **Ubuntu (WebKitGTK, xvfb)** pass everything: core checks 5/5, Recipe edit (OG 1.064 → 1.071), Library (3/3 revisions verified, integrity ok, WAL), both graph candidates 7/7. **Windows** failed at build: Tauri needs `icons/icon.ico` (added; rerun pending). Android and iOS: not started (devices or emulators needed) |
| 6 | D, E | Desktop first | After step 5 starts |
| — | ADR 0006 evidence: kill during write, reopen | This host | **Done 2026-10-13**: 3/3 rounds clean; power loss open |
| 7 | Spike reports and ADR decisions | — | End of Phase 1 |

## Interface growth

The spike shell has a navigation bar on every page (`graph/shared/nav.js`).
When a capability works, it gets a page or a control there, without a
framework until D-010 is decided. Current pages: Recipe (default: edit one
amount with preview and diff, save as a child revision, export, import),
Library (list and verify), Core checks, Process graph (React Flow), Process
graph (Svelte Flow). Next planned: undo/redo and a History view.

## Owner prerequisites

Needed from the maintainer:

- Enable GitHub Actions, including macOS runners, on this repository.
  Hosted macOS minutes may cost money.
- Test devices: a Windows machine or VM, an Android device, and an iOS
  device or simulator access through CI.
- More of the owner's recipes as fixtures (each with a publish or
  no-publish note), for the performance budget and the large-recipe
  graph test.

## Rules for spike code

- Pin exact dependency versions. Record each candidate's license.
- No brand in any identifier (NAMING.md). The spike's bundle identifier is
  a throwaway placeholder and is not reused.
- The track A core must not import DOM or Node APIs. Its tsconfig loads no
  host typings, and its only host surface is declared in
  `spikes/phase1/recipe-core/src/platform.d.ts`.
- Spike files use provisional names. The native file extension and media
  type stay D-016.

## Questions this phase answers

ADR 0003, ADR 0004, ADR 0006, D-010, D-017, RECIPE_SCHEMA Q4 (layout-only
edits), and the performance budgets, which carry over from Phase 0.
