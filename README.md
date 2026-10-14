# Carboy

Carboy is a free, open-source, cross-platform recipe application for beer,
wine, mead, cider, sake, and, later, other fermented beverages. It is for
designing recipes, improving them batch by batch, and brewing them.

> "Carboy" is the project codename. The user-facing product name is not
> decided yet and is configured in [`identity/identity.json`](identity/identity.json)
> ([naming policy](docs/architecture/NAMING.md)).

**Status: Phase 2 (Recipe Core) has started; Phase 1 (platform proof)
continues alongside it.** There is no application yet. Recipe Core is being
built in TypeScript under [`packages/recipe-core/`](packages/recipe-core/)
(ADR 0004, accepted). Throwaway spike code under
[`spikes/phase1/`](spikes/phase1/README.md) still tests the shell, storage,
and graph candidates. Phases and current focus:
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## What it will do

- Recipe design and editing, ingredient catalogs, equipment profiles
- Deterministic, explainable calculations with value provenance
- Interactive process diagrams, synchronized with ingredient and process lists
- Batch records, measurements, recipe history, and equipment calibration
- Import/export, including BeerXML
- Optional: local AI or bring-your-own-key AI, hardware monitoring and
  control, homebrew shop connections

Desktop first (Linux, Windows, macOS); Android and iOS later.

## Principles

The application works fully **offline**, with **no account, AI, hardware, or
internet connection required**. Calculations are deterministic; AI only
proposes changes that are validated and approved; shop connections are
vendor-neutral. Full list: [invariants](docs/architecture/INVARIANTS.md).

## Open source and the optional hosted service

This repository is the complete application and its reusable foundations
(Recipe Core and public contracts), licensed under Apache-2.0. An optional,
separately hosted, proprietary service (the AI Bridge: online library, sync,
cloud AI-assistant access) lives in a separate private repository and depends
on this one, never the reverse. This repository builds and runs without it.
See [public/private boundary](docs/architecture/PUBLIC_PRIVATE_BOUNDARY.md).

## Repository layout

```
carboy/
  identity/        Central user-facing identity (display name, assets)
  docs/
    ROADMAP.md     Phases, principles, accepted decisions
    product/       Product brief, beverage scope
    architecture/  Overview, invariants, boundary, naming, ADRs, reuse baseline
    development/   Developer setup
    references/    Bibliography of cited works
  packages/        Product code (npm workspaces): recipe-core, recipe-format
  spikes/phase1/   Throwaway Phase 1 spike code (not product code)
  .github/         CI: core tests on every push; manual spike workflow
```

Source directories are added when they receive real code; packages live
under `packages/` as npm workspaces. The intended module structure
is in [`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md).

## Documentation

| Document | Purpose |
|---|---|
| [ROADMAP.md](docs/ROADMAP.md) | Goal, principles, release boundaries, phases, accepted decisions |
| [OVERVIEW.md](docs/architecture/OVERVIEW.md) | Modules, dependency rules, data model |
| [INVARIANTS.md](docs/architecture/INVARIANTS.md) | Properties every change preserves |
| [PUBLIC_PRIVATE_BOUNDARY.md](docs/architecture/PUBLIC_PRIVATE_BOUNDARY.md) | What lives where; the dependency rule |
| [NAMING.md](docs/architecture/NAMING.md) | Codename vs. brand vs. data identifiers |
| [BIBLIOGRAPHY.md](docs/references/BIBLIOGRAPHY.md) | Sources for formulas and brewing data |
| [RECIPE_CORE.md](docs/architecture/RECIPE_CORE.md) | Recipe Core: numbers, units, quantities, precision policy, formulas, validation |
| [RECIPE_FORMAT.md](docs/architecture/RECIPE_FORMAT.md) | The native file: canonical writing, verified reading, integration milestone |
| [USABILITY.md](docs/architecture/USABILITY.md) | Accessibility, localization, and GUI feature plan |
| [ADRs](docs/architecture/adr/README.md) | Architecture decision records |
| [SETUP.md](docs/development/SETUP.md) | Developer setup |
| [AGENTS.md](AGENTS.md) | Rules for contributors and coding agents |
| [SECURITY.md](SECURITY.md) | How to report a vulnerability |

## License

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE).
