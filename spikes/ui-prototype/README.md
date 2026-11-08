# UI prototype (throwaway)

An interactive prototype of the Recipe Library, Recipe Editor, and change
review, for the proposal in [UI_DESIGN.md](../../docs/product/UI_DESIGN.md).
It exists to try the design with real people and real assistive technology.
It is **not** production code, is not wired to Recipe Core, the Recipe Library,
or the shell, and chooses no framework, graph library, or message format.

## Open it

No build, no install, no network. Open `index.html` in a browser, by double-
clicking it or from a terminal:

```sh
xdg-open spikes/ui-prototype/index.html      # Linux
open spikes/ui-prototype/index.html          # macOS
start spikes\ui-prototype\index.html         # Windows
```

To test the platform's webview engine, use GNOME Web (or another WebKitGTK
browser) on Linux, Safari on macOS, and Edge on Windows. A browser is close to
the webview but not the same; the real check repeats in the shell in Phase 4.

*Reset sample data* in **Prototype controls** (bottom of the rail) starts
over. Theme and density are remembered in the browser; nothing else is stored.

## What is simulated

Marked in the page with a dashed *Simulated* badge or border:

- **No calculations.** Recipe Core isn't loaded. Statistics show their state
  only: *Recipe Core not connected here*, *Not calculated: no accepted formula
  yet* (D-006), or *Can't calculate. Missing: …*. Numbers shown are *Stated
  estimates* from the recipe's source document.
- **Editing** applies simplified stand-ins for editor commands to an in-memory
  draft. Core's validation (process order, units per ingredient) isn't run.
- **Saving** copies the draft into an in-memory revision. Reloading the page
  loses everything. *Make saving fail* shows the error state.
- **Graph**: a plain stand-in for selection and keyboard behaviour. No graph
  library is chosen (D-017); dragging isn't shown.
- **The suggestion** on the Belgian Dubbel is a made-up example of an AI
  proposal, to show review. Nothing generated it.
- **Catalog**: none (D-009). New ingredients are custom, with unknown
  properties.

Not in the prototype: editing steps and timing, revision history, import,
scaling, equipment profiles, printing, guided creation.

## Sample data

From [`data.js`](data.js): the all-grain example recipes and the extract
American Pale Ale from [EXAMPLE_BEER_RECIPES.md](../../docs/product/EXAMPLE_BEER_RECIPES.md)
(unbrewed examples; their figures are external estimates); the owner's
Ultimate Coffee Schwarzbier as far as
`fixtures/parity/lumina/ultimate-coffee-schwarzbier.json` records it (grain,
hops, batch volume; no culture or process, so it shows real missing data);
and a synthetic long recipe for layout testing, labelled *do not brew*.

## Files

| File | What |
|---|---|
| `index.html` | Page shell: rail, main view, status bar, dialogs |
| `tokens.css` | Proposed design tokens: light, dark, increased contrast, density |
| `app.css` | Components, using only the tokens |
| `messages.js` | Every UI string, by key (rule U8) |
| `data.js` | Sample recipes (user content, U12) |
| `app.js` | Views, simplified commands, undo, diff, validation, keyboard |
| `tools/check.js` | Scripted checks with an existing Playwright; installs nothing |

## Scripted checks

```sh
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node spikes/ui-prototype/tools/check.js chromium,firefox
```

Results on 2026-11-07 (Linux, Chromium 149, Firefox 150): 62 of 62 checks pass
in both; axe-core 4.13.0 reports no violations. See UI_DESIGN.md §6 for what
that does and doesn't cover.

## Testing by hand

Use the task list in [UI_DESIGN.md §7](../../docs/product/UI_DESIGN.md#7-usability-checklist).
On macOS, the shortcuts use Cmd instead of Ctrl. F6 may stay with the browser
(address bar) rather than the page; that is a browser limit, not the design.
Report in this form:

```text
Prototype commit:
Machine and OS version:
Browser (engine) and version:
Assistive technology and version, if used:
Settings changed (zoom, text size, theme, contrast):

Tasks T1–T14: pass / fail / not run, with a note for each fail
Settings S1–S6: pass / fail / not run
Screen reader R1–R8: pass / fail / not run, with what was actually spoken
Observations [P]: what the person said or did, in their words where possible
Defects: steps, expected, actual
```
