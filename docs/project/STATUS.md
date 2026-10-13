# Carboy — Status Register

Updated: 2026-10-12

## Current phase

**Phase 1 (platform proof) in progress since 2026-10-12.** The owner
directed moving on from Phase 0 that day. Phase 0's contracts and decisions
are done; the Phase 0 items not yet finished are carried with a target
phase (see "Carried from Phase 0" below), which satisfies Phase 0's exit
criterion that every open item has an owner and target.

Only **throwaway spike code** exists, under `spikes/phase1/`
([PHASE1_SPIKE_PLAN.md](PHASE1_SPIKE_PLAN.md)). No package, language, or
framework is selected; ADRs 0003–0007 remain Proposed until the spike
reports are in.

**Committed 2026-10-13:** all work through 2026-10-13 in this repository
is committed and pushed to `origin/main` (owner's instruction).
`carboy-bridge` still has uncommitted changes.

## Completed

| Date | Work | Verification |
|---|---|---|
| 2026-10-09 | Reviewed the v1.0 "Lumina Recipe App" plan against the Lumina recipes brain, brewconvert, and brewpanel | Inspection; [REUSE_BASELINE.md](../architecture/REUSE_BASELINE.md) |
| 2026-10-09 | Platform feasibility assessment | Desk assessment, not build-verified; [PLATFORM_FEASIBILITY.md](../architecture/PLATFORM_FEASIBILITY.md) |
| 2026-10-09 | Planning foundation: product brief, beverage scope, architecture overview, ADRs 0001–0007, phased plan v2.0, decision register | Documentation only |
| 2026-10-10 | AI Bridge planning outcomes folded in: Phase 0 revision envelope + hashing rule; Phase 2 core also runs server-side; Phase 13 package deliverable; D-022 | Documentation only |
| 2026-10-11 | Owner decisions D-001/D-002 (Apache-2.0), D-004 (repositories), D-008 (hosted macOS CI), D-013 (codename Carboy, configurable brand), D-021 (separate private Bridge service) | [DECISIONS.md](DECISIONS.md) |
| 2026-10-11 | brewconvert sized (5,671 lines; BeerXML port ≈ 3,400) and tested (137 passed); brewpanel tested on its working tree (142 passed, 2 skipped, 1 environmental failure); fixture and BJCP provenance classified | Test runs recorded in REUSE_BASELINE.md |
| 2026-10-11 | Repository bootstrap (this repo and `carboy-bridge`) and workspace `~/Documents/Workspaces/carboy.code-workspace` | Validation listed in the bootstrap report; JSON validated; no build/test tooling exists to run |
| 2026-10-11 | [GETTING_STARTED.md](GETTING_STARTED.md): ordered path from plan to first code and owner prerequisites; bootstrap committed and pushed | Documentation only; relative links checked |
| 2026-10-11 | Lumina port map for `stats_hooks.py`, `quantity.py`, `beerxml_quantity.py`, `import_validation.py`, `water_chemistry.py` in [REUSE_BASELINE.md](../architecture/REUSE_BASELINE.md#lumina-port-map-2026-10-11): formula, inputs/units, cited source, covering tests, and port hazards per function | Lumina tests in Lumina's `runtime/venv` (brewconvert at pin `e0f9975a`): 151 passed across 6 files. Against local codesamples `master` `0b5e05d`: 40 fail (changed `Diagnostic` API) |
| 2026-10-11 | Recipe schema v0 and revision envelope draft: [RECIPE_SCHEMA.md](../architecture/RECIPE_SCHEMA.md) (envelope, RFC 8785 + SHA-256 hashing rule, schema-version reader rules, D-022 proposal, typed quantities, provenance, statistics layers with `calculated` outside the hash, sidecars for service metadata) | Documentation only; no test vectors yet (Phase 2) |
| 2026-10-11 | Editor command contract v0 draft: [EDITOR_COMMANDS.md](../architecture/EDITOR_COMMANDS.md) (ID-targeted absolute commands, all-or-nothing application, channel-assigned provenance, diagnostics, semantic diff, proposal format, empty template, rebase with `concurrent-change` warnings, Lumina action mapping). RECIPE_SCHEMA Q5/Q9 isolated in a stage-kind table and an ingredient property table, each with a "Decision needed" note | Documentation only; Lumina `state.py`/`commands.py` read, not modified |
| 2026-10-12 | Sync protocol v0 outline: [SYNC_PROTOCOL.md](../architecture/SYNC_PROTOCOL.md) (discovery, pairing, change feed, batched idempotent push, tombstones, reconciliation, D-022 delivery, proposal acceptance; brand-neutral `/sync/v0` path). AI tool surface v0: [AI_TOOLS.md](../architecture/AI_TOOLS.md) (shared by tiers 1–3; SQ1–SQ4 and TQ1–TQ5 decided 2026-10-12) | Documentation only; co-reviewed against the private Bridge plan, nothing private copied |
| 2026-10-12 | Reference notes on Holle, *A Handbook of Basic Brewing Calculations* (MBAA 2003): [HOLLE_BREWING_CALCULATIONS.md](../references/HOLLE_BREWING_CALCULATIONS.md): formulas in our own words with cited primary sources, coverage against Lumina's hooks, errata | Every worked example recomputed; 15 errata recorded. Checked against an owner-supplied OCR transcription, not print. The book is all-rights-reserved, so the transcription is not committed |
| 2026-10-12 | Formula coverage draft: [FORMULA_COVERAGE.md](../architecture/FORMULA_COVERAGE.md): every BEVERAGE_SCOPE calculation with a source status (primary / secondary checked / web-only / needs source), inputs, first property-table rows, stage parameters, proposed D-006 gating; open FQ1–FQ4 | Documentation only. Holle checked; Morey, Tinseth, and SG ↔ °P found only in web secondary sources (the original Tinseth page is retired); ABV and all wine/mead/cider formulas still need sources |
| 2026-10-12 | Owner accepted SQ1–SQ4, TQ1–TQ5, FQ1–FQ4 and D-006 (gated per statistic) | [DECISIONS.md](DECISIONS.md) |
| 2026-10-12 | **Phase 1 track A:** pure TypeScript core spike (`spikes/phase1/recipe-core/`): BigInt decimals, exact unit factors, RFC 8785 JCS + SHA-256, UUIDv7, revision envelope with writer and reader rules, native file round trip, Lumina points-method OG as a parity variant | `npm test`, Node 20.20.2: **10/10 pass**, including every RFC 8785 vector (copied from the RFC text) and a Lumina parity fixture produced by running Lumina's own code read-only on Verdant Reverie (OG 1.064 in both; points agree within 1e-9 relative) |
| 2026-10-12 | **Phase 1 track B, Linux:** Tauri 2.12.3 shell spike (`spikes/phase1/shell-tauri/`) runs the unchanged track A build in WebKitGTK; SQLite via `tauri-plugin-sql` 2.5.0; native file export/import through two Rust commands | Built with Rust 1.99 (rustup, user install); run twice on Pop!_OS 24.04 / WebKitGTK 2.52.6: **5/5 checks both runs**; run 1 saved the revision, run 2 reopened it from SQLite and the hash verified |
| 2026-10-12 | **Phase 1 track C (automated part), Linux:** React Flow 12.12.0 + React 19.3.0 vs. Svelte Flow 1.7.0 + Svelte 5.57.1, same page and shared code (`spikes/phase1/graph/`), inside the Tauri shell | `SPIKE_AUTO=1` runs: **both 7/7**. All nodes focusable and labelled; keyboard select and move; non-drag "Move stage later" with live-region announcement; provisional large recipe (40 stages, 320 additions) about 60 ms; pan/zoom at about 60 fps (worst frame 17 ms). Bundles 129 KB vs. 73.5 KB gzip. Findings in [GRAPH_REPORT.md](../../spikes/phase1/GRAPH_REPORT.md) |
| 2026-10-12 | Spike shell interface: navigation bar on every page; **Recipe** page (default) shows sources, calculated OG labelled as the parity variant, and save-to-library / export / import buttons; Core checks; two graph pages | Pages load without webview errors; nav link clicks work. Recipe buttons smoke-tested only |
| 2026-10-13 | Recipe page buttons automated (save to library, export, import) | Hidden-window auto run: all three report success; OG 1.064 |
| 2026-10-13 | **Library page** (new nav entry): lists the SQLite library, re-verifies every revision's hash, and shows the integrity check and journal mode. **Interruption test for ADR 0006:** write revisions in a loop, SIGKILL the app after 4 s, relaunch and verify | 3 rounds: integrity `ok` every time, journal mode `wal`, 739 → 1,489 → 2,232 revisions, **all verified, no partial rows**. Not tested: power loss (`synchronous` setting still to decide) |
| 2026-10-13 | Hidden-window automated runs (`SPIKE_HIDDEN=1`) | Work for the checks, Recipe, and Library pages. **Graph pages hang when hidden**: WebKitGTK doesn't run animation frames for a hidden window, so graph runs need a visible window |
| 2026-10-13 | Manual-only CI workflow `.github/workflows/phase1-spike.yml` (`workflow_dispatch`): core tests on Ubuntu; shell build and webview runs on Ubuntu (xvfb), Windows, macOS; reports uploaded as artifacts | YAML parsed locally. **Never run**: needs pushing and the owner starting it (macOS minutes may cost money) |
| 2026-10-13 | Fixed test timestamp: fixtures used 1760227200000 ms (2025-10-12) beside 2026 dates; now 1791763200000 (2026-10-12) | Core tests 10/10 |
| 2026-10-13 | **First editor-command code (spike):** `applyCommands` with `set_addition_amount` in `spikes/phase1/recipe-core/src/commands.ts`: ID targets, normalized decimal strings only, unknown members and ops rejected, all or nothing, semantic diff with recalculated OG | Core tests **14/14** (4 new: apply and diff, all-or-nothing rejection naming the failing command index, encoding rules) |
| 2026-10-13 | **Recipe page Edit control:** choose an addition, enter an amount, Preview change (diff and OG before → after, nothing stored), Save as new revision (child with `parents` = previous); the UI normalizes what was typed | Hidden auto run: invalid input refused with a message; 4.30913 kg → 5 kg previews OG 1.064 → 1.071 (checked by hand: +7.6 points); child revision's parent correct; reopened from SQLite editable with the new amount; export/import still pass |
| 2026-10-13 | **Screen-reader structure check** of every page through AT-SPI, the tree Orca reads (`spikes/phase1/tools/atspi_check.py`). Fixed in both graph candidates: Delete removed stages directly (now disabled; the graph never deletes), a misleading library description, 16 stray "Handle" buttons in Svelte Flow, a "Toggle Interactivity" control. Found an upstream key swap in xyflow's description lookup | After fixes: 8/8 stages named "Stage N of 8: …", focusable, focus lands; Carboy's description read; only meaningful buttons; auto runs still 7/7; Recipe and Library fields and buttons named. Speech by ear still to do ([GRAPH_REPORT.md](../../spikes/phase1/GRAPH_REPORT.md#accessibility-tree-check-at-spi-2026-10-13)) |
| 2026-10-13 | Usability, accessibility, and localization plan v0: [USABILITY.md](../architecture/USABILITY.md) (rules U1–U12; how assistive technology reaches Carboy through each OS accessibility API; build rules incl. spoken units and live-region pacing; other-software channels; message catalogs, language packs, locale vs. units vs. number input; GUI feature plan by phase; proposed Phase 1 measurements; UQ1–UQ11; open as D-023) | Documentation only; platform and library claims marked verified or to verify |
| 2026-10-13 | Extension model: [ADR 0008](../architecture/adr/0008-extension-model.md) (Proposed; D-024): tiers A data-only packs/themes, B external integrations, C build-time modules after 1.0, D runtime plugins not planned; built-in modules register through one point; control rules | Documentation only; consistent with ADR 0001 |
| 2026-10-13 | Repository setup review: README brought up to Phase 1; `.gitattributes` (LF everywhere, `**/fixtures/**` byte-exact, binaries); [SECURITY.md](../../SECURITY.md) (private reporting, scope, hardware safety); `phase1-spike.yml` actions pinned to commit SHAs (latest v4 releases, no major upgrade); open D-025 telemetry/privacy, D-026 alcohol obligations, D-027 hardware safety; four risks added to PROJECT_PLAN §7 | `git add --renormalize .` changed no files; workflow YAML parses. Owner applied the GitHub settings; verified through the API: private vulnerability reporting on, Dependabot alerts and security updates on, wiki off, `main` protected (no force-push or deletion, admins included, no review requirement), Actions limited to GitHub-made and verified |
| 2026-10-13 | `spikes/phase1/spike.sh`: `start [page]`, `refresh`, `test`, `reset-data` (never runs git; checks for Node, cargo, WebKitGTK) | `spike.sh test`: core 14/14; checks 5/5; recipe pass; library all revisions verified, integrity ok; graph-react 7/7; graph-svelte 7/7 |

## Capability matrix

| Capability | Implemented | Simulated | Physically verified |
|---|---|---|---|
| Everything for users | — | — | — |
| Spike only: core in Node and WebKitGTK; SQLite save/reopen and native file round trip on Linux | Spike (throwaway) | — | Linux desktop only |
| Spike only: process graph (two candidates) with keyboard and non-drag editing | Spike (throwaway) | — | Linux desktop only; accessibility tree checked over AT-SPI; Orca speech not yet heard |
| Spike only: SQLite library survives process kill during writes | Spike (throwaway) | — | Linux desktop only; not power loss |

## Supported platforms / beverages / devices

None yet. Targets proposed in D-007. Spike verified on Linux desktop only.

## Immediate blockers

- Windows, macOS, iOS, and Android spike runs need the owner's Phase 1
  prerequisites: GitHub Actions with macOS runners, and test devices
  ([PHASE1_SPIKE_PLAN.md](PHASE1_SPIKE_PLAN.md#owner-prerequisites)).
- The performance budget and the large-recipe graph test need more of the
  owner's recipes as fixtures.

## Carried from Phase 0

| Item | Owner | Target |
|---|---|---|
| Performance budgets (measured) | Agent, with the owner's recipes | Phase 1 (spike plan step 3) |
| D-016 native file extension and media type (spikes use `.json`) | Owner | End of Phase 1 |
| RECIPE_SCHEMA Q4 (layout-only edits) | Owner, from graph spike | Phase 1 |
| Citable sources for Morey, Tinseth, ABV, SG ↔ °P, Brix ↔ SG, non-beer sugars | Agent | Before Phase 2 formulas ship |
| Ingredient property and stage-kind tables (seeded in FORMULA_COVERAGE) | Agent | Phase 2 |
| Lumina ⇄ Carboy field mapping; brewconvert oracle revision; remaining reuse-matrix rows | Agent | Phase 2 |
| D-019 (`soda`/`gruit`), RECIPE_SCHEMA Q8 (NFC) | Owner | Phase 2, before schema 1.0 |
| D-009 ingredient catalog; D-020 style data terms | Owner | Phase 3 |

## Later dependencies (not blockers now)

- AI Bridge: planning lives in the private `carboy-bridge` repository
  (`docs/planning/`). It depends on this repository's recipe schema and edit
  command contract.
- Shop system contracts before Phase 11.
- Real hardware for Phases 9–10.
- Final product brand and trademark clearance before Phase 6 (D-013).

## Known limitations

- Platform facts reflect knowledge as of mid-2026; re-verify.
- Formula sources: see FORMULA_COVERAGE.md for each formula's status. Holle
  covers MCU, the mass extract method, water, mashing, and carbonation; Morey,
  Tinseth, ABV, SG ↔ °P, and all non-beer formulas still need citable sources.
- brewconvert `master` is API-incompatible with Lumina's pin; the pinned
  commit `e0f9975a` is not in the local codesamples clone.
- Development host: `/` had 111 GB free on 2026-10-12 (it was full on
  2026-10-11). Rust is installed per user in `~/.cargo` (not on `PATH` by
  default; use `~/.cargo/bin/cargo`). No Android SDK, Xcode, or `sqlite3` CLI.
- Agent tooling note: `\u` escape sequences written through some agent
  tools are decoded before they reach the file. Test vectors with escapes are
  therefore kept in fixture files extracted verbatim from their source.

## Next task

**Working rule (owner, 2026-10-12):** keep this file current as work
lands, and add interface and navigation elements to the spike shell as
each capability starts working (PHASE1_SPIKE_PLAN "Interface growth").

1. **(owner)** Review [USABILITY.md](../architecture/USABILITY.md): accept
   U1–U12, answer UQ1–UQ11 (or defer), and say whether to add its §5
   measurements to the Phase 1 spike. Review ADR 0008 (D-024). Commit decision for `carboy-bridge` (this repository was
   committed and pushed 2026-10-13); Phase 1 prerequisites (GitHub Actions with macOS
   runners; devices; more recipe fixtures); listen to Orca on both graph
   pages and try drag and pan (the accessibility tree is already verified;
   steps and expected speech in GRAPH_REPORT.md "Not yet checked").
2. **Agent, next steps, in order:**
   a. Rerun the navigation test to settle GRAPH_REPORT finding 3. Graph pages
      need a visible window, so either the owner keeps hands off the test
      window, or a nested display server is installed (`xvfb-run` isn't
      present on this host and installing it needs sudo).
   b. ADR 0006 power-loss question: compare SQLite `synchronous=FULL` vs.
      `NORMAL` under WAL (write-throughput cost on the Library stress page),
      and write a recommendation with sources.
   c. Next capabilities for the interface, smallest first: **undo/redo** of
      the last edit on the Recipe page (re-apply the previous content as a
      new child revision, or step back before saving); a **History** view on
      the Library page that groups revisions by recipe and shows parent
      links; then a second command (`add_addition` or `set_target` for batch
      volume), each with Node tests first.
   d. If the owner approves USABILITY §5: measure media-query, `Intl`, zoom,
      and axe-core results in the Tauri shell on Linux; trial the two message
      formats on the Recipe page in React and Svelte (feeds D-010, UQ2).
   e. Performance budget once the owner's recipes arrive; resize the large
      recipe and rerun track C.
3. When the owner has pushed and enabled Actions: run
   `.github/workflows/phase1-spike.yml` manually and record the per-OS
   results here (spike plan step 5).
