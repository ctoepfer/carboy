# Desktop platform check

How a native machine tests one exact commit and reports back. It uses the
existing scripts. CI covers what it can; this covers what needs a real machine.

The candidate commit comes with the request. Test **that SHA only**, and report
against it: a result on any other commit is a result for that commit.

## Rules

- Use a new `git worktree`. Don't touch existing checkouts, branches, or running
  diagnostics. If something else is using `spike-shell`, stop and say so: the
  kill test kills every process with that name on the machine.
- Set `SPIKE_DATA_DIR`, so nothing reads or writes the app's normal data folder.
  The `XDG_*` variables don't work on macOS or Windows. The webview's own profile
  goes to `$SPIKE_DATA_DIR/webview` on Windows and Linux; macOS's WKWebView
  ignores that setting and keeps its own website data store.
- A skipped or unfinished check is reported as that, never as a pass.
- Change no code in the candidate. Put a fix on its own branch and report it.

## Set up (all desktops, in bash; Git Bash on Windows)

Needs Node 22 or later, Rust, and git.

```sh
SHA=<candidate commit>
git fetch origin
git worktree add --detach ../carboy-check-${SHA:0:7} "$SHA"
cd ../carboy-check-${SHA:0:7}
git rev-parse HEAD              # must equal SHA
OUT=$(mktemp -d)                # keep this for the report
export SPIKE_DATA_DIR=$(mktemp -d)
```

On Windows, use a path the native programs understand:

```sh
OUT=$(cygpath -m "$(mktemp -d)")
export SPIKE_DATA_DIR=$(cygpath -m "$(mktemp -d)")
```

## Check (all desktops)

```sh
npm ci
npm test                        # 1. packages
spikes/phase1/spike.sh test     # 2. every spike page
cd spikes/phase1
EXE=$PWD/shell-tauri/src-tauri/target/debug/spike-shell
RECOVERY_PAGE=repo.html RECOVERY_DB=repo.db \
  tools/kill_recovery.sh "$EXE" 3 6 "$OUT/repo"   # 3. Recipe Library through the shell
```

| Check | Expected |
|---|---|
| 1. `npm test` | No failures, and none skipped on Node 22 or later. `npm test` runs each package in turn, so the last summary is only the last package's. Total them with `npm test 2>&1 \| tee "$OUT/npm-test.log" \| grep -E '^(# \|ℹ )tests '`. From `29b2e28` (draft storage, autosave, undo history) until stated otherwise: **431** (recipe-core 184, ingredient-catalog 93, recipe-library 86, editor-commands 33, recipe-format 21, equipment-profiles 14). Before it, from `5db261f`: 388 |
| 2. `spike.sh test` | `PASS` on `checks`, `recipe`, `library`, `graph-react`, `graph-svelte`. Graph windows appear briefly |
| 3. Recipe Library | Every round `PASS`, then `rounds: 3, hangs: 0, stalls: 0, early exits: 0`. Each `after-kill-N.json` has `integrity` ok, `journal_mode` wal, `synchronous` 2, `verified` equal to `revisions`, and no `failures` |

On macOS, check 3's reports must also say `"apple": true` and `"fullfsync": 1`.

## Migration check (all desktops)

The Recipe Library's real 1 → 2 upgrade, which adds the `draft` table, run
through the Tauri shell on its own `rusqlite` connection. This replaces the
earlier version of this check (`b7d3781`), which used a test-defined step.

- **The fixture** is an old library: only the production version-1 step
  (`LIBRARY_MIGRATIONS` filtered to version 1), as an app from before drafts
  made it, with representative data (4 recipes, one of them deleted; 26
  revisions).
- **`success` and every retry** call `openSqliteStore(driver, { apple,
  backupPath })` with no `migrations` option: the library's own
  `LIBRARY_MIGRATIONS` and `migrate()`, exactly the app's path (`VACUUM INTO`
  backup, one `BEGIN IMMEDIATE` transaction, rollback on failure). Reports say
  `"migration_path": "production-default"`.
- **`fail`, `interrupt-memory`, and `interrupt-wal`** need a point inside the
  transaction, so they pass `LIBRARY_MIGRATIONS` with the production version-2
  step wrapped: its own `up` runs unchanged, then the test hook (and, for
  `interrupt-wal`, a step-start barrier before it). `migrate()` sets the version
  after the step returns, so inside the hook the version is still 1 and the
  draft table exists. Reports say `"production-step-with-test-hook"`.
- **Reopening** at version 2 uses `openSqliteStore` with no options and lists
  drafts through the library; at version 1 it uses the version-1 steps only.
  The checker compares tables and columns with the production schema, stated
  independently in `tools/migration_check.py`.

The hooks live on the test-only page `migrate.html`, which refuses to run
without `SPIKE_AUTO=1` and `SPIKE_DATA_DIR`.

Run it after checks 1–3, from `spikes/phase1`, with the same `SPIKE_DATA_DIR`
and `OUT` as above. No other `spike-shell` may be running, because the
interrupted cases kill every process with that name.

```sh
tools/migration_check.sh "$EXE" 3 "$OUT/migration"
```

One fixture is made once and copied fresh (checked by SHA-256) into every case.
Every database, backup, and webview profile stays under
`$SPIKE_DATA_DIR/migration-check/`; reports and logs go to `$OUT/migration/`.
Each round runs four cases:

