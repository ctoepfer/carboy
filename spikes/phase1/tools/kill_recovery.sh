#!/bin/bash
# ADR 0006 recovery evidence: write revisions continuously, hard-kill the app,
# reopen, and require an intact database in which every committed revision
# verifies. Fails (exit 1) on any corruption or unverifiable revision.
#   tools/kill_recovery.sh <exe> <rounds> <seconds-before-kill> <outdir>
set -u
exe=$1; rounds=$2; secs=$3; out=$4
mkdir -p "$out"
run() { if [ "${RUNNER_OS:-Linux}" = Linux ] && command -v xvfb-run >/dev/null; then xvfb-run -a "$@"; else "$@"; fi; }
py=python3; command -v python3 >/dev/null || py=python
status=0
for r in $(seq 1 "$rounds"); do
  SPIKE_HIDDEN=1 SPIKE_START=library.html SPIKE_STRESS=1000000 run "$exe" >"$out/stress-$r.log" 2>&1 &
  pid=$!
  sleep "$secs"
  # -x matches the process name only; -f would also match this script's own arguments.
  if [ "${RUNNER_OS:-}" = Windows ]; then taskkill //F //IM spike-shell.exe >/dev/null 2>&1; else pkill -9 -x spike-shell 2>/dev/null; fi
  wait "$pid" 2>/dev/null
  SPIKE_HIDDEN=1 SPIKE_START=library.html SPIKE_AUTO=1 SPIKE_EXIT=1 SPIKE_REPORT="$out/after-kill-$r.json" \
    run "$exe" >"$out/verify-$r.log" 2>&1
  $py - "$out/after-kill-$r.json" "$r" <<'PY' || status=1
import json, sys
d = json.load(open(sys.argv[1]))
ok = d["integrity"] == "ok" and d["verified"] == d["revisions"] and not d["failures"]
print(f"round {sys.argv[2]}: integrity={d['integrity']} journal={d['journal_mode']} synchronous={d.get('synchronous')} revisions={d['revisions']} verified={d['verified']} -> {'PASS' if ok else 'FAIL'}")
sys.exit(0 if ok else 1)
PY
done
exit $status
