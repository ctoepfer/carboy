# Carboy — Phased Project Plan

Version: 2.0 (Carboy baseline)
Date: 2026-10-09
Status: Planning baseline. No implementation has started.
Supersedes: "Lumina Recipe App — Phased Project Plan" v1.0 (2026-10-07),
incorporating the 2026-10-09 review (Lumina/brewconvert/brewpanel inspection,
platform feasibility, technology direction).

Companion documents: [product brief](../product/PRODUCT_BRIEF.md),
[beverage scope](../product/BEVERAGE_SCOPE.md),
[architecture overview](../architecture/OVERVIEW.md),
[invariants](../architecture/INVARIANTS.md),
[public/private boundary](../architecture/PUBLIC_PRIVATE_BOUNDARY.md),
[naming policy](../architecture/NAMING.md),
[reuse baseline](../architecture/REUSE_BASELINE.md),
[platform feasibility](../architecture/PLATFORM_FEASIBILITY.md),
[ADRs](../architecture/adr/), [decision register](DECISIONS.md),
[status](STATUS.md).

## 1. Goal

A free, open-source, offline-first application for designing, improving, and
brewing beer, wine, mead, cider, and sake recipes, released desktop first,
then Android and iOS. Useful without an account, AI, hardware, a shop, or a
network. Optional: local or bring-your-own-key AI, BrewIO hardware monitoring
and verified control, local homebrew shop connections, and — the one paid
piece — a hosted connector for cloud AI assistants.

## 2. Principles

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
6. **Free core, optional paid connector** ([ADR 0002](../architecture/adr/0002-open-core-boundary.md)).
7. **Accessible by default.** WCAG 2.1 AA minimum, WCAG 2.2 AA target.

## 3. Release boundaries

**Desktop 1.0.** Offline recipe editor: ingredient catalog with custom
ingredients, equipment profiles, list and graph process editing, undo/redo,
autosave and recovery, revisions, native import/export, BeerXML with loss
reports, Lumina exchange via files, preview and printable summary. Beverage
calculations per [BEVERAGE_SCOPE.md](../product/BEVERAGE_SCOPE.md) (D-006).
If the graph slips, 1.0 may ship with the list editor and the graph follows
in 1.1 (D-015).

**Later releases.** Batches and recipe improvement, AI tiers 1–2, hardware
monitoring and control, shop connections, mobile, and the paid cloud
connector. Their interfaces are anticipated early; none delays 1.0.