| Case | What happens | Passes when |
|---|---|---|
| success | The production upgrade migrates 1 → 2, unmodified; the app is reopened | Version 2 with exactly the production `draft` table (its columns, no rows) and no other schema change; integrity ok; every recipe row and revision (id, recipe, parents, content hash) identical to the fixture, and every document verifies; the library reopens every live recipe's head as editable and lists no drafts; the backup reads as the fixture at version 1 |
| fail | The production step runs, then the hook throws, before the commit | Inside the transaction, the draft table was there (version still 1); the library reports `migration-failed`; after a reopen, version 1 with no draft table and the fixture's data; the backup is intact; a retry migrates once and passes the success checks; the first backup is unchanged |
| interrupt-memory | The production step runs, then the hook logs a barrier and waits; the harness kills the shell when the line appears (no timed sleep). The changes are small and stay in SQLite's page cache, so the WAL stays empty: **this case doesn't cover WAL recovery** | Same as fail: the draft table was inside the open transaction; the reopen is complete, never partial (version 1 as expected, or a completely migrated version 2); the backup is intact; a retry migrates once; the first backup is unchanged |
| interrupt-wal | The page stops first at a step-start barrier (transaction begun, nothing written) and continues when the harness creates `migrate.go`. After the production step, the hook shrinks its own connection's cache to 16 pages and writes 256 rows of 4,000 characters to a test-only table, so SQLite must spill uncommitted pages to the WAL; then a spill barrier. The harness reads the WAL file itself (header, salts, running checksums, commit field) | At step start the WAL holds no frames. At the spill barrier the WAL is larger than its 32-byte header and holds at least one complete, valid frame, none of them a commit frame; only then is the shell killed, otherwise the case fails and the app is only stopped. Uncommitted frames are still on disk after the kill. The reopen is version 1 exactly, with no draft table and no spill table; integrity ok; the fixture's data; the backup unchanged; a retry migrates once |

Expected: every case `PASS`, then `migration check: rounds: 3, cases passed: 12
of 12`. Only `interrupt-wal`, with its WAL evidence printed before the kill,
counts as evidence of recovery from uncommitted WAL frames; copies of the WAL at
step start and before the kill stay in `$OUT/migration/` (`*-start.wal`,
`*-prekill.wal`). A launch with no report within 90 s (`MIGRATION_LIMIT`) is a `HANG`; a
launch that stops without a report is `EXITED`. Either fails its case, and its
log stays in `$OUT/migration/`. A failed case's databases stay under
`$SPIKE_DATA_DIR/migration-check/`. The checker (`tools/migration_check.py`)
compares the page's JSON reports and hashes files; every database read happens
in the shell.

On macOS the window is hidden, as in check 3. If a launch hangs, report it with
its log rather than rerunning; `MIGRATION_WINDOW=visible` is a control to run
only when asked.

## macOS: the stall (open, no conclusion yet)

A matched experiment, not two long runs: one seed database is made once and
copied fresh into every trial, every trial writes the same number of revisions,
and three conditions run in rotated order (ABC, BCA, CAB, ...) with identical
timeouts, monitoring, and hold:

| Condition | Window | Sleep prevention |
|---|---|---|
| A | hidden | `caffeinate -dims` |
| B | visible | `caffeinate -dims` |
| C | hidden | none |

A against B varies only the window; A against C varies only sleep prevention.
Run it only when told to, after the main checks, from `spikes/phase1`:

```sh
tools/stall_experiment.sh "$EXE" "$OUT/stall-experiment"
```

Defaults: 6 blocks (18 trials), a 6,000-revision seed, 500 revisions per trial,
90 s for each reopen, a 60 s hold of any hung or stalled app, and no new trial
after 150 minutes. Expect about 10–30 minutes without hangs; each hang adds
about 3 minutes (captures at 40 s and 90 s, the 60 s hold). One trial can't
exceed about 6 minutes (180 s to write, 90 s to reopen, the hold, captures), so
the whole run ends within about 2 hours 40 minutes even if every trial hangs. Results: `results.csv` (per trial: condition, times,
database and WAL sizes before and after, revisions written, outcome) and
`summary.txt` (counts only).

During the run, keep condition B's window on screen and uncovered when it
appears, and don't use the Mac for anything else. Don't change sleep or display
settings between trials; `environment.txt` records them once. While a hung or
stalled app is held, the run prints the web process ID; `sudo taskinfo <pid>`
then is welcome **if the owner runs it**. An agent doesn't use `sudo`.

`HANG` means no report at all; `STALLED` means the page's own watchdog reported a
call that never returned (the app is now kept open for inspection); `EXITED` is a
crash or failed start; `WRITE-LIMIT` means the trial didn't write its revisions in
time, so its workload differs. Keep every trial folder that isn't `PASS`: `hang-N`,
`slow-N`, `stall-N`, and `*-end-N` hold process lists, stack samples of the app
and its web process, open files, and the database. Note any browser or other
WebKit app in use, since a sampled process can be another app's.

**Report observations and interpretations apart.** Counts, durations, sizes, and
what the samples show are observations. Any mechanism (App Nap, suspension of the
web process, timer throttling) is an interpretation unless an observation shows
it directly (for example, a task state read by `taskinfo`). No significance tests:
trials share one machine and session, so there is no justified sampling model.

## Report

```text
Candidate: <full SHA>            Checked out: <git rev-parse HEAD>
Machine: <OS and version, CPU architecture>
Tools: node -v, npm -v, rustc -V, webview if known
1. npm test:        tests / passed / failed / skipped
2. spike.sh test:   each page PASS or FAIL
3. Recipe Library:  each round; final revisions/verified; apple and fullfsync
Migration check:    cases passed of 12; interrupt-wal WAL bytes and frames before the kill; per failed case, the step that failed and its log
macOS stall:        summary.txt counts per condition; per non-PASS trial: outcome, last step, what the samples show (observations), then any interpretation, labelled as such
Failures:           exact command, first error, log path
Skips:              what, and why
Not run:            what, and why
Diagnostics kept:   where, and what's in them
Fixes elsewhere:    branch and SHA, if any
```
