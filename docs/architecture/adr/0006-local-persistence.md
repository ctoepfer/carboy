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

## Measurements

**Runtime configuration (2026-10-13).** The spike reads the settings the
SQLite plugin actually uses: Linux reports `journal_mode=wal`,
`synchronous=2` (FULL). `tauri-plugin-sql` 2.5.0 uses sqlx, which leaves
`synchronous` at SQLite's compile-time default (FULL) and the bundled
SQLite sets no other default. Because the plugin holds a connection pool
and `PRAGMA synchronous` is per connection, the real Recipe Library must
set durability in its connection options, not with a one-off PRAGMA.

**FULL vs NORMAL under WAL, one commit per save, ~3 KB documents**
(`spikes/phase1/tools/sqlite_durability_bench.py`, 2 × 300 commits each;
Linux 7.0, ext4 on the app's data disk, SQLite 3.53.1):

| Setting | Median per save | 95th percentile | Worst |
|---|---|---|---|
| FULL | 3.0 ms | 7.2–7.3 ms | 16–32 ms |
| NORMAL | 0.03 ms | 0.04–0.05 ms | 58–62 ms (checkpoint) |

FULL costs a few milliseconds per save, off the UI thread, for an
application that saves on user actions and autosave. NORMAL is faster on
average but has larger worst-case pauses and can lose the most recent
commits on power loss. **These numbers support keeping FULL.** 

**CI runners ([run 38509477157](https://github.com/ctoepfer/carboy/actions/runs/38509477157); indicative only, runner disks are not user hardware).**
Runtime configuration on all three desktops: `journal_mode=wal`,
`synchronous=2` (FULL).

| Runner | SQLite | FULL median / p95 / worst | NORMAL median |
|---|---|---|---|
| Windows | 3.49.1 | 12.5 / 32–35 / 67–93 ms | 0.04 ms |
| macOS | 3.53.4 | 0.3–0.4 / 0.8–0.9 / 1.7–12 ms | 0.05 ms |
| Linux | 3.45.1 | 0.3–0.4 / 0.5 / 0.8–1.2 ms | 0.04 ms |

Windows is the slowest and still well under a frame per save at the
median; FULL stays the default.

**macOS caveat (storage configuration).** On macOS, `fsync` doesn't force
the drive's write cache to stable storage; SQLite uses `F_FULLFSYNC` only
when `PRAGMA fullfsync` is on, and it is off by default
(<https://www.sqlite.org/pragma.html#pragma_fullfsync>). The fast macOS
FULL figures above reflect that. **Follow-up before this ADR is
accepted:** set `fullfsync` (and `checkpoint_fullfsync`) on Apple
platforms through the connection options and measure the cost.

**`fullfsync` on macOS, measured (2026-10-13, CI run 38515541034; macOS 26.6
arm64 runner, SQLite 3.53.4, 2 × 200 saves of ~3 KB, WAL):**

| Setting | Median per save | 95th percentile | Worst |
|---|---|---|---|
| FULL, `fullfsync` off | 0.25–0.30 ms | 0.75–0.90 ms | 1.0–12 ms |
| **FULL, `fullfsync` + `checkpoint_fullfsync` on** | **1.4–1.5 ms** | **6.5–7.3 ms** | 25–135 ms |
| NORMAL, either | ≈0.04 ms | 0.05–0.16 ms | 0.3–0.5 ms |

Real power-loss durability on macOS costs about 1.2 ms more per save at the
median, with occasional pauses up to about 135 ms on this runner (CI disks
are not user hardware). For saves driven by user actions and autosave,
that is acceptable. On Linux the pragmas are accepted and have no effect,
as documented.

**Recommendation (durability setting):** WAL + `synchronous=FULL`
everywhere, and on Apple platforms (macOS, iOS) also `fullfsync=ON` and
`checkpoint_fullfsync=ON`, set in the connection options of every pooled
connection.

**Acceptance status.** The durability setting is supported by evidence. The
ADR as a whole is **not yet acceptable**: evidence item 1 needs a mobile
save/reopen (Android, iOS), and item 2 needs the Phase 3 interrupted-write
and migration-rollback tests. It stays Proposed.
