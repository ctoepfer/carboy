#!/bin/bash
# ADR 0006 recovery evidence: write revisions continuously, hard-kill the app,
# reopen, and require an intact database in which every committed revision
# verifies. Fails (exit 1) on any corruption, unverifiable revision, or a reopen
# that doesn't report within $RECOVERY_VERIFY_LIMIT seconds (default 90).
#   tools/kill_recovery.sh <exe> <rounds> <seconds-before-kill> <outdir>
set -u
exe=$1; rounds=$2; secs=$3; out=$4
mkdir -p "$out"
run() { if [ "${RUNNER_OS:-Linux}" = Linux ] && command -v xvfb-run >/dev/null; then xvfb-run -a "$@"; else "$@"; fi; }
py=python3; command -v python3 >/dev/null || py=python
status=0
hangs=0
limit=${RECOVERY_VERIFY_LIMIT:-90}
stop_app() { if [ "${RUNNER_OS:-}" = Windows ]; then taskkill //F //IM spike-shell.exe >/dev/null 2>&1; else pkill -9 -x spike-shell 2>/dev/null; fi; }
# What a stall looks like from outside, before the app is killed.
capture() {
  local dir="$out/hang-$1" data
  mkdir -p "$dir"
  ps -axo pid,ppid,stat,etime,command 2>/dev/null | grep -iE 'spike-shell|WebKit|WebContent' | grep -v grep >"$dir/processes.txt"
  command -v sample >/dev/null && sample spike-shell 3 -file "$dir/sample.txt" >/dev/null 2>&1
  data=${RECOVERY_DATA_DIR:-$HOME/Library/Application Support/invalid.spike.phase1-shell}
  if [ -d "$data" ]; then
    ls -la "$data" >"$dir/files.txt"
    command -v lsof >/dev/null && lsof "$data/spike.db" "$data/spike.db-wal" >"$dir/lsof.txt" 2>/dev/null
    cp "$data"/spike.db* "$dir/" 2>/dev/null
  fi
}
for r in $(seq 1 "$rounds"); do
  SPIKE_HIDDEN=1 SPIKE_START=library.html SPIKE_STRESS=1000000 run "$exe" >"$out/stress-$r.log" 2>&1 &
  pid=$!
  # Start the kill timer only once writing is under way (start-up under a
  # virtual display can take longer than the timer itself).
  for _ in $(seq 1 90); do grep -q "stress: 100 written" "$out/stress-$r.log" 2>/dev/null && break; sleep 1; done
  sleep "$secs"
  # -x matches the process name only; -f would also match this script's own arguments.
  stop_app
  wait "$pid" 2>/dev/null
  # Reopen, with a bound: a stall must fail with evidence, not time out the job.
  SPIKE_HIDDEN=1 SPIKE_START=library.html SPIKE_AUTO=1 SPIKE_EXIT=1 SPIKE_REPORT="$out/after-kill-$r.json" \
    run "$exe" >"$out/verify-$r.log" 2>&1 &
  verify=$!
  waited=0
  while [ "$waited" -lt "$limit" ] && [ ! -s "$out/after-kill-$r.json" ] && kill -0 "$verify" 2>/dev/null; do
    sleep 1
    waited=$((waited + 1))
  done
  if [ ! -s "$out/after-kill-$r.json" ]; then
    echo "round $r: HANG: no report after ${waited}s; last step: $(grep -a 'step ' "$out/verify-$r.log" | tail -1)"
    capture "$r"
    stop_app
    wait "$verify" 2>/dev/null
    hangs=$((hangs + 1))
    status=1
    continue
  fi
  wait "$verify" 2>/dev/null
  $py - "$out/after-kill-$r.json" "$r" <<'PY' || status=1
import json, sys
d = json.load(open(sys.argv[1]))
if "stalled" in d:
    print(f"round {sys.argv[2]}: STALLED at {d['stalled']} after {d['after_ms']} ms -> FAIL (page alive, call stuck)")
    sys.exit(1)
ok = d["integrity"] == "ok" and d["verified"] == d["revisions"] and not d["failures"]
print(f"round {sys.argv[2]}: integrity={d['integrity']} journal={d['journal_mode']} synchronous={d.get('synchronous')} revisions={d['revisions']} verified={d['verified']} -> {'PASS' if ok else 'FAIL'}")
sys.exit(0 if ok else 1)
PY
done
echo "rounds: $rounds, hangs: $hangs"
exit $status
