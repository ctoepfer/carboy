#!/bin/bash
# ADR 0006 recovery evidence: write revisions continuously, hard-kill the app,
# reopen, and require an intact database in which every committed revision
# verifies. Fails (exit 1) on any corruption, unverifiable revision, or a reopen
# that doesn't report within $RECOVERY_VERIFY_LIMIT seconds (default 90).
#   tools/kill_recovery.sh <exe> <rounds> <seconds-before-kill> <outdir>
# Optional:
#   RECOVERY_WRITE_COUNT=N  write exactly N revisions per round, then kill (the
#                           seconds argument is ignored); bounded by
#                           RECOVERY_WRITE_LIMIT seconds (default 300)
#   RECOVERY_HOLD=S         keep a hung or stalled app alive S seconds after the
#                           first capture (ps every 10 s, a second capture at the
#                           end), then kill it. Default 0
set -u
exe=$1; rounds=$2; secs=$3; out=$4
mkdir -p "$out"
run() { if [ "${RUNNER_OS:-Linux}" = Linux ] && command -v xvfb-run >/dev/null; then xvfb-run -a "$@"; else "$@"; fi; }
py=python3; command -v python3 >/dev/null || py=python
[ -f "$exe" ] || [ -f "$exe.exe" ] || { echo "no app at $exe: build it first" >&2; exit 2; }
status=0
hangs=0
stalls=0
exits=0
limit=${RECOVERY_VERIFY_LIMIT:-90}
# A slow round is captured early too: library.html's own watchdog reports a
# stall at 45 s and the app then exits, so evidence must be taken before that.
early=${RECOVERY_SAMPLE_AFTER:-40}
count=${RECOVERY_WRITE_COUNT:-}
write_limit=${RECOVERY_WRITE_LIMIT:-300}
hold=${RECOVERY_HOLD:-0}
write_limits=0
# RECOVERY_WINDOW=visible is the control for the macOS hang: does it need a hidden window?
hidden=1
[ "${RECOVERY_WINDOW:-hidden}" = visible ] && hidden=0
# RECOVERY_PAGE=repo.html runs this through @carboy/recipe-library on the shell's own connection.
page=${RECOVERY_PAGE:-library.html}
db=${RECOVERY_DB:-spike.db}
# Git Bash on Windows has taskkill; RUNNER_OS exists only in CI.
stop_app() { if command -v taskkill >/dev/null; then taskkill //F //IM spike-shell.exe >/dev/null 2>&1; else pkill -9 -x spike-shell 2>/dev/null; fi; }
# What a stall looks like from outside, before the app is killed.
capture() {
  local dir="$out/${2:-hang}-$1" data
  mkdir -p "$dir"
  ps -axo pid,ppid,stat,pcpu,etime,command 2>/dev/null | grep -iE 'spike-shell|WebKit|WebContent' | grep -v grep >"$dir/processes.txt"
  command -v sample >/dev/null && sample spike-shell 3 -file "$dir/sample.txt" >/dev/null 2>&1
  # The web process runs the page: is it busy, or suspended?
  if command -v sample >/dev/null; then
    # The newest one: on a personal Mac, Safari and Mail have their own.
    for wc in $(pgrep -nf com.apple.WebKit.WebContent 2>/dev/null); do
      sample "$wc" 3 -file "$dir/sample-webcontent-$wc.txt" >/dev/null 2>&1
      taskinfo "$wc" >"$dir/taskinfo-$wc.txt" 2>&1
    done
  fi
  data=${SPIKE_DATA_DIR:-${RECOVERY_DATA_DIR:-$HOME/Library/Application Support/invalid.spike.phase1-shell}}
  if [ -d "$data" ]; then
    ls -la "$data" >"$dir/files.txt"
    command -v lsof >/dev/null && lsof "$data/$db" "$data/$db-wal" >"$dir/lsof.txt" 2>/dev/null
    cp "$data/$db"* "$dir/" 2>/dev/null
  fi
}
# Sizes of the database files, for the record ("-" when absent).
sizes() {
  local data=${SPIKE_DATA_DIR:-} f line=""
  for f in "$db" "$db-wal"; do
    if [ -n "$data" ] && [ -f "$data/$f" ]; then line="$line $f=$(wc -c <"$data/$f" | tr -d ' ')"; else line="$line $f=-"; fi
  done
  echo "${line# }"
}
# A hung or stalled app stays alive for $hold seconds so it can be inspected.
hold_app() {
  local r=$1 kind=$2 dir="$out/$2-$1" wc t=0
  [ "$hold" -gt 0 ] || return 0
  wc=$(pgrep -nf com.apple.WebKit.WebContent 2>/dev/null)
  echo "round $r: holding the $kind app for ${hold}s${wc:+ (web process $wc; e.g. sudo taskinfo $wc)}"
  mkdir -p "$dir"
  while [ "$t" -lt "$hold" ]; do
    { date '+%T'; ps -axo pid,ppid,stat,pcpu,etime,command 2>/dev/null | grep -iE 'spike-shell|WebContent' | grep -v grep; } >>"$dir/hold-ps.txt"
    sleep 10; t=$((t + 10))
  done
  capture "$r" "$kind-end"
}
for r in $(seq 1 "$rounds"); do
  echo "round $r: start $(sizes)"
  if [ -n "$count" ]; then
    # A fixed workload: exactly $count revisions, then the kill.
    SPIKE_HIDDEN=$hidden SPIKE_START=$page SPIKE_STRESS=$count run "$exe" >"$out/stress-$r.log" 2>&1 &
    pid=$!
    t=0
    until grep -q "stress: all $count written" "$out/stress-$r.log" 2>/dev/null || [ "$t" -ge "$write_limit" ] || ! kill -0 "$pid" 2>/dev/null; do
      sleep 1; t=$((t + 1))
    done
    if ! grep -q "stress: all $count written" "$out/stress-$r.log" 2>/dev/null; then
      echo "round $r: WRITE-LIMIT: $count revisions not written in ${t}s; last: $(grep -a 'stress:' "$out/stress-$r.log" | tail -1)"
      write_limits=$((write_limits + 1))
      status=1
    else
      echo "round $r: wrote $count revisions in ${t}s"
    fi
  else
    SPIKE_HIDDEN=$hidden SPIKE_START=$page SPIKE_STRESS=1000000 run "$exe" >"$out/stress-$r.log" 2>&1 &
    pid=$!
    # Start the kill timer only once writing is under way (start-up under a
    # virtual display can take longer than the timer itself).
    for _ in $(seq 1 90); do grep -q "stress: 100 written" "$out/stress-$r.log" 2>/dev/null && break; sleep 1; done
    sleep "$secs"
  fi
  # -x matches the process name only; -f would also match this script's own arguments.
  stop_app
  wait "$pid" 2>/dev/null
  echo "round $r: after kill $(sizes)"
  # Reopen, with a bound: a stall must fail with evidence, not time out the job.
  SPIKE_HIDDEN=$hidden SPIKE_START=$page SPIKE_AUTO=1 SPIKE_EXIT=1 SPIKE_REPORT="$out/after-kill-$r.json" \
    run "$exe" >"$out/verify-$r.log" 2>&1 &
  verify=$!
  waited=0
  while [ "$waited" -lt "$limit" ] && [ ! -s "$out/after-kill-$r.json" ] && kill -0 "$verify" 2>/dev/null; do
    sleep 1
    waited=$((waited + 1))
    # Still no report: capture once, while the page may yet finish or stall.
    if [ "$waited" -eq "$early" ] && [ ! -s "$out/after-kill-$r.json" ] && kill -0 "$verify" 2>/dev/null; then
      echo "round $r: slow: no report after ${waited}s; captured to slow-$r/ (last step: $(grep -a 'step ' "$out/verify-$r.log" | tail -1))"
      capture "$r" slow
    fi
  done
  if [ ! -s "$out/after-kill-$r.json" ] && [ "$waited" -lt "$limit" ]; then
    # It stopped by itself: a crash or failed start, not a stall.
    echo "round $r: EXITED without a report after ${waited}s; log: $out/verify-$r.log"
    wait "$verify" 2>/dev/null
    exits=$((exits + 1))
    status=1
    continue
  fi
  if [ ! -s "$out/after-kill-$r.json" ]; then
    echo "round $r: HANG: no report after ${waited}s; last step: $(grep -a 'step ' "$out/verify-$r.log" | tail -1)"
    capture "$r"
    hold_app "$r" hang
    stop_app
    wait "$verify" 2>/dev/null
    hangs=$((hangs + 1))
    status=1
    continue
  fi
  # A stall report leaves the app running (keepOpen): inspect it, then stop it.
  if grep -q '"stalled"' "$out/after-kill-$r.json" 2>/dev/null && kill -0 "$verify" 2>/dev/null; then
    capture "$r" stall
    hold_app "$r" stall
    stop_app
  fi
  wait "$verify" 2>/dev/null
  echo "round $r: after reopen $(sizes)"
  $py - "$out/after-kill-$r.json" "$r" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
if "stalled" in d:
    print(f"round {sys.argv[2]}: STALLED at {d['stalled']} after {d['after_ms']} ms -> FAIL (page alive, call stuck)")
    sys.exit(3)
ok = d["integrity"] == "ok" and d["verified"] == d["revisions"] and not d["failures"]
print(f"round {sys.argv[2]}: integrity={d['integrity']} journal={d['journal_mode']} synchronous={d.get('synchronous')} revisions={d['revisions']} verified={d['verified']} -> {'PASS' if ok else 'FAIL'}")
sys.exit(0 if ok else 1)
PY
  case $? in
    0) ;;
    3) stalls=$((stalls + 1)); status=1 ;;
    *) status=1 ;;
  esac
done
echo "rounds: $rounds, hangs: $hangs, stalls: $stalls, early exits: $exits${count:+, write limits: $write_limits}"
exit $status
