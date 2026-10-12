# Carboy — Status Register

Updated: 2026-10-11

## Current phase

**Phase 0 (discovery and decisions) in progress.** Repository bootstrap done
2026-10-11: public repo `ctoepfer/carboy` and private repo
`ctoepfer/carboy-bridge` cloned; first commits pushed to `main` the same day;
planning documents moved into this repository, identity
configuration, invariants, public/private boundary, naming policy, developer
setup, license, and VS Code workspace created.

**No application code exists.** No language, framework, or build tool is
selected; ADRs 0003–0007 remain Proposed. There are therefore no build or test
entry points yet.

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

## Capability matrix

| Capability | Implemented | Simulated | Physically verified |
|---|---|---|---|
| Everything | — | — | — |

Reusable implementations exist in other projects (see the reuse baseline)
but nothing is ported or integrated.

## Supported platforms / beverages / devices

None yet. Targets proposed in D-006 and D-007.

## Immediate blockers

None for Phase 0 contract work. Before Phase 1: select the Recipe Core
language and application shell (ADRs 0003/0004) from Phase 1 spike evidence.

## Later dependencies (not blockers now)

- AI Bridge: planning lives in the private `carboy-bridge` repository
  (`docs/planning/`). It depends on this repository's recipe schema and edit
  command contract.
- Shop system contracts before Phase 11.
- Real hardware for Phases 9–10.
- Final product brand and trademark clearance before Phase 6 (D-013).

## Known limitations

- Platform facts reflect knowledge as of mid-2026; re-verify.
- Formula sources for non-beer calculations are not yet collected. Lumina's
  beer formulas cite no sources either (port map); primary sources for MCU,
  Morey, extract points, attenuation, ABV (131.25), and Tinseth still need
  collecting.
- brewconvert `master` is API-incompatible with Lumina's pin; the pinned
  commit `e0f9975a` is not in the local codesamples clone.
- Local disk on the development host (`/`) was 100% full on 2026-10-11; the
  repositories live on `/mnt/lumina_share`, which has space.

## Next task

Owner decisions first, then the formula coverage table.

1. Owner decisions recorded 2026-10-11: RECIPE_SCHEMA Q1, Q2, Q3 (D-022),
   Q5, Q5b, Q9 and EDITOR_COMMANDS E1–E6, all as recommended. Still open:
   Q4 (layout revisions; Phase 1 graph spike), Q6 (D-016 file extension),
   Q7 (D-019 gruit/soda), Q8 (NFC normalization; Phase 2).
2. Then: formula coverage table. Suggested prompt:

> Continue Carboy Phase 0. Read `AGENTS.md`, `docs/project/STATUS.md`,
> `docs/product/BEVERAGE_SCOPE.md`, and the Lumina port map in
> `docs/architecture/REUSE_BASELINE.md`. Write
> `docs/architecture/FORMULA_COVERAGE.md`: for each calculation in
> BEVERAGE_SCOPE, the formula, its primary published source (with a
> citation you have actually checked; otherwise "Needs confirmation"), its
> inputs, and the ingredient-property and stage-kind table rows it needs
> (RECIPE_SCHEMA §7.2–7.3). Start with Lumina's beer formulas. Propose D-006
> staging. No application code. Update STATUS.md, NEXT_ACTIONS.md, and
> DECISIONS.md.
