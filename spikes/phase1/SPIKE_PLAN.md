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
| 5 | B on Windows, macOS, iOS, Android; C on iOS WKWebView | GitHub Actions (macOS runners, D-008) and devices | **Desktop done 2026-10-13.** Run 1 (38491921666): macOS and Ubuntu pass everything, Windows needed `icon.ico`. Run 2 (38507879149) and [run 38509477157](https://github.com/ctoepfer/carboy/actions/runs/38509477157): **Windows WebView2, macOS WKWebView, and Ubuntu WebKitGTK all pass**: core checks 5/5, Recipe edit (OG 1.064 → 1.071), Library 3/3 verified (WAL, `synchronous=2`), both graph candidates 7/7. Android and iOS: not started; see Mobile investigation |
| 6 | D, E | Desktop first | After step 5 starts |
| — | ADR 0006 evidence: kill during write, reopen | This host | **Done 2026-10-13**: 3/3 rounds clean. Durability default FULL confirmed at runtime on all three desktops; FULL vs NORMAL measured (ADR 0006 "Measurements"); macOS needs `fullfsync` for real power-loss durability (follow-up) |
| — | USABILITY §5 measurements: media features, Intl, axe-core | CI, three desktops | **Done 2026-10-13** (USABILITY §5 "Results"); zoom, RTL rendering, keyboard-only, Orca by ear, magnification, and the message-format trial remain manual or later |
| 7 | Spike reports and ADR decisions | — | End of Phase 1 |

## Interface growth

The spike shell has a navigation bar on every page (`graph/shared/nav.js`).
When a capability works, it gets a page or a control there, without a
framework until D-010 is decided. Current pages: Recipe (default: edit one
amount with preview and diff, save as a child revision, export, import),
Library (list and verify), Core checks, Process graph (React Flow), Process
graph (Svelte Flow). Next planned: undo/redo and a History view.

## Mobile investigation (2026-10-13)

The owner directed: investigate Android and iOS, don't block Recipe Core on
missing devices, and record gaps against platform release gates.

**What the risk actually depends on.** Recipe Core is pure ES2022 with
BigInt and no host APIs (RECIPE_CORE §1), so its portability is a question
of JavaScript engines, not devices:

| Mobile webview | Engine | Closest evidence so far |
|---|---|---|
| iOS WKWebView | JavaScriptCore | macOS WKWebView in CI (JavaScriptCore): core checks 5/5, Recipe edit, Library, both graphs 7/7 (runs 38491921666, 38507879149) |
| Android System WebView | V8 (Chromium) | Windows WebView2 in CI (Chromium/V8): the same passes; Node (V8): Recipe Core 57/57 on Node 20, 22, 24 |

That makes a core failure on mobile unlikely, but it is **inference, not
verification**: mobile engine builds, memory limits, and JIT restrictions
differ. The shell (Tauri 2 mobile: plugins, file access, SQLite, lifecycle)
has no evidence at all yet.

**Option 1 done (2026-10-13):** Recipe Core's 7 published hash vectors and
6 formula and arithmetic checks pass **13/13 on macOS's system
JavaScriptCore** (macOS 26 runner, through `osascript -l JavaScript`;
recent macOS ships no `jsc` shell), CI run 38517172487. Engine-level
evidence for iOS only; the iOS app shell is untested.

**Option 2 started (2026-10-14):** the shell (moved into a library with a
mobile entry point) **builds for the iOS Simulator** with Xcode 26.6 and
Tauri CLI 2.12.1 (`BUILD SUCCEEDED`, `spike-shell.app` for arm64-sim; CI
run 38639846127). Not yet installed or run in a simulator; the next step is
`xcrun simctl` install and launch with the auto-mode variables, then reading
the report from the app's container.

**Options, cheapest first:**

1. **Engine check without the shell:** run Recipe Core's vectors under
   `jsc` (JavaScriptCore's command-line shell, present on macOS runners)
   from a single bundled file. Cheap; proves the engine, not the app.
2. **iOS Simulator in CI:** macOS runners include Xcode and simulators.
   `tauri ios` builds for the simulator need no signing team; the spike's
   env-driven auto mode can pass through `xcrun simctl launch` (variables
   prefixed `SIMCTL_CHILD_`), and the report can be read from the app
   container. Moderate effort; macOS minutes.
3. **Android emulator in CI:** Linux runners support hardware acceleration
   (KVM) for the emulator; the Android SDK is preinstalled. Third-party
   emulator actions may not pass the repository's "GitHub-made or verified"
   Actions policy, so scripting `sdkmanager` / `emulator` directly may be
   needed. Moderate to high effort.
4. **Real devices:** still needed before any mobile support claim
   (PROJECT_PLAN Phase 12: "No mobile claim based on a responsive browser
   preview"; simulator runs are labelled as such).

**Gaps and their gates:**

| Gap | Blocks | Gate |
|---|---|---|
| Recipe Core on mobile engines (option 1) | Nothing now; confirms ADR 0004 item 2 | Before ADR 0003 is decided (end of Phase 1) |
| Tauri mobile shell on simulator/emulator (options 2–3) | ADR 0003 for mobile; D-018 | End of Phase 1 for a go/no-go; fallback shell considered otherwise |
| Physical Android and iOS devices | Any mobile support claim | Phase 12 release gate |

## Owner prerequisites

Needed from the maintainer:

- Enable GitHub Actions, including macOS runners, on this repository.
  Hosted macOS minutes may cost money.
- Test devices: an Android device and an iOS device for Phase 12 (Windows
  is covered by CI since 2026-10-13; simulators and emulators can run in
  CI, see "Mobile investigation").
- More of the owner's recipes as fixtures (each with a publish or
  no-publish note), for the performance budget and the large-recipe
  graph test.

## Dependency advisories

**GHSA-wrw7-89jp-8q8g / RUSTSEC-2024-0429 (Dependabot alert 1, moderate),
reviewed 2026-10-14. Remediation deferred; not exploitable here.**

- **What:** `glib` 0.18.5 (Rust, transitive, in
  `shell-tauri/src-tauri/Cargo.lock`). `VariantStrIter::impl_get` passes
  an out-pointer as `&p` instead of `&mut p`; with optimizing compilers
  this dereferences NULL (a crash), affecting the `Iterator` and
  `DoubleEndedIterator` impls reached through `Variant::array_iter_str()`.
  Affected `>= 0.15.0, < 0.20.0`; fixed in 0.20.0 (gtk-rs-core PR 1343).
- **Path:** spike-shell → tauri 2.12.3 / tauri-runtime-wry 2.12.1 →
  wry 0.57.0 → webkit2gtk `=2.0.2` → gtk 0.18 / glib `^0.18`; also tao,
  muda, tray-icon, libappindicator via gtk 0.18. These are the GTK 3
  bindings (gtk3-rs), which have no release on glib ≥ 0.20, and no glib
  0.18.x patch exists. Linux-only (the GTK crates are target-specific).
- **Use of the vulnerable code:** none found. Searched the sources of all
  32 crates in the lockfile that depend on glib, gio, or gtk (tauri, wry,
  tao, muda, tray-icon, libappindicator, webkit2gtk, javascriptcore-rs,
  soup3, gtk, gdk, gdkx11, pango, cairo-rs, atk, gdk-pixbuf, and their
  `-sys` crates) and the spike's own code for `array_iter_str` and
  `VariantStrIter`: the only uses are glib's own tests and documentation.
- **Kind:** runtime dependency of the throwaway spike binary only. Not in
  `packages/`, not distributed, not in the npm lockfile; Recipe Core and
  its determinism are unaffected; core CI does not build it.
- **Smallest remediation:** none compatible. A fix needs wry and
  webkit2gtk to move to glib ≥ 0.20 (upstream). Forcing a newer glib
  would break the build (`^0.18` requirement).
- **Not suppressed.** The alert stays open as the record. If the owner
  prefers, it can be dismissed as "vulnerable code not used" citing this
  section. Re-check when Tauri/wry update their Linux webview stack, and
  before ADR 0003 is accepted (input to its Linux risk).

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
