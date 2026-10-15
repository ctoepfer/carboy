# Carboy — Roadmap

Public summary of the plan: what Carboy is for, the principles every change
keeps, the release boundaries, and the phases. Detailed planning notes are
kept by the maintainer. Contracts and architecture decisions are public in
[`architecture/`](architecture/) and the [ADRs](architecture/adr/README.md).

## Current focus

**Phase 2, Recipe Core** (since 2026-10-13), started after ADR 0004
(pure TypeScript core) was accepted: [`packages/recipe-core/`](../packages/recipe-core/),
documented in [RECIPE_CORE.md](architecture/RECIPE_CORE.md), and the native
file in [`packages/recipe-format/`](../packages/recipe-format/)
([RECIPE_FORMAT.md](architecture/RECIPE_FORMAT.md)). **Integration
milestone reached (2026-10-14):** a complete recipe is created, validated,
calculated, canonically serialized, hashed, saved, reopened, and verified
with its identity and numbers unchanged. Since then: the editor command
applier ([`packages/editor-commands/`](../packages/editor-commands/),
[EDITOR_COMMANDS.md](architecture/EDITOR_COMMANDS.md)), full content
validation, scaling, schema 0.2, migrations, and the Lumina ⇄ Carboy
mapping with round-trip and parity fixtures that pass in TypeScript and
Python. **Phase 2's exit criteria are met pending the owner's review**;
open owner questions are listed in the formula, core, and command
documents.

**Phase 1, platform proof** continues alongside it: the throwaway spikes
under [`spikes/phase1/`](../spikes/phase1/README.md)
([SPIKE_PLAN.md](../spikes/phase1/SPIKE_PLAN.md)) still have to settle the
shell (ADR 0003), persistence (ADR 0006), the graph library, and the
mobile checks.

## Goal

A free, open-source, offline-first application for designing, improving, and
brewing beer, wine, mead, cider, and sake recipes, released desktop first,
then Android and iOS. Useful without an account, AI, hardware, a shop, or a
network. Optional: local or bring-your-own-key AI, BrewIO hardware monitoring
and verified control, local homebrew shop connections, and — the one paid
piece — a hosted connector for cloud AI assistants.

## Principles

1. **One authoritative recipe model.** Ingredient list, process list, and
   graph are views of it. Edits are typed, validated commands.
2. **Deterministic calculations own the numbers.** AI proposes; Recipe Core
   validates and calculates; the user accepts.
3. **Provenance everywhere.** Declared, imported, calculated, measured, and
   AI-proposed values stay distinguishable. Unknown stays unknown.
4. **Batches are history.** Recipe edits never rewrite batches; learning
   from batches produces an explicit new revision.
5. **Honest support claims.** A beverage calculation, platform, or device is
   "supported" only with verification evidence.
6. **Free core, optional paid connector** ([ADR 0002](architecture/adr/0002-open-core-boundary.md)).
7. **Accessible by default.** WCAG 2.1 AA minimum, WCAG 2.2 AA target.
8. **Usable in the user's language and units.** Every string externalized;
   language, number format, and units are separate settings; display never
   changes data ([USABILITY.md](architecture/USABILITY.md)).

## Release boundaries

**Desktop 1.0.** Offline recipe editor: ingredient catalog with custom
ingredients, equipment profiles, list and graph process editing, undo/redo,
autosave and recovery, revisions, native import/export, BeerXML with loss
reports, Lumina exchange via files, preview and printable summary. Beverage
calculations per [BEVERAGE_SCOPE.md](product/BEVERAGE_SCOPE.md) (D-006),
including the foundational mead nutrient model and basic wine/cider sulfite
management. Guided recipe creation, plain-text/Markdown export, and light,
dark, and high-contrast themes; English only, with localization built in
([USABILITY.md](architecture/USABILITY.md)). BeerJSON is a target, not a
blocker (may move to 1.1). If the graph slips, 1.0 may ship with the list editor and the graph follows
in 1.1 (D-015).

**Later releases.** Batches and recipe improvement, AI tiers 1–2, hardware
monitoring and control, shop connections, a personal ingredient inventory,
mobile, and the paid cloud connector. Their interfaces are anticipated early; none delays 1.0.

