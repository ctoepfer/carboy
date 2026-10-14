# Architecture Decision Records

An ADR records one architectural decision, its context, and its consequences.
Statuses: `Proposed` (direction, not yet binding), `Accepted`, `Superseded by
NNNN`, `Rejected`. Only `Accepted` ADRs are binding. Proposed ADRs name the
evidence needed to accept them.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-modular-monolith.md) | Modular monolith | Accepted |
| [0002](0002-open-core-boundary.md) | Open-source core with one paid hosted connector | Accepted |
| [0003](0003-application-shell.md) | Tauri 2 shell with a web UI | Proposed — Phase 1 evidence |
| [0004](0004-typescript-recipe-core.md) | Pure TypeScript Recipe Core with cross-language fixture parity | Accepted 2026-10-13 (mobile check still open) |
| [0005](0005-brewio-host-protocol.md) | One BrewIO host protocol over stdio or WebSocket | Proposed — Phase 1/9 evidence |
| [0006](0006-local-persistence.md) | SQLite with revisions stored as versioned JSON documents | Proposed — Phase 1/3 evidence |
| [0007](0007-ai-integration-tiers.md) | AI integration tiers and the proposal boundary | Proposed — Phase 8 evidence |
| [0008](0008-extension-model.md) | Extension model: data packs, external integrations, build-time modules | Proposed — owner review; Phase 4 evidence |

## Template

```markdown
# ADR NNNN: Title

- Status: Proposed | Accepted | Superseded by NNNN | Rejected
- Date: YYYY-MM-DD
- Decision owner: Charles Toepfer

## Context
## Decision
## Alternatives considered
## Consequences
## Evidence required to accept   (Proposed ADRs only)
```
