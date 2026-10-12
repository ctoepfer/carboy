# Getting Carboy going

Updated: 2026-10-11. This page answers one question: **what has to happen,
in what order, to get from today's plan to working code?** It links to the
detailed documents rather than repeating them. For where the project stands
right now, read [STATUS.md](STATUS.md).

## Where things stand

- Phase 0 (discovery and decisions) is in progress. There is no application code.
- The license (Apache-2.0), the repositories, macOS CI (hosted runners), and the
  codename are decided ([DECISIONS.md](DECISIONS.md)).
- No language, framework, or build tool is selected. ADRs 0003–0007 are Proposed.
  Do not scaffold packages or tooling until the Phase 1 spike selects them
  ([AGENTS.md](../../AGENTS.md)).

## The path to first code

| Step | What "done" means | Detail |
|---|---|---|
| 1. Finish Phase 0 discovery | Lumina port map and the full reuse matrix are written; ingredient catalog candidates are listed with licenses (D-009) | [NEXT_ACTIONS.md](NEXT_ACTIONS.md), [REUSE_BASELINE.md](../architecture/REUSE_BASELINE.md) |
| 2. Write the contracts | Recipe schema v0 and revision envelope, canonical JSON and hashing rule, and edit command contract v0 (which doubles as the AI proposal format) exist as drafts | [PROJECT_PLAN.md](PROJECT_PLAN.md) Phase 0 |
| 3. Close Phase 0 decisions | D-006 beverage staging (formula coverage table with cited sources), D-016 file extension and media type, D-019, and performance budgets measured from real workloads | [DECISIONS.md](DECISIONS.md) |
| 4. Plan the Phase 1 spike | A written spike plan: Recipe Core language and shell candidates, graph library × UI framework, devices, and CI matrix | ADRs [0003](../architecture/adr/0003-application-shell.md), [0004](../architecture/adr/0004-typescript-recipe-core.md) |
| 5. Run the Phase 1 spike | Minimal app edits one quantity, computes one verified result, saves and reopens, and exports a native file on every target. The graph spike meets the accessibility and performance bars | [PROJECT_PLAN.md](PROJECT_PLAN.md) Phase 1, [PLATFORM_FEASIBILITY.md](../architecture/PLATFORM_FEASIBILITY.md) |
| 6. Accept the toolchain ADRs | 0003, 0004 and 0006 move to Accepted or are revised from spike evidence | [adr/README.md](../architecture/adr/README.md) |
| 7. First real code | Workspace, packages, CI build/test matrix, `.vscode/extensions.json`, and [SETUP.md](../development/SETUP.md) updated with install/build/test commands | Phase 2 starts |

Steps 1–4 are documentation and research. Step 5 is the first code, and it is
throwaway spike code.

## What is needed from the owner

| When | Need | Notes |
|---|---|---|
| Now | Review and commit the bootstrap | Done 2026-10-11 (first commit on `main`) |
| Phase 0 | Decisions D-006, D-009, D-016, D-019, D-020 | Agents prepare options and sources; the owner decides |
| Phase 0 | Fixture recipes beyond the two already cleared | The owner has more recipes available. Each one needs a publish/no-publish note |
| Phase 1 | Test devices: a Windows machine or VM, an Android device, an iOS device or simulator access | iOS and macOS builds run on hosted macOS CI (D-008) |
| Phase 1 | Enable GitHub Actions (including macOS runners) on this repository | Hosted macOS minutes may cost money; check the plan's limits |
| Before macOS/iOS distribution | Apple Developer Program ($99/yr) | Needed for notarization and any iOS install outside development |
| Before Windows release | Code-signing option (certificate or a hosted signing service) | Avoids SmartScreen warnings |
| Before Android release | Google Play developer account ($25 once); closed test with testers before production | F-Droid is an alternative channel |
| Before Phase 6 | Final brand, set in [`identity/identity.json`](../../identity/identity.json); trademark clearance | [NAMING.md](../architecture/NAMING.md) |

Store fees and rules are from [PLATFORM_FEASIBILITY.md](../architecture/PLATFORM_FEASIBILITY.md)
(mid-2026). Re-verify them when targets are fixed.

## What a contributor needs

- A clone of this repository. Nothing else is required: it never depends on
  the private service ([PUBLIC_PRIVATE_BOUNDARY.md](../architecture/PUBLIC_PRIVATE_BOUNDARY.md)).
- Read access to the public source projects that Recipe Core ports from
  (brewconvert, brewpanel in [ctoepfer/codesamples](https://github.com/ctoepfer/codesamples)).
  Work derived from the private Lumina code is done by the owner, who holds it.
- Until Phase 1 picks a toolchain: a text editor and Git. See [SETUP.md](../development/SETUP.md).

## Working rules that matter on day one

- Read [STATUS.md](STATUS.md) first; it names the next task.
- Inspect before changing; cite sources; never invent formulas or data.
- Keep every identifier brand-neutral ([NAMING.md](../architecture/NAMING.md)).
- After meaningful work, update STATUS.md, NEXT_ACTIONS.md and DECISIONS.md
  with resumable notes.
