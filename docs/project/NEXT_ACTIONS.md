# Carboy — Next Actions

Updated: 2026-10-13. Ordered. Owner decisions are marked **(owner)**.

## Phase 0 — Discovery and decisions

### Owner

- [x] D-001/D-002 Apache-2.0, D-004 repositories, D-008 hosted macOS CI,
      D-013 codename Carboy, D-021 separate private Bridge (2026-10-11).
- [x] Repositories `ctoepfer/carboy` (public) and `ctoepfer/carboy-bridge`
      (private) exist and are cloned locally.
- [x] **(owner)** Review and commit the bootstrap in both repositories
      (first commits pushed to `main` on 2026-10-11).
- [ ] **(owner)** Phase 1 prerequisites listed in
      [GETTING_STARTED.md](GETTING_STARTED.md#what-is-needed-from-the-owner)
      (devices, GitHub Actions, later store accounts).
- [ ] **(owner)** Choose the final product brand later; set it in
      `identity/identity.json`. Register domains for that brand then.
- [ ] **(owner, before Phase 6)** Manual USPTO search and attorney clearance
      in classes 9 and 42 for the chosen brand (research notes in the private
      `carboy-bridge` repository).

### Discovery

- [x] Size brewconvert and the BeerXML port (≈ 3,400 lines).
- [x] Run brewconvert (137 passed) and brewpanel (142 passed, 2 skipped,
      1 environmental) suites.
- [x] Locate fixtures and classify provenance; BJCP data is codes/names only.
- [x] Verdant Reverie and Ultimate Coffee Schwarzbier are the owner's; publishable.
- [x] Map Lumina's port surface (2026-10-11): per-function port map in
      `REUSE_BASELINE.md`; Lumina cites no formula sources.
- [x] Reference notes on Holle's *Handbook of Basic Brewing Calculations*
      (`docs/references/HOLLE_BREWING_CALCULATIONS.md`, 2026-10-12): covers
      MCU (Daniels), the mass-based extract method, Kolbach residual
      alkalinity, mashing and carbonation; lists the primary sources it cites.
- [ ] Collect primary sources for Lumina's beer formulas still uncovered
      (Morey SRM, Tinseth IBU, ABV 131.25, exact SG ↔ °P) and confirm
      Tinseth's gravity and volume inputs. Check Holle's page-specific
      items against print. Feeds the formula coverage table.
- [ ] Choose the brewconvert revision that is the BeerXML port oracle;
      record why (`master` `0b5e05d` vs. Lumina's pin `e0f9975a`).
- [ ] Complete the reuse matrix in `docs/architecture/REUSE_BASELINE.md` for
      every remaining asset (license, provenance, intent, size).
- [ ] Ingredient catalog sources (D-009): candidate datasets with licenses.

### Contracts

- [x] Recipe schema v0 and revision envelope draft
      (`docs/architecture/RECIPE_SCHEMA.md`, 2026-10-11).
- [x] **(owner)** RECIPE_SCHEMA Q1 (UUIDv7), Q2 (brewconvert unit tokens),
      Q3 (D-022) decided 2026-10-11.
- [x] Editor command contract v0 draft (`docs/architecture/EDITOR_COMMANDS.md`,
      2026-10-11); doubles as the AI proposal contract (ADR 0007).
- [x] **(owner)** RECIPE_SCHEMA Q5 (timing points) and Q9 (closed property
      table plus `unmapped`) decided 2026-10-11.
- [x] **(owner)** RECIPE_SCHEMA Q5b and EDITOR_COMMANDS E1–E6 decided
      2026-10-11 (recommendations accepted).
- [x] Sync protocol v0 outline (`docs/architecture/SYNC_PROTOCOL.md`) and
      AI tool surface v0 (`docs/architecture/AI_TOOLS.md`), 2026-10-12.
- [x] **(owner)** SYNC_PROTOCOL SQ1–SQ4 and AI_TOOLS TQ1–TQ5 decided 2026-10-12 (recommendations accepted).
- [ ] Draft the stage-kind table and ingredient property table rows from
      the formula coverage table (only rows a cited formula or an import
      format needs).
- [x] Formula coverage table draft (`docs/architecture/FORMULA_COVERAGE.md`,
      2026-10-12) with source status per formula and a proposed D-006 gate.
- [x] **(owner)** FORMULA_COVERAGE FQ1–FQ4, then D-006 (accepted 2026-10-12).
- [ ] Citable sources for the blocked statistics (Morey, Tinseth, ABV,
      SG ↔ °P, Brix ↔ SG, non-beer sugar contributions).
- [ ] Lumina ⇄ Carboy field mapping draft, including legacy imperial fields.
- [ ] Decide D-016 (native file extension / media type; brand-neutral) and
      D-019 (`soda`/`gruit`) (RECIPE_SCHEMA Q6/Q7). Q8 (NFC) targets Phase 2;
      Q4 (layout revisions) the Phase 1 graph spike.
- [ ] Phase 1 spike plan: Recipe Core language and shell candidates (ADRs
      0003/0004), graph library and UI framework candidates, devices, CI matrix.

## Phase 1 — Platform proof (active since 2026-10-12)

Plan: [PHASE1_SPIKE_PLAN.md](PHASE1_SPIKE_PLAN.md). Spike code: `spikes/phase1/`.

- [x] Track A: TypeScript core spike, 10/10 tests in Node (2026-10-12).
- [x] Track B on Linux: Tauri 2 shell runs the same build in WebKitGTK;
      SQLite save/reopen and native file round trip, 5/5 checks (2026-10-12).
- [x] **(owner)** Commit and push this repository (2026-10-13). `carboy-bridge` still uncommitted.
- [ ] **(owner)** GitHub Actions with macOS runners; Windows, Android, iOS
      test access; more recipe fixtures with publish notes.
- [x] Track C automated part on WebKitGTK: both candidates 7/7
      (`spikes/phase1/GRAPH_REPORT.md`, interim, 2026-10-12).
- [x] Spike shell navigation and a Recipe page surfacing current capabilities (2026-10-12).
- [x] Accessibility tree of every page checked over AT-SPI; four graph issues fixed (2026-10-13).
- [ ] **(owner)** Listen with Orca on both graph pages; try drag and pan (steps in GRAPH_REPORT.md).
- [x] Recipe page buttons automated (2026-10-13).
- [x] Library page; kill-during-write test, 3 rounds, all verified (2026-10-13).
- [x] Manual-only CI workflow written (`.github/workflows/phase1-spike.yml`); never run.
- [ ] Rerun the navigation test without interference (GRAPH_REPORT finding 3).
- [ ] SQLite `synchronous` setting for power loss (ADR 0006).
- [x] Recipe page Edit control: one editor command with preview, diff, and a child revision (2026-10-13).
- [ ] Undo/redo on the Recipe page; History view on the Library page; a second command.
- [ ] Performance budgets from measured recipes; define the "large recipe".
- [ ] **(owner)** Push, enable Actions, and start `phase1-spike`; then record the results.
- [ ] Track B on Windows, macOS, Android, iOS (simulator runs marked as such).
- [ ] Tracks D (sidecar) and E (secrets, file associations, HTTP).
- [ ] Spike reports → decide ADRs 0003, 0004, 0006, D-010, D-017, Q4, D-016.

## Not now

No packages, language workspaces, framework scaffolding, or OS bundle
identifiers outside `spikes/` until the Phase 1 spike selects the toolchain
(ADRs 0003/0004) and the conventions are reviewed.
