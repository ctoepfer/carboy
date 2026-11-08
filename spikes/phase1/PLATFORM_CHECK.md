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
| 1. `npm test` | No failures, and none skipped on Node 22 or later. `npm test` runs each package in turn, so the last summary is only the last package's. Total them with `npm test 2>&1 \| tee "$OUT/npm-test.log" \| grep -E '^(# \|ℹ )tests '`. At `5db261f` and its successors until stated otherwise: **388** (recipe-core 184, ingredient-catalog 93, recipe-library 53, editor-commands 23, recipe-format 21, equipment-profiles 14) |
| 2. `spike.sh test` | `PASS` on `checks`, `recipe`, `library`, `graph-react`, `graph-svelte`. Graph windows appear briefly |
| 3. Recipe Library | Every round `PASS`, then `rounds: 3, hangs: 0, stalls: 0, early exits: 0`. Each `after-kill-N.json` has `integrity` ok, `journal_mode` wal, `synchronous` 2, `verified` equal to `revisions`, and no `failures` |

On macOS, check 3's reports must also say `"apple": true` and `"fullfsync": 1`.

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
macOS stall:        summary.txt counts per condition; per non-PASS trial: outcome, last step, what the samples show (observations), then any interpretation, labelled as such
Failures:           exact command, first error, log path
Skips:              what, and why
Not run:            what, and why
Diagnostics kept:   where, and what's in them
Fixes elsewhere:    branch and SHA, if any
```
