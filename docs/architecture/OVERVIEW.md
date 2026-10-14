# Carboy — Architecture Overview

Status: Planning baseline, 2026-10-09. Technology choices referenced here are
**proposed** until their ADR is `Accepted` (see [`adr/`](adr/)). Read with the
[invariants](INVARIANTS.md), the [public/private boundary](PUBLIC_PRIVATE_BOUNDARY.md),
and the [naming policy](NAMING.md).

## 1. Shape

One installed application — a modular monolith ([ADR 0001](adr/0001-modular-monolith.md)).
No independently deployed services for editing, calculation, catalog, AI, or
storage. Two processes outside the app are optional and separately owned:

- the **BrewIO host** (Python, from `codesamples/brewpanel/`) — a managed sidecar on
  desktop or a LAN host for mobile and unattended monitoring;
- the **Carboy AI Bridge** — the one paid, hosted service, used only
  by users who opt in ([ADR 0002](adr/0002-open-core-boundary.md)).

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TypeScript UI (framework: D-010)                                         │
│   ingredient list · process list · process graph · inspectors · batches  │
├──────────────────────────────────────────────────────────────────────────┤
│ TypeScript modules                                                       │
│   Recipe Core · Recipe Format · Editor Commands · Catalog · Library      │
│   Equipment Profiles · Brew Sessions · AI Assistance · Shop · Hardware   │
├────────────────────────────── platform ports ────────────────────────────┤
│ Shell adapters (desktop: Tauri, thin Rust — ADR 0003)                    │
│   SQLite · secrets · files · notifications · outbound HTTP · sidecar     │
└───────────────┬──────────────────────────────┬───────────────────────────┘
                │ BrewIO protocol (ADR 0005)   │ local AI connector (ADR 0007)
                │ stdio | WebSocket            │ MCP on this machine
      ┌─────────┴──────────┐            ┌──────┴───────────────┐
      │ BrewIO host        │            │ Desktop AI clients   │
      │ sidecar | LAN host │            └──────────────────────┘
      └────────────────────┘
                                         optional, paid, opt-in:
                                  ┌──────────────────────────────┐
     cloud AI assistants  ⇄  MCP  │ Carboy AI Bridge          │ ⇄ Carboy app
                                  └──────────────────────────────┘

