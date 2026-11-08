#!/bin/bash
# Matched experiment for the macOS recovery stall (ADR 0006; still open).
#
#   tools/stall_experiment.sh <exe> <outdir>
#
# One seed database is made once, then copied fresh into every trial, so every
# trial starts from identical bytes and writes the same number of revisions.
# Each trial is one kill_recovery.sh round. Conditions:
#   A  hidden window,  sleep prevented ($STALL_AWAKE_CMD)
#   B  visible window, sleep prevented ($STALL_AWAKE_CMD)
#   C  hidden window,  no sleep prevention
# A vs B varies only the window; A vs C varies only sleep prevention.
# Blocks run in rotated order (ABC, BCA, CAB, ...). Every trial gets the same
# monitoring (process states every 2 s; on macOS also whether the app's window
# is listed on screen), the same timeouts, and the same hold for inspection.
#
# The results are counts and measurements per trial (results.csv). This script
# draws no conclusions and computes no significance: trials share one machine
# and one session, so they aren't independent samples of anything wider.
#
# Settings (environment), with defaults:
#   STALL_REPS=6               blocks; trials = 3 x STALL_REPS
#   STALL_SEED_REVISIONS=6000  revisions in the seed database
#   STALL_WRITE=500            revisions written in every trial
#   STALL_PAGE=library.html    page under test (repo.html uses repo.db)
#   STALL_AWAKE_CMD="caffeinate -dims"   sleep prevention for A, B, and the seed
#   STALL_VERIFY_LIMIT=90      seconds for the reopen to report
#   STALL_WRITE_LIMIT=180      seconds to write STALL_WRITE revisions
#   STALL_HOLD=60              seconds a hung or stalled app is kept for inspection
#   STALL_BUDGET_MIN=150       no new trial starts after this many minutes
#   STALL_KEEP_DATA=fail       keep a trial's database copy: fail | all
set -u
exe=$1; out=$2
here=$(cd "$(dirname "$0")" && pwd)
reps=${STALL_REPS:-6}
seed_n=${STALL_SEED_REVISIONS:-6000}
write_n=${STALL_WRITE:-500}
page=${STALL_PAGE:-library.html}
db=spike.db; [ "$page" = repo.html ] && db=repo.db
awake=${STALL_AWAKE_CMD:-caffeinate -dims}
verify_limit=${STALL_VERIFY_LIMIT:-90}
write_limit=${STALL_WRITE_LIMIT:-180}
hold=${STALL_HOLD:-60}
budget=$(( ${STALL_BUDGET_MIN:-150} * 60 ))
keep=${STALL_KEEP_DATA:-fail}
py=python3; command -v python3 >/dev/null || py=python

[ -f "$exe" ] || { echo "no app at $exe: build it first" >&2; exit 2; }
if pgrep -x spike-shell >/dev/null; then echo "a spike-shell is already running; stop it first (the harness kills every spike-shell)" >&2; exit 2; fi
[ -e "$out" ] && { echo "$out exists; give a new folder" >&2; exit 2; }
mkdir -p "$out"
started=$(date +%s)

# What the machine was, once.
{
  echo "date: $(date '+%F %T %z')"
  echo "commit: $(git -C "$here" rev-parse HEAD 2>/dev/null)"
  echo "page: $page  seed: $seed_n  write: $write_n  reps: $reps  verify_limit: $verify_limit  hold: $hold"
  echo "awake command (A, B, seed): $awake"
  uname -a
  command -v sw_vers >/dev/null && sw_vers
  command -v pmset >/dev/null && { echo "--- pmset -g"; pmset -g; }
} >"$out/environment.txt" 2>&1

# The same monitor in every trial: process states every 2 s, and on macOS
# whether a spike-shell window is listed on screen (listed is not "uncovered").
monitor() {
  local file=$1
  while :; do
    {
      echo "== $(date '+%T')"
      # Match the executable, not arguments: this script's own command lines
      # mention spike-shell too.
      ps -axo pid,ppid,stat,pcpu,etime,comm 2>/dev/null | awk 'NR == 1 || $NF ~ /(^|\/)(spike-shell|com\.apple\.WebKit\.WebContent)$/'
      if command -v osascript >/dev/null; then
        osascript -l JavaScript -e 'ObjC.import("CoreGraphics");
          var l = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, $.kCGNullWindowID))) || [];
          var w = l.filter(function (x) { return x.kCGWindowOwnerName === "spike-shell" && x.kCGWindowLayer === 0; });
          w.length ? w.map(function (x) { return "window listed on screen " + x.kCGWindowBounds.Width + "x" + x.kCGWindowBounds.Height; }).join("; ") : "no spike-shell window listed on screen";' 2>&1 | head -2
      fi
    } >>"$file"
    sleep 2
  done
}

bytes() { [ -f "$1" ] && wc -c <"$1" | tr -d ' ' || echo -; }
report_field() { # file field
  [ -s "$1" ] && $py -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get(sys.argv[2], "-"))' "$1" "$2" 2>/dev/null || echo -
}

