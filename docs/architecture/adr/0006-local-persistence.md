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

**Hard-kill recovery on all desktops (2026-10-14, CI run 38639846127).**
`spikes/phase1/tools/kill_recovery.sh`: write revisions continuously,
kill the process (`kill -9`; `taskkill /F` on Windows), reopen, and require
integrity `ok` with every committed revision verifying. Three rounds per
OS, WAL, `synchronous=2`:

| OS | Revisions after each round (all verified, integrity ok) |
|---|---|
| Windows (WebView2) | 588 · 1,417 · 2,259 |
| macOS (WKWebView) | 2,616 · 5,557 · 7,215 |
| Linux (WebKitGTK) | 7,117 · 14,518 · 21,844 |

No partial or unverifiable revision appeared after any kill. (Process kill,
not power loss: power-loss durability rests on the `synchronous`/`fullfsync`
settings above.)

**Runs of 2026-11-05 (42169029431, 42170826631, 42175619190).** Windows and
Linux passed their one run. macOS passed two of three. The failing run reached
round 1 with every revision verified, killed the app in round 2, reopened it, and
the Library page loaded, but it **never reported**, and the step timed out at 6
minutes. Rounds normally take about 14 seconds, so that was a hang, not slowness.
There is no sign of corruption: no check failed, because none finished. The
same code then passed all three rounds, so it is intermittent and its cause is
**unknown** (candidates: reopening right after a kill, or the hidden window). It
needs reproducing before the Recipe Library relies on this path. The real
library needs a bounded open, so a stuck database can't hang the app silently.

**Mobile (2026-11-05).** iOS Simulator: saved a revision, relaunched, and
verified 3/3 with integrity ok, WAL, `synchronous=2`. A simulator's disk says
nothing about device durability. Android: the shell starts on an emulator, and
SQLite is unverified there.

**Recipe Library (2026-11-06, Linux, Node's SQLite).** The repository in
[RECIPE_LIBRARY.md](../RECIPE_LIBRARY.md) passes `SIGKILL` during a transaction,
during a migration, and during saves, and a failed migration rolls back with its
backup intact. That is the first direct evidence for item 2. Through the spike shell on Linux,
on one `rusqlite` connection, it also survives hard kills (5 rounds, 2,532
revisions verified). Item 2 stays open: other platforms and migration through the
shell haven't run. The connection requirement this ADR's Measurements noted is
now met by construction: the library doesn't use the plugin's pool.

**macOS hang, reproduced (2026-11-06, run 42333150516 at `aa36331`; OPEN).**
20 rounds on macOS 26.7: 5 passed, **15 stalled**, and Linux showed none in 8.

| Finding | Evidence |
|---|---|
| Real stalls, not slowness | Passing rounds verify at 6,600–11,000 rows/s, in 0.5–3.7 s. Stalled rounds gave no report in 90 s |
| Where | 14 stalled in the verify loop, after the database had returned every row; 1 at `read-rows` |
| Not the app process | Stack sample of a stall: every thread idle, including the SQLite worker |
| Page not running | WebContent process asleep (`Ss`) in all 15, though the loop is CPU-bound. The 45 s watchdog never reported |
| Stored data unharmed | All 15 captured databases: integrity ok, and **all 616,800 revisions verify** (checked off the runner) |

**Not established:** the cause. The leading hypothesis is that WebKit suspends the
web process of a hidden window, since the test uses `SPIKE_HIDDEN=1`, but the web
process was never sampled and there has been no visible-window control. The
watchdog's silence is weak evidence too, because a microtask-only loop would
also starve a timer. `RECOVERY_WINDOW=visible` and web-process sampling are
ready for the next macOS run. If the hypothesis holds, this is a test-harness
condition, but a real app verifying in a background window would meet it too.

**Visible-window control (2026-11-07, at `5db261f`; still OPEN).** On a native
Intel Mac (macOS 15.8.1, WebKit 20621.3.11.11.3), 20 rounds each with a fresh
database, `library.html`:

| Window | Hangs (no report) | Stalls (watchdog reported) | Passed |
|---|---|---|---|
| Hidden | **13** (every round from 9 on; 3 at `read-rows`, the rest in verify) | 0 | 7 |
| Visible, on screen and uncovered in every check, machine kept awake | **0** | 1 (round 19, see below) | 19 |

**This comparison is weaker than its counts suggest.** Two confounds, pointed
out by the Mac check itself:

1. **More differed than the window.** Only the visible run had sleep prevention
   (`caffeinate -dims`) and a window logger polling every 2 s. App Nap, timer
   throttling, or idle behaviour could follow from the missing sleep prevention
   as well as from the hidden window, so this pair can't separate them.
2. **Rounds aren't independent.** Each run grows one database, the hidden hangs
   cluster (every round from 9 on), and the visible run wrote about 4 times more
   revisions per round (2,318 against 434 in round 1). A per-round significance
   test overstates the evidence; this is closer to one run against one run.

The slower writing while hidden is itself consistent with throttling, but it is
not a measurement of it.
The same run's `repo.html` (Recipe Library through the shell's own connection)
hung in round 3 while hidden, and CI at the same commit (run 42440845204,
hidden) hung in 10 of 20 `library.html` rounds and in round 3 of 3 `repo.html`
rounds. Windows and Linux passed everything, natively and in CI.

| Observation (14 sampled hangs) | Evidence |
|---|---|
| App process idle | Its main thread waiting in the event loop in all 14 |
| Web process main thread | Idle in its run loop in 4. In 10, one unbranched stack at the same instruction in every sample, at frames that don't wait (text conversion, GC marking, a timer, JSON parsing, IPC decoding). That fits a thread that isn't being scheduled; the OS task state that would show it needs root and wasn't read |
| JIT helper | Busy in 2 of 14, also on a single unchanging frame |
| Stored data | Every report that finished verifies completely |

**What this establishes:** on this Mac, one hidden run without sleep prevention
hung often and one visible run with it didn't. **Not established:** whether the
window, the sleep prevention, or both matter; the mechanism (for example, WebKit
or the OS suspending a hidden window's web process); and any fix. **Next, a
matched comparison:** hidden and visible each run with the same sleep prevention
and the same logging, and ideally hidden with and without it, with the same
write volume per round (a fixed number of revisions, not a fixed time). The hidden-window condition
is set by the test harness, but a real app verifying in a background window
could meet it.

**Separate finding, visible run: verification slows as the library grows.**
`read-rows` took 1.1 s in round 1 and 13–19 s by rounds 17–20 (about 50,000
revisions); in round 19 it took 43.7 s, so the page's 45 s watchdog reported a
stall although the page was alive. This is a performance question for the
library's reads on that machine, not evidence of a hang.

**Acceptance status.** The durability setting is supported by evidence. The
ADR as a whole is **not yet acceptable**: evidence item 1 needs Android and a
device run, item 2 still needs the Phase 3 migration-rollback tests, and the
macOS hang above is unexplained. It stays Proposed.
