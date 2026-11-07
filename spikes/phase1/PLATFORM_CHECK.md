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
  The `XDG_*` variables don't work on macOS or Windows.
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
| 1. `npm test` | No failures, and none skipped on Node 22 or later. The count is stated with the candidate |
| 2. `spike.sh test` | `PASS` on `checks`, `recipe`, `library`, `graph-react`, `graph-svelte`. Graph windows appear briefly |
| 3. Recipe Library | Every round `PASS`, then `rounds: 3, hangs: 0, early exits: 0`. Each `after-kill-N.json` has `integrity` ok, `journal_mode` wal, `synchronous` 2, `verified` equal to `revisions`, and no `failures` |

On macOS, check 3's reports must also say `"apple": true` and `"fullfsync": 1`.

## macOS: the stall (open, no conclusion yet)

Each run gets a new data folder, because the stall has grown more frequent as the
library grows. Keep the visible window on screen, not minimized or covered, and
leave the machine awake.

```sh
export SPIKE_DATA_DIR=$(mktemp -d)
RECOVERY_WINDOW=hidden  tools/kill_recovery.sh "$EXE" 20 6 "$OUT/stall-hidden"
export SPIKE_DATA_DIR=$(mktemp -d)
RECOVERY_WINDOW=visible tools/kill_recovery.sh "$EXE" 20 6 "$OUT/stall-visible"
```

A nonzero exit is a result here, not a failure of the check. `HANG` is a stall;
`EXITED` is a crash or failed start, so report those separately. Keep every
`hang-N/` folder: `sample-webcontent-*.txt` and `taskinfo-*.txt` are the
evidence still missing. `taskinfo` may need `sudo`; don't use it for this, and say
if it was refused. A sampled process can be another app's if one started during
the run, so note any browser use.

## Report

```text
Candidate: <full SHA>            Checked out: <git rev-parse HEAD>
Machine: <OS and version, CPU architecture>
Tools: node -v, npm -v, rustc -V, webview if known
1. npm test:        tests / passed / failed / skipped
2. spike.sh test:   each page PASS or FAIL
3. Recipe Library:  each round; final revisions/verified; apple and fullfsync
macOS stall:        hidden rounds/hangs; visible rounds/hangs; last step of each hang
Failures:           exact command, first error, log path
Skips:              what, and why
Not run:            what, and why
Diagnostics kept:   where, and what's in them
Fixes elsewhere:    branch and SHA, if any
```
