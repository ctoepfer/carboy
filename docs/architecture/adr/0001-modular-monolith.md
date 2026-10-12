# ADR 0001: Modular monolith

- Status: Accepted
- Date: 2026-10-09
- Decision owner: Charles Toepfer

## Context

Carboy is built by a very small team, must work fully offline, and must ship
to desktop and mobile app stores. Lumina (ADR 0001 there) and brewpanel both
use a modular monolith successfully.

## Decision

Ship one installed application with explicit module boundaries
([`../OVERVIEW.md`](../OVERVIEW.md) §2–3). Modules are compiled in, talk
through typed public entry points, and own their data. Processes outside the
app exist only where hardware or hosting demands it: the BrewIO host
(ADR 0005) and the optional paid AI Bridge (ADR 0002).

## Alternatives considered

- **Microservices / local service mesh**: operational cost with no benefit for
  a single-user offline app; impossible on iOS.
- **Runtime plugin system**: blocked by mobile store rules on executable code;
  security burden. Revisit only for data-only extensions (catalogs, formula
  packs) if ever needed.

## Consequences

- Module boundaries must be enforced by tooling (boundary linter) rather than
  process isolation.
- Extracting a module into a separate package or service requires evidence of
  an actual reuse, scaling, or deployment need.
