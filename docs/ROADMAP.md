# Carboy — Roadmap

Public summary of the plan: what Carboy is for, the principles every change
keeps, the release boundaries, and the phases. Detailed planning notes are
kept by the maintainer. Contracts and architecture decisions are public in
[`architecture/`](architecture/) and the [ADRs](architecture/adr/README.md).

## Current focus

**Phase 2, Recipe Core** (since 2026-10-13), started after ADR 0004
(pure TypeScript core) was accepted: [`packages/recipe-core/`](../packages/recipe-core/),
documented in [RECIPE_CORE.md](architecture/RECIPE_CORE.md).

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
calculations per [BEVERAGE_SCOPE.md](product/BEVERAGE_SCOPE.md) (D-006).
If the graph slips, 1.0 may ship with the list editor and the graph follows
in 1.1 (D-015).

**Later releases.** Batches and recipe improvement, AI tiers 1–2, hardware
monitoring and control, shop connections, mobile, and the paid cloud
connector. Their interfaces are anticipated early; none delays 1.0.

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
| 11 | Local homebrew shop connector; extended Lumina exchange | 6 |
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