Shared fixture suite ⇄ Lumina (Python) and brewconvert (Python) parity
```

## 2. Modules

| Module | Owns | Boundary |
|---|---|---|
| Recipe Core | Recipe types, units, deterministic calculations, validation, scaling, formula registry | Pure TypeScript; no DOM, Node, storage, network, AI, device, or shell dependency |
| Recipe Format | Native exchange format, schema versions, migrations, BeerXML import/export with loss reports | Depends only on Recipe Core; portable XML parsing, no browser globals |
| Editor Commands | Typed edit commands, validation, undo/redo, proposal diffs | Only path that changes canonical recipe state |
| Ingredient Catalog | Catalog definitions, custom entries, search, catalog versions | Recipes snapshot the properties they use; catalog updates never silently alter recipes |
| Recipe Library | Persistence, revisions, recovery, backups | Exposes repository interfaces; nobody else touches its tables |
| Equipment Profiles | Capacities, efficiency, losses, boil-off, calibration history | Usable without hardware; profile assumptions are snapshotted into revisions |
| Brew Sessions | Batches from recipe snapshots, measurements, timers, deviations, improvement suggestions | Recipe edits never rewrite batches |
| AI Assistance | Provider configuration, context building, proposals, provenance, local AI connector | No direct storage writes; no actuator path |
| Shop Integration | Shop connector contract, product matching, shopping lists, orders; future design: [SHOP_BRIDGE.md](SHOP_BRIDGE.md) (capability levels, Purchase Resolver) | Optional; shop systems stay authoritative |
| Hardware Integration | Configured devices, BrewIO host connection, telemetry mapping to batches | BrewIO owns transport and protocol details |
| AI Bridge Client | Opt-in pairing, sync scope, pulling AI-created recipes and proposals | Optional; removable without affecting anything else |
| App Shell | Composition root, navigation, settings, platform capability wiring | Explicit initialization; importing a module starts nothing |

## 3. Dependency rules

1. Recipe Core is the lowest domain layer and is tested without the shell.
2. Modules depend on each other's public entry points only. Enforce with a
   boundary linter (dependency-cruiser or eslint-plugin-boundaries) from the
   first commit of code.
3. Commands and queries are direct typed calls. Events are only for committed
   facts (`RecipeRevisionSaved`, `MeasurementReceived`).
4. Durable event logs exist only where history is the product: batches and
   telemetry. No general event bus.
5. The composition root wires modules and adapters. No global mutable state,
   no circular imports.
6. Shared utilities stay small and owned. No unowned `shared/` second core.
7. All modules are compiled in. Optional features can be disabled; no runtime
   code download (required for mobile store policies anyway). Extensions
   are data-only packs or out-of-process integrations
   ([ADR 0008](adr/0008-extension-model.md), Proposed).
8. Packages are workspace packages in one monorepo. Separate publication
   (e.g. Recipe Core as a library) follows a real reuse need.

## 4. Platform ports

Interfaces in `packages/platform-contracts`, implemented per shell:

| Port | Desktop (Tauri) | Mobile (Tauri mobile, or fallback shell) |
|---|---|---|
| Storage | SQLite via Rust plugin | SQLite via plugin |
| Files / sharing | Native dialogs, file associations | Share sheet / document picker |
| Secrets | OS keychain/credential store | Keychain / Keystore |
| AI transport | Rust-side HTTP (avoids webview origin limits, keeps keys out of the webview) | Same, LAN or remote only |
| Hardware | BrewIO sidecar (stdio) or LAN host | LAN host only |
| Notifications / lifecycle | OS notifications, single-instance | Platform notifications, suspend/resume |
| Local AI connector | Local MCP endpoint | Not offered initially |

Rust code stays thin: adapters only, no domain logic.

## 5. Authoritative data model

**Recipe and revision.** Stable recipe ID; immutable saved revisions. A
revision holds beverage type, target volumes, ingredients, process topology,
equipment assumptions, calculation settings, notes, and schema version.
Calculations use documented canonical units; user units are preferences.

**Values and provenance.** Every quantity is typed (dimension, unit, value as
decimal string) and carries provenance: `declared`, `imported`, `inferred`,
`calculated`, `measured`, `manually_entered`, `ai_proposed`. Recipe statistics
keep independent layers — `declared`, `imported_estimate`, `calculated`,
`measured` — and the default display prefers the source's own claim over a
recalculation. This vocabulary is adopted from Lumina
(`brains/recipes/quantity.py`, `brains/recipes/README.md`). Unknown stays
unknown, never zero.

**Ingredient additions** reference a snapshot of the properties used in
calculation, plus optional catalog identity and version. Catalog refresh is an
explicit, reviewed change.

**Process graph.** Stages and typed material-flow edges (transfer, addition,
loss, dilution, blend). Additions attach to a stage with explicit timing and
quantity. Launch supports an ordered process; the schema allows branches and
merges, but their calculations are marked unsupported until defined. Graph
coordinates, collapsed state, and viewport are presentation metadata; moving a
node never changes process semantics.

**Batch.** Created from a recipe revision and keeps that snapshot. Actuals,
measurements, timings, device identities, and deviations belong to the batch.
Turning batch learnings into a new recipe revision is an explicit action.

**Calculation provenance.** Each calculated value records formula ID and
version and the assumptions used.

## 6. Storage and exchange

- Local SQLite is authoritative on each device; no cloud required
  ([ADR 0006](adr/0006-local-persistence.md)).
- Revisions are stored as versioned JSON documents with index columns, so the
  stored form and the native exchange format share one schema and one
  migration path.
- Database schema and exchange schema still carry separate version numbers.
- Newer unknown schemas are rejected clearly, never partially overwritten.
- Imports are reviewed before committing and never modify the source file.
- Secrets, tokens, and device credentials never appear in exports.
- BeerXML conversion produces a loss/assumption report and is not the model
  for non-beer beverages.

## 7. Editing model

- Canonical state is immutable; edits are typed commands validated by Recipe
  Core. Patch-based state (e.g. Immer patches) provides undo/redo, makes a
  drag or an accepted AI proposal a single undoable step, and yields the diff
  shown when reviewing proposals.
- Draft text that fails validation never enters canonical state.
- List, graph, and ingredient views are projections of the same state.
- Every drag has a non-drag command equivalent (Add, Duplicate, Remove, Move
  to Stage, Move Before/After).

## 8. AI integration tiers ([ADR 0007](adr/0007-ai-integration-tiers.md))

| Tier | What | Cost |
|---|---|---|
| 1. In-app assistant | Local model (Ollama etc.) or user's API key; proposals reviewed in the app | Free |
| 2. Local AI connector | Local MCP endpoint so desktop AI clients on the same machine can read recipes and submit proposals | Free |
| 3. AI Bridge | Separately hosted private service (`carboy-bridge`): MCP endpoint for cloud assistants, online library synced to the app, reuses Recipe Core in-process | Paid, opt-in |

Across all tiers: AI reads through scoped queries and writes only proposals;
Recipe Core validates; the user accepts; AI never touches hardware.

## 9. Hardware ([ADR 0005](adr/0005-brewio-host-protocol.md))

One Python BrewIO host program, one versioned protocol, two transports: stdio
when supervised as a desktop sidecar; authenticated WebSocket when running as
a LAN host. Mobile is a LAN client only. State-changing actions keep BrewIO's
confirmation and audit boundary. Monitoring is owned by session/app lifecycle,
not by a UI widget.
