# Carboy — Decision Register

Updated: 2026-10-09. Owner of all decisions: Charles Toepfer unless noted.
Architectural decisions with lasting consequences also get an ADR in
[`../architecture/adr/`](../architecture/adr/).

## Decided

| Date | Decision | Record |
|---|---|---|
| 2026-10-09 | Product naming: the project uses a stable codename; the user-facing brand is undecided and configurable ([NAMING.md](../architecture/NAMING.md)) | — |
| 2026-10-09 | Scope: beer, wine, mead, cider, sake; recipe design, improvement, AI integration, local homebrew shop connections | [Product brief](../product/PRODUCT_BRIEF.md) |
| 2026-10-09 | Free and open source, except one optional paid hosted connector for cloud AI assistants | [ADR 0002](../architecture/adr/0002-open-core-boundary.md) |
| 2026-10-09 | Modular monolith; offline-first; no mandatory account | [ADR 0001](../architecture/adr/0001-modular-monolith.md) |
| 2026-10-09 | Desktop first, then mobile | [Plan](PROJECT_PLAN.md) |
| 2026-10-09 | Paid piece is the **Carboy AI Bridge** (originally "built on Drupal"; superseded 2026-10-11, see below): AI assistant plugins, online recipe storage, app sync (D-003 platform) | [ADR 0002](../architecture/adr/0002-open-core-boundary.md) |
| 2026-10-09 | AI Bridge stores a hosted copy of opted-in recipes rather than relaying to a running app (D-011) | [ADR 0002](../architecture/adr/0002-open-core-boundary.md) |
| 2026-10-11 | **D-004:** implementation lives in the public `ctoepfer/carboy` repository (Apache-2.0); the private service in `ctoepfer/carboy-bridge` (proprietary). Local checkouts: `/mnt/lumina_share/carboy/carboy` and `/mnt/lumina_share/carboy/carboy-bridge`, independent repositories (no submodules), branch `main` | — |
| 2026-10-11 | **D-008:** macOS/iOS builds, signing, and notarization use hosted macOS CI runners (GitHub Actions); touch testing still needs a device or simulator | — |
| 2026-10-11 | **D-001 / D-002:** app license Apache-2.0; owner's Lumina recipe code and fixtures may be ported into Carboy under Apache-2.0 | — |
| 2026-10-11 | Verdant Reverie and Ultimate Coffee Schwarzbier are the owner's recipes and may be published as fixtures; the owner has many more recipes available for fixtures | — |
| 2026-10-11 | **D-013:** codename **Carboy** for repositories, packages and technical identifiers (permanent, survives rebranding); default development display name "Carboy"; final brand undecided, set in `identity/identity.json`. Trademark research for brand candidates is kept in the private `carboy-bridge` repository. Formal USPTO search and attorney clearance before Phase 6 | [NAMING.md](../architecture/NAMING.md) |
| 2026-10-11 | **D-021 / D-003 / D-011b:** the AI Bridge is a **separate, lightweight, separately deployed service** in the private `ctoepfer/carboy-bridge` repository (proprietary), on its own host and domain; not Drupal. It reuses the public Recipe Core and contracts in-process (no second calculation engine, no separate validation service). Its language follows the Recipe Core decision (ADR 0004, TypeScript proposed). Accounts, billing, and operations are private Bridge decisions | [ADR 0002](../architecture/adr/0002-open-core-boundary.md), [PUBLIC_PRIVATE_BOUNDARY.md](../architecture/PUBLIC_PRIVATE_BOUNDARY.md) |

## Proposed (direction set, evidence pending)

| ID | Proposal | Evidence needed | Target |
|---|---|---|---|
| D-005 | Shared TS/Python fixture suite as the parity contract with Lumina and brewconvert | First parity fixture passing in both | Phase 2 |
| D-006 | Beverage launch staging per [BEVERAGE_SCOPE.md](../product/BEVERAGE_SCOPE.md) | Sourced formula coverage table | Phase 0 |
| D-007 | Desktop 1.0: Windows x64, macOS universal, Linux x64; Android before iOS | Phase 1 builds | Phase 0–1 |
| — | Tauri 2 shell, Electron + Capacitor fallback | Graph spike, mobile builds | Phase 1 ([ADR 0003](../architecture/adr/0003-application-shell.md)) |
| — | Pure TypeScript Recipe Core | Port sizing; core on mobile | Phase 0–1 ([ADR 0004](../architecture/adr/0004-typescript-recipe-core.md)) |
| — | One BrewIO protocol over stdio/WebSocket | Sidecar track; Phase 9 | ([ADR 0005](../architecture/adr/0005-brewio-host-protocol.md)) |
| — | SQLite + JSON revision documents | Save/reopen; interruption tests | Phase 1–3 ([ADR 0006](../architecture/adr/0006-local-persistence.md)) |
| — | AI tiers and proposal boundary | Phase 8 tests | ([ADR 0007](../architecture/adr/0007-ai-integration-tiers.md)) |

## Open

| ID | Question | Blocks | Target |
|---|---|---|---|
| D-009 | Ingredient catalog source and redistribution rights | Phase 3 catalog | Phase 0 |
| D-010 | UI framework: React vs. Svelte (evaluated with graph spike) | Phase 1 spike | Phase 1 |
| D-011a | AI Bridge sync and conflict model. **Proposed** in Bridge ADR B-0005: revision DAG, server never merges, user resolves divergence in the app, tombstones (BR-05) | App sync client; Bridge data model | Bridge B0 |
| D-022 | Schema-version negotiation for AI-created documents: a server-side Recipe Core may be newer than a user's paired app, so the Bridge must write (or serve) at a schema version every paired device supports, or hold the document until devices update | Bridge B3/B5; app sync client | Phase 0 envelope draft |
| D-014 | May AI proposals auto-apply to unsaved drafts (still undoable)? Related: Bridge BR-07 proposes that new AI-created recipes enter the library directly, marked `ai_proposed` + unreviewed, while edits to existing recipes are always proposals | Phase 8 UX; Bridge B5 | Phase 8 / Bridge B4 |
| D-015 | May desktop 1.0 ship with the list editor only if the graph slips? | Release planning | Phase 4 |
| D-016 | Native file extension and MIME type | Phase 1 file exchange | Phase 0 |
| D-017 | Graph library | Phase 5 | Phase 1 spike |
| D-018 | First mobile release: full offline editor or narrower companion | Phase 12 | Phase 6 |
| D-019 | Keep Lumina's `soda` and `gruit` types? (`wash` is excluded) | Schema v0 | Phase 0 |
| D-020 | BJCP (and wine/mead/cider competition) style data: redistribution terms | Style guidance features | Phase 0 |
