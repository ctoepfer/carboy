# Phase 1 spikes (throwaway)

Evidence for ADRs 0003, 0004, and 0006.

**Quick start:** `./spikes/phase1/spike.sh start` (builds what's needed and
opens the app on the Recipe page). Also `spike.sh refresh` (reinstall pinned
dependencies and rebuild, e.g. after pulling), `spike.sh test` (core tests
plus automated runs of every page; graph pages open a window briefly), and
`spike.sh reset-data`. The script never runs git. Each Recipe test run saves
revisions, so the Library count grows; `reset-data` clears it. Plan and status:
[SPIKE_PLAN.md](SPIKE_PLAN.md).
Nothing here is a package or a decided layout. It is deleted or archived
once those ADRs are decided.

## `recipe-core/`: track A

A pure TypeScript core with no dependencies. Its tsconfig loads no DOM or
Node typings. The only host APIs it uses are `crypto.subtle.digest`,
`crypto.getRandomValues`, and `TextEncoder` (declared in
`src/platform.d.ts`), which are available in every target webview and in
Node ≥ 19.

| Module | What it proves |
|---|---|
| `decimal.ts` | Exact BigInt decimals, normalized strings (RECIPE_SCHEMA §3 rule 3), half-even rounding, 34-digit division |
| `units.ts` | brewconvert's exact mass and volume factors |
| `gravity.ts` | Lumina's points-method OG as a **parity variant only** (not approved for users; FORMULA_COVERAGE FQ2). Unknown inputs give "cannot compute" |
| `jcs.ts`, `hash.ts` | RFC 8785 canonical JSON and SHA-256 |
| `uuid.ts` | UUIDv7 |
| `commands.ts` | Spike subset of the editor command contract: `set_addition_amount` with encoding rules, all-or-nothing application, diagnostics, and a semantic diff with recalculated OG |
| `revision.ts` | Envelope, writer rules (no floats, no null, NFC), native file export and import with the reader rules (hash mismatch and newer MINOR open read-only; newer MAJOR is rejected) |

```sh
cd spikes/phase1/recipe-core
npm install      # TypeScript 5.9.3, the only dependency (dev)
npm test         # tsc, then node --test (Node 20+)
```

**Result 2026-10-13, Node 20.20.2 on Linux: 14/14 pass** (10 on 2026-10-12, plus 4 command tests).

- RFC 8785 vectors: the §3.2.2–§3.2.4 sample (canonical text and all 118
  UTF-8 bytes), the §3.2.3 sorting vector, and all Appendix B number
  samples. The vectors were copied from the RFC text into `fixtures/`.
- Lumina parity: `fixtures/verdant-reverie-og.json` was produced by running
  Lumina's own importer and stats code read-only on the owner's Verdant
  Reverie BeerXML (provenance in the file). The spike's exact-decimal
  points agree with Lumina's float to better than 1e-9 relative, and OG
  rounded to 3 places is 1.064 in both.

## `shell-tauri/`: track B (Linux so far)

A Tauri 2 app whose webview loads the **unchanged** track A build
(`prepare.sh` copies `recipe-core/dist` and `fixtures` into `ui/`). Plain ES
modules, no bundler, no npm packages. The Rust side is thin: two file
commands for native export and import, a report hook, and
`tauri-plugin-sql` (SQLite) called through `invoke("plugin:sql|…")`.
Pinned: `tauri` 2.12.3, `tauri-build` 2.7.2, `tauri-plugin-sql` 2.5.0
(all Apache-2.0 OR MIT). The identifier `invalid.spike.phase1-shell` is a
throwaway placeholder.

```sh
cd spikes/phase1/shell-tauri
./prepare.sh                                   # builds track A and both graph candidates into ui/
(cd src-tauri && ~/.cargo/bin/cargo build)     # needs Rust and WebKitGTK 4.1 dev libraries
src-tauri/target/debug/spike-shell             # interactive: opens on the Recipe page
SPIKE_START=index.html SPIKE_AUTO=1 SPIKE_EXIT=1 SPIKE_REPORT=/tmp/report.json src-tauri/target/debug/spike-shell
```

**Pages** (navigation bar on every page; add a page to
`graph/shared/nav.js` when a capability works):

| Page | Shows |
|---|---|
| Recipe (`recipe.html`, default) | Verdant Reverie sources and calculated OG (labelled as the parity variant). **Edit**: change one addition's amount, preview the diff and OG, and save as a child revision. Buttons to save to the SQLite library, export, and import |
| Library (`library.html`) | Every revision in the SQLite library, re-verified on open; integrity check and journal mode. `SPIKE_STRESS=N` writes N revisions (used for the kill-during-write test) |
| Core checks (`index.html`) | The track A checks run inside the webview |
| Process graph: React Flow / Svelte Flow | Track C candidates ([GRAPH_REPORT.md](GRAPH_REPORT.md)) |

**Environment switches** (read by Rust commands, so automated runs never
navigate in-page): `SPIKE_START` (page path to open), `SPIKE_AUTO=1` (run
measurements and report), `SPIKE_REPORT` (report file), `SPIKE_EXIT=1`
(exit after reporting), `SPIKE_NAV` (the checks page clicks the nav link
with this label), `SPIKE_HIDDEN=1` (no visible window; works for every page
except the graph pages, whose animation frames don't run when hidden),
`SPIKE_STRESS=N` (Library page). Webview errors go to stderr as `[webview] …`.

Kill-during-write test (ADR 0006), as run on 2026-10-13:

```sh
E=src-tauri/target/debug/spike-shell
SPIKE_HIDDEN=1 SPIKE_START=library.html SPIKE_STRESS=100000 timeout -s KILL 4 $E
SPIKE_HIDDEN=1 SPIKE_START=library.html SPIKE_AUTO=1 SPIKE_EXIT=1 SPIKE_REPORT=/tmp/lib.json $E
```

For the checks page, run it twice: the first run saves a revision to
SQLite, and the second reopens and verifies it. The app data lives in
`~/.local/share/invalid.spike.phase1-shell/`; delete it to start over.

**Result 2026-10-12, Pop!_OS 24.04, WebKitGTK 2.52.6, Rust 1.99, first
build 1 min 27 s: 5/5 checks on both runs.** The checks were the RFC 8785
sample bytes, Appendix B numbers, Lumina OG parity, native file round trip
through Rust, and SQLite save then reopen with hash verification.

Not yet shown: Windows, macOS, Android, iOS; release builds and bundles.
Recipe page buttons are exercised by an auto run (all pass, 2026-10-13).
CI for Windows, macOS, and Linux: `.github/workflows/phase1-spike.yml`
(manual trigger, never run yet).

## `tools/`

`atspi_check.py`: reads the running app's accessibility tree over AT-SPI
(the tree Orca reads) and reports stage names, descriptions, focus, buttons,
live regions, form labels, and unnamed focusable controls. It uses the
system Python (`/usr/bin/python3`, needs python3-gi). Usage is in its
docstring.

## `graph/`: track C

React Flow and Svelte Flow versions of the same page, built with Vite into
`shell-tauri/ui/graph-*`. Shared code is in `graph/shared/`. Results:
[GRAPH_REPORT.md](GRAPH_REPORT.md) (interim: both 7/7 on WebKitGTK).