**Deferred unless separately approved.** See non-goals in the
[product brief](../product/PRODUCT_BRIEF.md#non-goals-unless-separately-approved).

## 4. Phase overview

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

## 5. Phases

### Phase 0 — Discovery and decisions

**Work**
- Resolve repository home (D-004) and macOS build hardware (D-008).
- Complete the reuse matrix from [REUSE_BASELINE.md](../architecture/REUSE_BASELINE.md):
  for each Lumina, brewconvert, and brewpanel asset — owner, license,
  provenance, port/reuse/reference/drop, and size estimate.
- Size the brewconvert port and the Lumina formula/validation port (ADR 0004).
- Inventory brewpanel's local working tree (not GitHub `master`) and confirm
  which README claims hold by running its tests.
- Classify data provenance: BJCP styles, ingredient catalog candidates (D-009),
  Lumina fixtures.
- Decide beverage launch staging (D-006) with a formula coverage table and
  sources for each formula.
- Draft the recipe schema v0, editor command contract v0 (also the AI write
  contract, ADR 0007), and Lumina ⇄ Carboy field mapping.
- Draft the revision envelope (recipe/revision IDs, parent list, schema
  version semantics) and the canonical JSON + hashing rule (RFC 8785 JCS
  candidate), so the app and the AI Bridge compute identical hashes.
- Co-review the command contract and envelope with the AI Bridge plan
  (private `carboy-bridge` repository, `docs/planning/CORE_DEPENDENCIES.md`).
- Decide license (D-001), platform targets (D-007), UI framework candidates
  (D-010), native file extension (D-016).
- Define performance budgets from expected workloads (recipe size, catalog
  size, graph node counts) — measured, not invented.

**Deliverables:** reuse matrix, port sizing, schema v0, command contract v0,
Lumina mapping draft, revision envelope and hashing rule, formula coverage
table, performance budgets, updated ADRs and decision register, Phase 1 spike
plan.

**Exit criteria:** every reused asset has an owner, license, and provenance
status; every open decision has an owner and target phase; nothing is
described as implemented that is a stub or a plan.

### Phase 1 — Platform proof

**Work**
- Minimal app: edit one quantity, compute one verified result (e.g. OG),
  save/reopen via SQLite, export/import a native file.
- Build and run on Windows, macOS, Linux, Android, iOS (simulators and real
  devices where available; document anything unverified).
- **Graph spike**: candidate graph library × candidate UI framework; test
  selection, drag plus non-drag alternative, pan/zoom vs. drag conflicts,
  keyboard operation, screen-reader names, large-recipe performance on
  WebKitGTK and iOS WKWebView.
- **Sidecar track (non-blocking)**: package the BrewIO host for desktop,
  notarize on macOS, exchange simulator telemetry over stdio. Define startup,
  readiness, shutdown, timeout, crash recovery, version mismatch.
- Evaluate secret storage, file associations/sharing, and Rust-side HTTP.

**Deliverables:** runnable spike, CI build matrix, graph spike report, sidecar
report, accepted or revised ADRs 0003, 0004, 0006.

**Exit criteria:** Recipe Core runs unchanged on desktop and mobile; graph
spike meets accessibility and performance bars on the weakest webview, or the
fallback shell is adopted; packages install without a separate Python or
runtime. No mobile claim based on a responsive browser preview.

### Phase 2 — Recipe Core, native format, Lumina parity

**Work**
- Recipe model, typed quantities with decimal arithmetic, provenance,
  statistics layers, formula registry with versioned formulas.
- Unit conversions, including count/package additions and unknown properties
  without invented conversions.
- Beer calculations ported from Lumina; launch non-beer calculations per
  D-006, each with cited sources.
- Validation: references, topology, stage semantics, beverage-specific rules.
- Scaling rules and precision/rounding policy.
- Native serialization, schema validation, migrations, rejection of newer
  schemas.
- Shared fixture suite and runner usable from both TypeScript and Python;
  Lumina ⇄ Carboy round-trip fixtures.

**Deliverables:** Recipe Core and Recipe Format (native) packages, model
documentation, formula coverage table, fixture suite.

**Exit criteria:** core runs with no UI/storage/device/AI dependency;
unsupported calculations are explicit; parity fixtures pass against Lumina
or discrepancies are documented and resolved; serialization round trips
preserve results within declared tolerances; Recipe Core, Recipe Format, and
Editor Commands also run under Node in CI (the AI Bridge imports them
as libraries).

### Phase 3 — Library, catalog, equipment profiles, recovery

**Work**
- Recipe create/open/save/duplicate, revisions, search, recoverable delete vs.
  permanent delete, unsaved-draft behavior.
- Transactional autosave, crash recovery, backups, migration backup/restore.
- Provenance-reviewed bundled ingredient catalog (D-009); custom ingredients;
  explicit catalog refresh producing a reviewed change.
- Equipment profiles (design from Lumina's `equipment_profiles.py`), snapshot
  into revisions.
- Preferences stored separately from recipe content.

**Exit criteria:** recipes survive restart; interrupted writes do not corrupt
the library; migration failure restores the backup; catalog updates never
alter saved recipes.

### Phase 4 — Direct editing, BeerXML, printing

**Work**
- Shell, recipe summary, ingredient search, inspectors, process list, using
  Lumina tokens as the visual starting point.
- Add/duplicate/remove/move ingredients and stages via editor commands;
  undo/redo; dirty state; immediate recalculation.
- Required vs. optional fields, estimated values, blocking warnings.
- Scaling and equipment-profile selection.
- BeerXML import/export ported from brewconvert with loss reports; import
  review (resolve blocking issues before commit), using Lumina's validation
  rules.
- Export preview and printable summary.

**Exit criteria:** create, edit, scale, save, reopen, import, export, print,
and delete a recipe by mouse, keyboard, or touch; every accepted edit is
undoable; BeerXML fixtures match brewconvert's reports.

### Phase 5 — Interactive process graph

**Work**
- Render stages, flows, and additions from canonical state using the library
  chosen in Phase 1.
- Selection, inspectors, drag/move with valid-target feedback, pan/zoom,
  reversible auto-layout; presentation metadata kept separate.
- Branch/merge editing only where validation and calculation are defined;
  incomplete calculations clearly marked.
- Narrow-screen, touch, screen-reader, and large-recipe testing.

**Exit criteria:** graph edits are identical to equivalent list commands;
repositioning never changes the recipe; invalid topology is rejected without
data loss; every essential edit works without dragging or a mouse.

### Phase 6 — Desktop 1.0 and open-source launch

**Work**
- Installers, signing/notarization, versioning, update strategy, release
  notes, reproducible build documentation.
- Minimum supported systems from tested results.
- LICENSE/NOTICE, dependency and data license inventory, CONTRIBUTING,
  SECURITY, supported-feature matrix.
- Round-trip and BeerXML loss examples; principal offline workflow tested on
  each platform, including a touch device.
- User documentation, starter recipes per beverage, recovery instructions,
  limitations. Opt-in diagnostics with redaction; no automatic recipe upload.

**Exit criteria:** 1.0 scope works offline on every advertised platform;
known limitations documented; publication follows the owner's authorization.

### Phase 7 — Batches, guided brewing, recipe improvement

**Work**
- Batches from immutable revision and equipment snapshots.
- Actual volumes, gravity, temperatures, timings, deviations, notes;
  brew-day progression; timers from persisted deadlines; fermentation history.
- Defined behavior for clock changes, sleep/resume, closed windows; never
  imply logging while the host is asleep.
- **Improvement loop**: compare predicted vs. measured (efficiency,
  attenuation, volumes); suggest equipment-profile calibration; offer an
  explicit "new revision from this batch" with a reviewed diff.

**Exit criteria:** recipe edits cannot rewrite batches; restart restores
session state; gaps in observations stay visible; calibration suggestions are
never applied silently.

### Phase 8 — AI tiers 1–2

**Work**
- Provider-neutral AI tool surface (ADR 0007): scoped reads, proposals as
  typed command lists, streaming, cancellation, errors.
- Tier 1: one local provider (e.g. Ollama) and one API provider; keys in
  secret storage; remote data preview; timeouts and budget controls.
- Tier 2: local MCP connector for desktop AI clients, same tool surface.
- Proposal review UI: diff of ingredients, process, and recalculated results;
  acceptance as one undoable operation with AI provenance.
- Explain that a consumer chat subscription does not necessarily include API
  access.

**Exit criteria:** disabling AI leaves the app complete; malformed or invalid
output cannot mutate state; AI numbers never override Recipe Core; no AI path
to storage, export, or hardware.

### Phase 9 — BrewIO host integration and monitoring

**Work**
- Decide: extract BrewIO first, or a versioned adapter over brewpanel
  (ADR 0005).
- Provenance and compatibility review for redistributed code.
- Protocol over stdio (sidecar) and authenticated WebSocket (LAN host).
- Simulator, Tilt, iSpindel with explicit setup and connect actions.
- Normalized readings: source identity, observation/receipt timestamps, units,
  freshness, calibration; association with batches; reconnects, duplicates,
  reordering, retention.
- Verify with real devices on each advertised platform before claiming
  support.

**Exit criteria:** simulator integration passes over both transports; each
advertised device is physically verified; stale/disconnected readings are
visible; monitoring cannot alter recipes.

### Phase 10 — Verified equipment control

**Work**
- One brewing-system model/firmware, implemented incrementally against real
  hardware.
- Preserve BrewIO's confirmation and audit boundary; validate bounds, fresh
  device state, prerequisites, approval scope/expiry, device identity.
- Distinguish command accepted vs. action completed; define uncertain
  outcomes, retries, disconnect policy; never blindly replay actuator commands.
- Recipe-to-device execution plans are inspectable before activation.

**Exit criteria:** confirmation cannot be bypassed by UI or AI; all attempts
auditable; disconnect behavior documented and tested.

### Phase 11 — Local homebrew shop connector; extended Lumina exchange

**Work**
- Generic, published shop connector contract: catalog lookup, product
  matching with package sizes and substitutions, availability timestamps,
  shopping lists, optional order/pickup submission with idempotency.
- First implementation: Pacific Brewing Supplies, against the actual deployed
  Drupal catalog and STAR contracts (inspect first; invent nothing).
- User selects a shop or none; no default shop.
- Extended Lumina exchange beyond files (if Lumina exposes an API by then);
  opening attachments; QR codes reference transferable content.

**Exit criteria:** exchange and shopping lists work without an Carboy
account; orders require explicit intent and have a reliable outcome; local
data is never shown as authoritative shop stock.

### Phase 12 — Mobile

**Work**
- Android first, then iOS; scope per D-018 (full offline editor vs. companion).
- Mobile adapters: storage, sharing, secrets, notifications, navigation,
  accessibility. Adapt interactions; don't shrink the desktop layout.
- LAN BrewIO host and LAN AI connections with pairing and host identity.
- Background limits documented; persistent host for unattended logging.
- Store accounts, signing, privacy disclosures, metadata, beta tracks
  (Play closed testing requirement), current policy review.

**Exit criteria:** calculations match desktop fixtures; essential touch edits
and file exchange work; host dependencies for hardware/AI are stated
accurately.

### Phase 13 — Carboy AI Bridge (paid, optional)

**Decided (2026-10-11):** a separate, lightweight service (language follows the
Recipe Core decision, ADR 0004; TypeScript proposed) in its
own private repository (proposed `carboy-bridge`) on its own domain;
stores a hosted copy of opted-in recipes; syncs with the app; imports Recipe
Core, Recipe Format, and Editor Commands directly (ADR 0002). The Bridge
service is planned and built in its own repository; this phase covers the
Carboy side and the shared contract. Bridge planning can start earlier than
Phase 13, but the shared contract depends on Carboy's recipe schema and
editor command contract (Phase 0 drafts, Phase 2/4 stable).

**Prerequisites:** D-011a (sync model), pricing and terms decided by the
owner; Phase 8 tool surface stable.

**Work (Carboy side)**
- Published AI Bridge contract: sync API, document format (Carboy native
  format, owned by `recipe-format`), proposal format (editor commands).
- App sync client: opt-in pairing, per-recipe or library sync scope, pull of
  AI-created recipes and proposals into the review queue, conflict handling
  with immutable revisions, revocation and remote deletion.
- Publish Recipe Core, Recipe Format, and Editor Commands as versioned
  packages the Bridge can pin (Node-compatible, no browser globals).
- Schema-version negotiation: the Bridge must not hand a device a document
  newer than that device supports (see D-022).

**Work (Bridge side, tracked in the Bridge repository)**
- Remote MCP endpoint and assistant plugins (verify current ChatGPT and Claude
  requirements first), OAuth, accounts, subscriptions, online library, audit,
  privacy/retention/deletion, abuse protection.

**Exit criteria:** the free app is unchanged for non-subscribers; an assistant
request such as "create an all-grain 5-gallon stout in Carboy" produces a
validated, calculated recipe with AI provenance that appears in the app after
sync; edits to existing recipes arrive as reviewable proposals; revocation
takes effect immediately; a lapsed subscription still allows full export.

### Phase 14 — Maintenance and extensions

Calculation fixtures, migrations, dependency updates, platform builds, device
compatibility evidence; expand beverage calculations and branch/blend math;
new providers, devices, and shops through existing interfaces. Cloud sync
only as a separately designed feature.

## 6. Verification strategy

| Area | Required evidence |
|---|---|
| Calculations | Cited formulas; independently checked fixtures; unit and scaling invariants; beverage-specific assumptions |
| Parity | Shared fixtures pass in TypeScript and Python (Lumina/brewconvert) |
| Serialization | Round trips; schema validation; migrations; newer-version rejection |
| Persistence | Interrupted writes; recovery; backups; migration rollback; revision immutability |
| Editor | Representative workflows; undo/redo atomicity; invalid drafts |
| Graph | Semantic equivalence with list commands; valid/invalid moves; layout isolation |
| Accessibility | WCAG 2.2 AA review; keyboard-only completion; screen readers; touch targets; zoom |
| AI | Invalid proposals; provider failure/cancellation; secret redaction; reviewed acceptance |
| Hardware | Simulated faults; physical verification per model/firmware/platform |
| Packaging | Fresh-machine install/open/save/export on every supported target |
| AI Bridge | Auth, scope enforcement, revocation, deletion, rate limits, penetration test before launch |

## 7. Risks

| Risk | Mitigation | Resolution point |
|---|---|---|
| brewconvert port larger than expected | Size in Phase 0; staged port; fixtures as oracle | 0, 4 |
| WebKitGTK / iOS webview cannot handle the graph | Phase 1 spike; Electron + Capacitor fallback | 1 |
| No macOS build hardware | Mac or hosted macOS runners (D-008) | 0 |
| Non-beer formulas wrong or unsourced | Cited, versioned formulas; domain review; staged launch | 0, 2 |
| Ingredient data cannot be redistributed | Provenance review; build an owned catalog | 0, 3 |
| Python/TypeScript implementations drift | Shared fixture suite in both CIs | 2+ |
| Shop neutrality questioned | Generic contract; no default shop | 11 |
| AI Bridge data-custodian and security obligations | Opt-in per recipe; export always available; privacy/retention design in the Bridge plan | 13 |
| Name/trademark conflict | Check before public launch (D-013) | 0, 6 |
