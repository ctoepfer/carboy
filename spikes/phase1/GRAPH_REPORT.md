# Graph spike report (track C), interim

- Date: 2026-10-12. **Interim: Linux WebKitGTK only.** The iOS WKWebView
  run and the manual screen-reader check are still to do.
- Decides (at the end of Phase 1): D-010 (UI framework), D-017 (graph
  library), part of ADR 0003. **No decision is proposed yet.**

## Setup

| | React candidate | Svelte candidate |
|---|---|---|
| Graph library | `@xyflow/react` 12.12.0 (MIT) | `@xyflow/svelte` 1.7.0 (MIT) |
| Framework | React 19.3.0 (MIT) | Svelte 5.57.1 (MIT) |
| Build | Vite 8.3.1, `@vitejs/plugin-react` 6.1.1 | Vite 8.3.1, `@sveltejs/vite-plugin-svelte` 7.3.1 |
| Bundle (JS, gzip) | **129.0 KB** | **73.5 KB** |

Versions are the newest at least two weeks old on 2026-10-12. Both run
inside the track B Tauri shell (Tauri 2.12.3, WebKitGTK 2.52.6, Pop!_OS
24.04). Both libraries share `@xyflow/system`, so they have the same
accessibility features. Both pages use the same shared code
(`graph/shared/`): process model, provisional large recipe, measurements,
navigation, and styles. Stages are nodes; additions are listed on their
stage (RECIPE_SCHEMA Q5).

## Automated results (`SPIKE_AUTO=1`)

| Step | React Flow | Svelte Flow |
|---|---|---|
| Sample recipe (8 stages) renders | 57 ms | already rendered when measuring began (not comparable) |
| Nodes focusable / labelled / described | 8/8/8 | 8/8/8 |
| Node role, role description | `group`, `node` | `group`, `node` |
| Keyboard: focus, Enter selects, ArrowRight ×5 moves | yes (25 px) | yes (25 px) |
| Non-drag alternative ("Move stage later" button, the `move_stage` equivalent) changes the order and announces it through a live region | yes | yes |
| Large recipe (provisional: 40 stages, 320 additions) renders | 65 ms | 60 ms |
| Large: all 40 nodes focusable, labelled, described | yes | yes |
| 60 frames of programmatic pan/zoom | 932 ms total, worst frame 17 ms | 953 ms total, worst frame 17 ms |

Both hold about 60 fps on WebKitGTK at the provisional large size.

## CI results (2026-10-13)

Run [38491921666](https://github.com/ctoepfer/carboy/actions/runs/38491921666),
`SPIKE_AUTO=1`, visible window: React Flow 12.12.0 / React 19.3.0 and Svelte
Flow 1.7.0 both **7/7 on macOS WKWebView** (`macos-latest`) and **7/7 on
WebKitGTK under xvfb** (`ubuntu-24.04`). Windows (WebView2) did not build
(missing `icon.ico`, since added). iOS WKWebView still needs a simulator or
device run.

## Findings

1. **Selection semantics differ.** After one node was selected, pressing
   Enter on a second node in React Flow **kept both selected**, and the
   spike's inspector (which reads the first selected node) moved the wrong
   stage. Svelte Flow replaced the selection. Either way, the editor needs
   an explicit rule ("toolbar actions apply to the most recently selected
   stage" or "disable single-stage actions while several are selected").
   Not a blocker for either library.
2. React logged a harmless `ResizeObserver loop completed with undelivered
   notifications` warning on load.
3. **Navigation:** clicking a navigation link between pages works in
   WebKitGTK. A scripted `location.replace` during the first page's
   in-flight requests ended the process with exit code 0 (the WebKit web
   process went away), so automated runs now open the window directly on the
   requested page. During the link test, extra page loads (back to the
   checks page, or React Flow loading twice) appeared in the log. They may
   have been clicks in the visible test window. Unconfirmed; rerun headless
   to check.
4. **Graph pages can't be measured in a hidden window** (2026-10-13): with
   `SPIKE_HIDDEN=1`, WebKitGTK doesn't run animation frames, so the
   measurements wait forever. Graph runs need a visible window (or a virtual
   display such as xvfb in CI).

## Accessibility tree check (AT-SPI, 2026-10-13)

`spikes/phase1/tools/atspi_check.py` reads the app's accessibility tree over
AT-SPI, the interface Orca reads, while the app runs on Linux (Orca 2.58
bindings, cosmic desktop).

**Both candidates, after the fixes below:** 8/8 stages exposed as role
`panel` with role description `node`, named "Stage N of 8: name, K
additions", focusable, and AT-SPI focus lands on the stage. The graph is
named "Process graph of …". The page has named navigation and regions,
headings, a polite live region (ours) and an assertive one (xyflow). Buttons:
Move stage earlier/later, Zoom In, Zoom Out, Fit View. Auto runs are still 7/7.

**Found and fixed in the spike:**

1. The library's default stage description says "Press delete to remove
   it", and Delete **did** remove a stage directly from the graph state,
   bypassing editor commands and review. Fixed: Delete is disabled
   (`deleteKeyCode={null}` / `deleteKey={null}`), and the description is
   Carboy's own (`ARIA_LABELS` in `graph/shared/process.js`). **Rule for the
   real editor:** the graph never deletes; removal is a command with review.
2. **Upstream quirk (both libraries, xyflow 12.12 / Svelte Flow 1.7):** with
   keyboard support **on**, the node description is read from the
   `node.a11yDescription.keyboardDisabled` key, and `default` is used when it
   is off (`A11yDescriptions`). The spike sets both keys to the same text.
   It's worth an upstream issue once confirmed against their docs.
3. Svelte Flow exposed 16 focusable buttons named "Handle" (connection
   points) although connecting is off; React Flow exposed none. Fixed with
   `aria-hidden="true"` on the handles.
4. The "Toggle Interactivity" control meant nothing to a brewer. Removed
   (`showInteractive={false}` / `showLock={false}`).

The Recipe and Library pages have labelled form fields ("Addition", "New
amount (kg)") and named buttons, and no unnamed focusable controls apart from
the webview's own scroll pane.

## Not yet checked

- **Orca speech, by ear.** The tree is right, but how Orca phrases it (and
  whether it speaks the live-region message after "Move stage later") still
  needs a person listening. Steps: start Orca (`orca`), run the app, open
  each graph page, Tab to a stage, press Enter, and Tab to "Move stage
  later". Expected: "Stage 1 of 8: Mash, 5 additions, node", the
  description, then "Mash moved to position 2 of 8".
- Mouse and touch drag feel, and pan versus drag conflicts (manual).
- iOS WKWebView and Android WebView (needs devices or CI).
- A large recipe sized from measured recipes (the 40-stage size is provisional).

## How to rerun

```sh
cd spikes/phase1/shell-tauri && ./prepare.sh && (cd src-tauri && ~/.cargo/bin/cargo build)
SPIKE_START=graph-react/index.html  SPIKE_AUTO=1 SPIKE_EXIT=1 SPIKE_REPORT=/tmp/react.json  src-tauri/target/debug/spike-shell
SPIKE_START=graph-svelte/index.html SPIKE_AUTO=1 SPIKE_EXIT=1 SPIKE_REPORT=/tmp/svelte.json src-tauri/target/debug/spike-shell
```
