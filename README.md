# Carboy

Carboy is a free, open-source, cross-platform recipe application for beer,
wine, mead, cider, sake, and, later, other fermented beverages. It is for
designing recipes, improving them batch by batch, and brewing them.

> "Carboy" is the project codename. The user-facing product name is not
> decided yet and is configured in [`identity/identity.json`](identity/identity.json)
> ([naming policy](docs/architecture/NAMING.md)).

**Status: Phase 0 (discovery and decisions).** There is no application code
yet. This repository currently holds the plan, architecture, contracts work,
and decisions the implementation will follow. Current state:
[`docs/project/STATUS.md`](docs/project/STATUS.md).

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
    project/       Plan, status, decisions, next actions
    product/       Product brief, beverage scope
    architecture/  Overview, invariants, boundary, naming, ADRs, reuse baseline
    development/   Developer setup
```

Source directories are added when their technology is selected (ADRs
0003/0004, Phase 1) and they receive real code. The intended module structure
is in [`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md).

## Documentation

| Document | Purpose |
|---|---|
| [STATUS.md](docs/project/STATUS.md) | Where the project stands; next task |
| [GETTING_STARTED.md](docs/project/GETTING_STARTED.md) | Path from plan to first code; what the owner and contributors need |
| [PROJECT_PLAN.md](docs/project/PROJECT_PLAN.md) | Phased plan (authoritative) |
| [DECISIONS.md](docs/project/DECISIONS.md) | Decision register |
| [NEXT_ACTIONS.md](docs/project/NEXT_ACTIONS.md) | Concrete next tasks |
| [OVERVIEW.md](docs/architecture/OVERVIEW.md) | Modules, dependency rules, data model |
| [INVARIANTS.md](docs/architecture/INVARIANTS.md) | Properties every change preserves |
| [PUBLIC_PRIVATE_BOUNDARY.md](docs/architecture/PUBLIC_PRIVATE_BOUNDARY.md) | What lives where; the dependency rule |
| [NAMING.md](docs/architecture/NAMING.md) | Codename vs. brand vs. data identifiers |
| [ADRs](docs/architecture/adr/README.md) | Architecture decision records |
| [SETUP.md](docs/development/SETUP.md) | Developer setup |
| [AGENTS.md](AGENTS.md) | Rules for contributors and coding agents |

## License

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE).
