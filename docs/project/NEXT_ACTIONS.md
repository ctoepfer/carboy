# Carboy — Next Actions

Updated: 2026-10-11. Ordered. Owner decisions are marked **(owner)**.

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
- [ ] Collect primary sources for Lumina's beer formulas (MCU, Morey SRM,
      extract points/OG, attenuation/FG, ABV 131.25, Tinseth) and confirm
      Tinseth's gravity and volume inputs. Feeds the formula coverage table.
- [ ] Choose the brewconvert revision that is the BeerXML port oracle;
      record why (`master` `0b5e05d` vs. Lumina's pin `e0f9975a`).
- [ ] Complete the reuse matrix in `docs/architecture/REUSE_BASELINE.md` for
      every remaining asset (license, provenance, intent, size).
- [ ] Ingredient catalog sources (D-009): candidate datasets with licenses.

### Contracts

- [x] Recipe schema v0 and revision envelope draft
      (`docs/architecture/RECIPE_SCHEMA.md`, 2026-10-11).
- [ ] **(owner)** Answer RECIPE_SCHEMA.md open questions: Q1 UUID versions,
      Q2 unit tokens, Q3 the D-022 approach, Q5 stage vs. timing.
- [ ] Editor command contract v0 (`docs/architecture/EDITOR_COMMANDS.md`),
      written to double as the AI proposal contract (ADR 0007).
- [ ] Formula coverage table with cited sources per beverage; propose D-006
      final staging.
- [ ] Lumina ⇄ Carboy field mapping draft, including legacy imperial fields.
- [ ] Decide D-016 (native file extension / media type; brand-neutral) and
      D-019 (`soda`/`gruit`).
- [ ] Phase 1 spike plan: Recipe Core language and shell candidates (ADRs
      0003/0004), graph library and UI framework candidates, devices, CI matrix.

## Not now

No packages, language workspaces, framework scaffolding, CI, or OS bundle
identifiers until the Phase 1 spike selects the toolchain (ADRs 0003/0004)
and the conventions are reviewed.