# 1. Seed: write once (visible, sleep prevented, so the seed itself is least
#    likely to stall), and keep it only if its reopen verified everything.
echo "seed: writing $seed_n revisions"
mkdir -p "$out/seed/data"
SPIKE_DATA_DIR="$out/seed/data" RECOVERY_PAGE=$page RECOVERY_DB=$db RECOVERY_WINDOW=visible \
  RECOVERY_WRITE_COUNT=$seed_n RECOVERY_WRITE_LIMIT=$((seed_n / 5 + 120)) RECOVERY_VERIFY_LIMIT=$verify_limit \
  $awake "$here/kill_recovery.sh" "$exe" 1 0 "$out/seed/run" >"$out/seed/run.log" 2>&1
if [ $? -ne 0 ]; then
  echo "seed failed; see $out/seed/run.log. Nothing else was run." >&2
  exit 1
fi
seed_rev=$(report_field "$out/seed/run/after-kill-1.json" revisions)
( cd "$out/seed/data" && for f in "$db" "$db-wal" "$db-shm"; do
    [ -f "$f" ] || continue
    if command -v shasum >/dev/null; then shasum -a 256 "$f"; else sha256sum "$f"; fi
  done ) >"$out/seed/sha256.txt"
echo "seed: $seed_rev revisions; $db $(bytes "$out/seed/data/$db") bytes, wal $(bytes "$out/seed/data/$db-wal") bytes"

# 2. Trials, rotated order.
echo "trial,condition,window,awake,start,end,seconds,db_start,wal_start,db_after,wal_after,seed_revisions,revisions_after,written,outcome,detail" >"$out/results.csv"
rotations=("A B C" "B C A" "C A B")
n=0
for b in $(seq 0 $((reps - 1))); do
  for c in ${rotations[$((b % 3))]}; do
    if [ $(( $(date +%s) - started )) -ge "$budget" ]; then
      echo "budget reached: no more trials started (STALL_BUDGET_MIN)"
      break 2
    fi
    n=$((n + 1))
    t=$(printf 'trial-%02d-%s' "$n" "$c")
    dir="$out/$t"; data="$dir/data"; mkdir -p "$data"
    case $c in A) window=hidden; wake=$awake ;; B) window=visible; wake=$awake ;; C) window=hidden; wake="" ;; esac
    for f in "$db" "$db-wal" "$db-shm"; do [ -f "$out/seed/data/$f" ] && cp "$out/seed/data/$f" "$data/"; done
    db0=$(bytes "$data/$db"); wal0=$(bytes "$data/$db-wal")
    s0=$(date +%s); start=$(date '+%T')
    echo "$t: window $window, sleep prevention ${wake:-none}, start $start"
    monitor "$dir/monitor.log" & mon=$!
    SPIKE_DATA_DIR="$data" RECOVERY_PAGE=$page RECOVERY_DB=$db RECOVERY_WINDOW=$window \
      RECOVERY_WRITE_COUNT=$write_n RECOVERY_WRITE_LIMIT=$write_limit RECOVERY_VERIFY_LIMIT=$verify_limit \
      RECOVERY_HOLD=$hold $wake "$here/kill_recovery.sh" "$exe" 1 0 "$dir/run" >"$dir/run.log" 2>&1
    kill "$mon" 2>/dev/null; wait "$mon" 2>/dev/null
    end=$(date '+%T'); secs=$(( $(date +%s) - s0 ))
    command -v pmset >/dev/null && pmset -g log 2>/dev/null | awk -v s="$(date -r "$s0" '+%F %T' 2>/dev/null)" '$0 >= s' \
      | grep -E ' (Sleep|Wake|DarkWake|Display is turned)' >"$dir/power-events.txt" 2>/dev/null
    rev=$(report_field "$dir/run/after-kill-1.json" revisions)
    written=-; [ "$rev" != - ] && [ "$seed_rev" != - ] && written=$((rev - seed_rev))
    line=$(grep -E '^round 1: (integrity|HANG|STALLED|EXITED|WRITE-LIMIT)' "$dir/run.log" | tail -1)
    case $line in
      *"-> PASS"*) outcome=PASS ;;
      *HANG*) outcome=HANG ;;
      *STALLED*) outcome=STALLED ;;
      *EXITED*) outcome=EXITED ;;
      *WRITE-LIMIT*) outcome=WRITE-LIMIT ;;
      *) outcome=FAIL ;;
    esac
    grep -q 'WRITE-LIMIT' "$dir/run.log" && [ "$outcome" = PASS ] && outcome=PASS-WRITE-LIMIT
    asleep=no; [ -n "$wake" ] && asleep=yes
    echo "$t,$c,$window,$asleep,$start,$end,$secs,$db0,$wal0,$(bytes "$data/$db"),$(bytes "$data/$db-wal"),$seed_rev,$rev,$written,$outcome,\"${line//\"/}\"" >>"$out/results.csv"
    echo "$t: $outcome after ${secs}s; written $written"
    [ "$outcome" = PASS ] && [ "$keep" != all ] && rm -rf "$data"
  done
done

# 3. Counts only.
{
  echo "Counts per condition (observations; no conclusions drawn):"
  for c in A B C; do
    printf '%s: ' "$c"
    awk -F, -v c="$c" 'NR > 1 && $2 == c { n++; o[$15]++ } END { printf "%d trials", n; for (k in o) printf ", %s %d", k, o[k]; print "" }' "$out/results.csv"
  done
  echo "Per-trial detail: results.csv. Diagnostics: trial-*/run (hang-N, slow-N, stall-N, *-end-N), monitor.log, power-events.txt."
} | tee "$out/summary.txt"
echo "finished in $(( ($(date +%s) - started) / 60 )) min"
