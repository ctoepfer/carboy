# ADR 0006: SQLite with revisions stored as versioned JSON documents

- Status: Proposed
- Date: 2026-10-09
- Decision owner: Charles Toepfer

## Context

Carboy needs local, transactional storage on all five platforms; immutable
recipe revisions; autosave and crash recovery; and a portable native exchange
format with migrations.

## Decision (proposed)

- **SQLite** on every platform, accessed through the shell's Rust side
  (e.g. `tauri-plugin-sql` or a small set of commands) behind a TypeScript
  repository interface owned by Recipe Library.
- Recipe revisions, batch snapshots, and equipment-profile snapshots are
  stored as **versioned JSON documents** with a few index columns (IDs,
  names, beverage type, timestamps). The stored document and the native
  exchange document share one schema and one migration path.
- Mutable, relational data (catalog, preferences, device configuration,
  telemetry) uses ordinary tables.
- Database schema version and document schema version are tracked separately.
- WAL mode, transactional autosave, pre-migration backups.
- **Durability default (owner, 2026-10-13):** WAL with
  `synchronous=FULL`, subject to validating the actual storage
  configuration on each platform. Saved recipes, revisions, and batch
  records come first. `NORMAL` is considered only after the latency cost
  of `FULL` is measured and the durability trade-off is written down.

## Alternatives considered

- **Fully normalized recipe tables**: two schemas (DB and exchange) and two
  migration paths for immutable data that is always read whole.
- **SQLite WASM in the webview (OPFS)**: storage durability on WebKit is less
  predictable; keep data under the native side's control.
- **Plain JSON files** (as Lumina does): no transactions or indexing for a
  growing library and telemetry.

## Evidence required to accept

1. Phase 1: save/reopen round trip on desktop and mobile.
2. Phase 3: interrupted-write and migration-rollback tests pass, including
   transaction boundaries and preservation of the last valid committed
   revision.
3. Latency of `synchronous=FULL` vs `NORMAL` under WAL measured on the
   target platforms (Phase 1 spike first).
