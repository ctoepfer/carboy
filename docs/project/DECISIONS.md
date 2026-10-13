# Carboy — Decision Register

Updated: 2026-10-12. Owner of all decisions: Charles Toepfer unless noted.
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
| 2026-10-11 | **Schema Q5:** first wort, flameout, and dry hop are **timing points on an addition** (`timing.point`), not stage kinds; whirlpool and chilling remain stages | [RECIPE_SCHEMA.md §7.3](../architecture/RECIPE_SCHEMA.md#73-process) |
| 2026-10-11 | **Schema Q9:** ingredient properties use a **closed per-kind property table**; imported fields with no row are kept verbatim in `ingredient.unmapped` (shown, exported, never calculated from or writable by commands) | [RECIPE_SCHEMA.md §7.2](../architecture/RECIPE_SCHEMA.md#72-ingredients-and-additions) |
| 2026-10-11 | **Schema Q5b:** a new fermentation/conditioning stage per vessel (transfer); temperature or time changes are steps within a stage | [RECIPE_SCHEMA.md §7.3](../architecture/RECIPE_SCHEMA.md#73-process) |
| 2026-10-11 | **Schema Q1:** writers generate UUIDv7 for recipe, revision, entity, and proposal IDs; readers accept any valid RFC 9562 UUID | [RECIPE_SCHEMA.md §2](../architecture/RECIPE_SCHEMA.md#2-envelope) |
| 2026-10-11 | **Schema Q2:** unit tokens and exact factors follow brewconvert's `model/units.py`; Lumina's `degF`/`sec`/`hr` are mapped on import; gravity scales convert only by versioned formula | [RECIPE_SCHEMA.md §5](../architecture/RECIPE_SCHEMA.md#5-typed-quantities) |
| 2026-10-11 | **D-022 (schema Q3):** devices report their highest supported schema version; a service writes at the lowest MINOR every paired device supports, else holds the revision and reports "update required"; never down-converts across a MAJOR. Newer-MINOR documents open read-only | [RECIPE_SCHEMA.md §4](../architecture/RECIPE_SCHEMA.md#4-schema-versioning) |
| 2026-10-11 | **Editor commands E1–E6:** nobody writes calculated values; `scale_recipe` waits for the Phase 2 scaling policy; proposals are all or nothing; user-authored proposals deferred to Phase 13; notes get IDs; no AI dry-run mode beyond preview | [EDITOR_COMMANDS.md](../architecture/EDITOR_COMMANDS.md#decisions) |
| 2026-10-12 | **Sync protocol SQ1–SQ4:** devices report their supported schema version at registration and on every request; no app-pushed proposals before Phase 13; merges need no extra sidecar; tombstone retention is a service choice published in capabilities | [SYNC_PROTOCOL.md](../architecture/SYNC_PROTOCOL.md#decisions) |
| 2026-10-12 | **AI tools TQ1–TQ5:** tool hosts accept `new:<label>` placeholders and assign UUIDv7s (command contract unchanged); `create_recipe` placement stays with D-014; search filters limited to stably indexed fields; one JSON Schema source for all tiers; `get_recipe` returns full content, capped | [AI_TOOLS.md](../architecture/AI_TOOLS.md#decisions) |
| 2026-10-12 | **D-006:** beverage launch staging per BEVERAGE_SCOPE, gated per statistic: enabled only when its source meets FQ1 and its fixtures pass. **FQ1–FQ4:** reviewed secondary sources (e.g. Holle, MBAA) may back a formula with both citations; OG has mass (default) and points (parity) methods; Tinseth and ABV wait for citable sources, Lumina variants kept for parity only | [FORMULA_COVERAGE.md](../architecture/FORMULA_COVERAGE.md#decisions) |

## Proposed (direction set, evidence pending)

| ID | Proposal | Evidence needed | Target |
|---|---|---|---|
| D-005 | Shared TS/Python fixture suite as the parity contract with Lumina and brewconvert | First parity fixture passing in both | Phase 2 |
| D-007 | Desktop 1.0: Windows x64, macOS universal, Linux x64; Android before iOS | Phase 1 builds | Phase 0–1 |
| — | Tauri 2 shell, Electron + Capacitor fallback | Graph spike, mobile builds | Phase 1 ([ADR 0003](../architecture/adr/0003-application-shell.md)) |
| — | Pure TypeScript Recipe Core | Port sizing; core on mobile | Phase 0–1 ([ADR 0004](../architecture/adr/0004-typescript-recipe-core.md)) |
| — | One BrewIO protocol over stdio/WebSocket | Sidecar track; Phase 9 | ([ADR 0005](../architecture/adr/0005-brewio-host-protocol.md)) |
| — | SQLite + JSON revision documents | Save/reopen; interruption tests | Phase 1–3 ([ADR 0006](../architecture/adr/0006-local-persistence.md)) |
| — | AI tiers and proposal boundary | Phase 8 tests | ([ADR 0007](../architecture/adr/0007-ai-integration-tiers.md)) |
| — | Revision envelope and hashing: RFC 8785 JCS + SHA-256 over envelope and content; decimal strings, no floats, unknown = absent; `calculated` statistics kept outside the hash; service metadata only in sidecars | Phase 2 test vectors passing in two implementations | Phase 0 draft → Phase 2 ([RECIPE_SCHEMA.md](../architecture/RECIPE_SCHEMA.md)) |
| — | Editor commands target entity IDs with absolute values; all-or-nothing; provenance assigned by channel; semantic diff; stale proposals rebased and re-reviewed. Q5, Q5b, Q9 and E1–E6 decided 2026-10-11 (see Decided) | Owner answers; Phase 2 implementation | Phase 0 draft ([EDITOR_COMMANDS.md](../architecture/EDITOR_COMMANDS.md), [RECIPE_SCHEMA.md §7](../architecture/RECIPE_SCHEMA.md#7-content)) |
| — | Sync protocol: brand-neutral `/sync/v0` under a user-chosen service base; system-browser OAuth with PKCE, per-device tokens; cursor change feed; per-item idempotent revision push; `unsynced` vs `deleted` tombstones; reconciliation never deletes locally; D-022 delivery with `update-required`; export never blocked | Contract tests with two simulated clients (listed in the document) | Phase 0 outline → Phase 13 ([SYNC_PROTOCOL.md](../architecture/SYNC_PROTOCOL.md)) |
| — | One AI tool surface for all tiers: scoped reads, `preview_changes`, additive `create_recipe`, `propose_changes`, `import_recipe`; no delete/accept/export/URL/device tools | Phase 8 tests | Phase 0 draft → Phase 8 ([AI_TOOLS.md](../architecture/AI_TOOLS.md)) |

## Open

| ID | Question | Blocks | Target |
|---|---|---|---|
| D-009 | Ingredient catalog source and redistribution rights | Phase 3 catalog | Phase 0 |
| D-010 | UI framework: React vs. Svelte (evaluated with graph spike) | Phase 1 spike | Phase 1 |
| D-011a | AI Bridge sync and conflict model. **Proposed**: revision DAG, server never merges, user resolves divergence in the app, tombstones. Public protocol outline in [SYNC_PROTOCOL.md](../architecture/SYNC_PROTOCOL.md) | App sync client; Bridge data model | Bridge B0 |
| D-014 | May AI proposals auto-apply to unsaved drafts (still undoable)? Related: Bridge BR-07 proposes that new AI-created recipes enter the library directly, marked `ai_proposed` + unreviewed, while edits to existing recipes are always proposals | Phase 8 UX; Bridge B5 | Phase 8 / Bridge B4 |
| D-015 | May desktop 1.0 ship with the list editor only if the graph slips? | Release planning | Phase 4 |
| D-016 | Native file extension and MIME type | Phase 1 file exchange | Phase 0 |
| D-017 | Graph library | Phase 5 | Phase 1 spike |
| D-018 | First mobile release: full offline editor or narrower companion | Phase 12 | Phase 6 |
| D-019 | Keep Lumina's `soda` and `gruit` types? (`wash` is excluded) | Schema v0 | Phase 0 |
| D-020 | BJCP (and wine/mead/cider competition) style data: redistribution terms | Style guidance features | Phase 0 |
| D-025 | Telemetry and privacy in the free app: collect nothing, or opt-in crash reports only? Feeds store privacy disclosures and a privacy policy (stores may require a policy URL even when nothing is collected: to verify) | Phase 6 store metadata; any error-reporting code | Before Phase 4 code; recommend "nothing; opt-in crash reports at most" |
| D-026 | Alcohol-related obligations: store age ratings; a calculation disclaimer (estimates for home use, not commercial labelling or tax, e.g. US TTB rules); homebrewing legality differs by jurisdiction (inform, don't geo-block) | Phase 6 and 12 store submissions; printed summaries | Phase 6 |
| D-027 | Hardware safety rules before any device control: fail-safe on disconnect or crash, explicit user confirmation, nothing unattended by default, safe limits per device profile; starting from brewpanel's `SafetyGate` (REUSE_BASELINE) | Phases 9–10 | Before Phase 9 |
| D-024 | Extension model ([ADR 0008](../architecture/adr/0008-extension-model.md), Proposed): data-only packs and themes, external integrations via contracts, build-time modules later, no runtime code plugins; theme format tokens-only vs. sanitized CSS | Phase 2–4 module registration; Phase 4 themes and packs | Owner review now; theme format by Phase 4 |
| D-023 | Usability rules U1–U12 and open questions UQ1–UQ11 ([USABILITY.md](../architecture/USABILITY.md)): launch languages, message format (with D-010), language packs, unit preferences, recipe language tag, RTL graph, AT testers, plain-text export, translation platform, guided creation, accessibility law | Phase 4 UI strings; schema (UQ5) | UQ2 end of Phase 1; others per USABILITY.md |