**Deferred unless separately approved.** See non-goals in the
[product brief](product/PRODUCT_BRIEF.md#non-goals-unless-separately-approved).

## Phases

| Phase | Outcome | Depends on |
|---|---|---|
| 0 | Discovery, reuse matrix, decisions, contracts | — |
| 1 | Platform proof: shell, core on mobile, graph spike, packaging | 0 |
| 2 | Recipe Core, native format, Lumina mapping, fixture parity | 0, 1 |
| 3 | Library, catalog, equipment profiles, recovery | 2 |
| 4 | Direct editing, BeerXML port, import review, printing | 2, 3 |
| 5 | Interactive process graph | 4 |
| 6 | Desktop 1.0 and open-source launch | 1–5 |
| 7 | Batches, guided brewing, recipe improvement | 6 |
| 8 | AI tiers 1–2: in-app assistant and local AI connector | 4, 6 |
| 9 | BrewIO host integration and monitoring | 1, 7 |
| 10 | Verified equipment control | 9 |
| 11 | Local homebrew shop connector ([Shop Bridge](architecture/SHOP_BRIDGE.md), open and retailer-neutral); extended Lumina exchange | 6 |
| 12 | Mobile: Android, then iOS | 1, 6 |
| 13 | Carboy AI Bridge (paid, optional; separate private service) | 8; D-011a |
| 14 | Maintenance and extensions | 6 |

Phases are milestones, not calendar estimates. Phases 8, 9, 11, and 12 can
be scheduled independently once prerequisites are met.

## Accepted decisions

Identifiers (D-nnn, Q-n, …) are referenced throughout the documentation.
Architecture decisions with lasting consequences also have an
[ADR](architecture/adr/README.md).

| ID | Decision | Record |
|---|---|---|
| — | Scope: beer, wine, mead, cider, sake; recipe design and improvement; optional AI, hardware, and homebrew-shop connections | [Product brief](product/PRODUCT_BRIEF.md) |
| — | Modular monolith; offline-first; no mandatory account | [ADR 0001](architecture/adr/0001-modular-monolith.md) |
| — | Free and open source, with one optional paid hosted connector for cloud AI assistants | [ADR 0002](architecture/adr/0002-open-core-boundary.md) |
| — | Desktop first, then mobile | This page |
| D-001 / D-002 | Apache-2.0; the maintainer's earlier recipe code and fixtures may be ported in under Apache-2.0 | [LICENSE](../LICENSE) |
| D-004 | This public repository holds the application; the hosted connector is a separate private repository that depends on this one, never the reverse | [Boundary](architecture/PUBLIC_PRIVATE_BOUNDARY.md) |
| D-006 | Beverage launch staging per BEVERAGE_SCOPE, gated per statistic: a statistic is enabled only when its formula has an accepted source and its fixtures pass | [BEVERAGE_SCOPE](product/BEVERAGE_SCOPE.md), [FORMULA_COVERAGE](architecture/FORMULA_COVERAGE.md#decisions) |
| D-008 | macOS and iOS builds use hosted macOS CI runners | — |
| ADR 0008 | Extension model: data-only packs, external integrations through published contracts, build-time modules later, no runtime code plugins; themes are data-only design tokens (light, dark, high contrast) | [ADR 0008](architecture/adr/0008-extension-model.md) |
| D-023 | Usability rules U1–U12 are product requirements; UQ1–UQ11 decided (English first with localization built in; unit preferences independent of language; guided creation in 1.0; plain-text export; assistive-technology testers before 1.0) | [USABILITY.md §6](architecture/USABILITY.md#6-decisions-owner-2026-10-13) |
| D-028 | CQ1 personal inventory deferred past the first release (contracts leave room); CQ2 BeerJSON a 1.0 target, not a blocker; CQ3 mead nutrients and CQ4 wine/cider sulfite in 1.0 | [BEVERAGE_SCOPE](product/BEVERAGE_SCOPE.md#launch-staging-d-006-cq3cq4-decided-2026-10-13), [INGREDIENT_CATALOG §5](architecture/INGREDIENT_CATALOG.md#5a-inventory-cq1-deferred) |
| D-029 | RQ1: additional unit tokens `fraction`, `%`, `tbsp`, `tsp`, `Brix`, `degL`, `SRM`, `EBC`, `IBU`, `pH`; empirical scale conversions are formulas | [RECIPE_CORE §3](architecture/RECIPE_CORE.md#3-units) |
| D-030 | Cultures as organism → strain → product with separate functional groups and lineage; evidence with kind, certainty, stance; first-class negative relations, non-transitive equivalence; research data staged as unreviewed claims; no identity inferred from names or function | [INGREDIENT_CATALOG §8](architecture/INGREDIENT_CATALOG.md#8-culture-catalog-decisions-d-030-owner-2026-10-13) |
| IQ1–IQ4 | Ingredient catalog: group/product hierarchy with `group_ref`; display; curated catalog plus data packs; start with cultures, hops, malt | [INGREDIENT_CATALOG §7](architecture/INGREDIENT_CATALOG.md#7-decisions-owner-2026-10-13) |
| — | SHA-256 from `@noble/hashes` (vetted dependency), never implemented in-house; the content hash is integrity, not authentication | [RECIPE_CORE §5](architecture/RECIPE_CORE.md#5-canonical-json-and-the-content-hash) |
| — | SQLite durability default: WAL with `synchronous=FULL`, pending measurement | [ADR 0006](architecture/adr/0006-local-persistence.md) |
| ADR 0004 | Recipe Core and Recipe Format in pure TypeScript, kept in agreement with the Python implementations by a shared fixture suite (accepted 2026-10-13) | [ADR 0004](architecture/adr/0004-typescript-recipe-core.md) |
| D-013 | "Carboy" is a permanent codename; the user-facing brand is configurable | [NAMING.md](architecture/NAMING.md) |
| D-021 | The hosted connector is a separate lightweight service that runs the public Recipe Core in-process | [ADR 0002](architecture/adr/0002-open-core-boundary.md) |
| D-022 | Schema version negotiation between devices and services | [RECIPE_SCHEMA §4](architecture/RECIPE_SCHEMA.md#4-schema-versioning) |
| Q1, Q2, Q5, Q5b, Q9 | UUIDv7 identifiers; unit tokens and exact factors; timing points; stage per vessel; closed ingredient property table | [RECIPE_SCHEMA](architecture/RECIPE_SCHEMA.md) |
| E1–E6 | Editor command decisions | [EDITOR_COMMANDS](architecture/EDITOR_COMMANDS.md#decisions) |
| SQ1–SQ4 | Sync protocol decisions | [SYNC_PROTOCOL](architecture/SYNC_PROTOCOL.md#decisions) |
| TQ1–TQ5 | AI tool surface decisions | [AI_TOOLS](architecture/AI_TOOLS.md#decisions) |
| FQ1–FQ4 | Formula sourcing rules | [FORMULA_COVERAGE](architecture/FORMULA_COVERAGE.md#decisions) |

Proposed directions (not binding until accepted) are the Proposed ADRs and
the open questions listed in each document.
