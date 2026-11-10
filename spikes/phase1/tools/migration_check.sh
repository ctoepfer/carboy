#!/bin/bash
# ADR 0006 evidence item 2 through the shell: the Recipe Library's migration
# machinery (backup, one transaction, rollback) on the Tauri shell's own
# rusqlite connection.
#
# Real migration machinery exercised through the Tauri shell using a
# test-defined migration step; this is not a real product schema migration.
# The library has no product step after version 1 yet; repeat this check
# against the first real schema upgrade when one exists.
#
#   tools/migration_check.sh <exe> <rounds> <outdir>   (4 cases per round)
#
# Needs $SPIKE_DATA_DIR (every database, backup, and webview profile goes under
# $SPIKE_DATA_DIR/migration-check/, which must not exist yet). One fixture is
# made once through the real 0 -> 1 bootstrap and copied fresh into every case:
#   success    migrate 1 -> 2; reopen; backup is the fixture at version 1
#   fail       the step throws after its DDL, before the commit; reopen at
#              version 1 with the fixture's data; backup intact; retry migrates
#   interrupt-memory  the step reports a barrier after its DDL; the shell is
#              killed there (no timed sleep); reopen complete (never partial);
#              backup intact; retry migrates. The step's changes are small and
#              stay in SQLite's page cache: this case does NOT cover WAL recovery
#   interrupt-wal  as interrupt-memory, but the page stops first at a "step
#              start" barrier, where the WAL must hold no frames; then the step
#              shrinks its connection's cache and writes enough rows to force
#              uncommitted frames into the WAL. At the "spill barrier" the
#              harness parses the WAL and kills the shell only if it holds at
#              least one complete, valid, uncommitted frame and no commit frame;
#              otherwise the case fails and the app is only stopped (no reopen).
#              Reopen must be version 1 exactly; backup unchanged; retry migrates
# Optional: MIGRATION_LIMIT=S seconds per launch (default 90);
#           MIGRATION_WINDOW=visible to show the window.
# Exit 0 only if every case in every round passes.
set -u
exe=$1; rounds=$2; out=$3
here=$(cd "$(dirname "$0")" && pwd)
py=python3; command -v python3 >/dev/null || py=python
check() { $py "$here/migration_check.py" "$@"; }
run() { if [ "${RUNNER_OS:-Linux}" = Linux ] && command -v xvfb-run >/dev/null; then xvfb-run -a "$@"; else "$@"; fi; }
running() { if command -v tasklist >/dev/null; then tasklist //FI "IMAGENAME eq spike-shell.exe" 2>/dev/null | grep -qi spike-shell; else pgrep -x spike-shell >/dev/null; fi; }
stop_app() { if command -v taskkill >/dev/null; then taskkill //F //IM spike-shell.exe >/dev/null 2>&1; else pkill -9 -x spike-shell 2>/dev/null; fi; }
limit=${MIGRATION_LIMIT:-90}
hidden=1; [ "${MIGRATION_WINDOW:-hidden}" = visible ] && hidden=0

[ -f "$exe" ] || [ -f "$exe.exe" ] || { echo "no app at $exe: build it first" >&2; exit 2; }
[ -n "${SPIKE_DATA_DIR:-}" ] || { echo "set SPIKE_DATA_DIR to an isolated folder" >&2; exit 2; }
base=$SPIKE_DATA_DIR/migration-check
[ -e "$base" ] && { echo "$base exists; use a new SPIKE_DATA_DIR" >&2; exit 2; }
[ -e "$out" ] && { echo "$out exists; give a new folder" >&2; exit 2; }
# The kill step stops every spike-shell on the machine.
if running; then echo "a spike-shell is already running; stop it first" >&2; exit 2; fi
mkdir -p "$base" "$out"

# launch <data-dir> <mode> <name> [db] [backup]: one bounded app run.
# Returns 0 with a report, 4 at the barrier (app killed there), 1 hung, 2 exited.
launch() {
  local dir=$1 mode=$2 name=$3 db=${4:-migrate.db} backup=${5:-} pid t=0
  local report="$out/$name.json" log="$out/$name.log"
  SPIKE_DATA_DIR="$dir" SPIKE_HIDDEN=$hidden SPIKE_START=migrate.html SPIKE_AUTO=1 SPIKE_EXIT=1 \
    SPIKE_REPORT="$report" SPIKE_MIGRATE=$mode SPIKE_MIGRATE_DB=$db SPIKE_MIGRATE_BACKUP=$backup \
    run "$exe" >"$log" 2>&1 &
  pid=$!
  while [ "$t" -lt "$limit" ] && kill -0 "$pid" 2>/dev/null && [ ! -s "$report" ]; do
    if [ "$mode" = barrier ] && grep -q "migration: barrier reached" "$log" 2>/dev/null; then
      stop_app; wait "$pid" 2>/dev/null
      [ -s "$report" ] && return 2 # it must not have finished
      return 4
    fi
    sleep 1; t=$((t + 1))
  done
  if [ ! -s "$report" ] && kill -0 "$pid" 2>/dev/null; then
    ps -axo pid,ppid,stat,pcpu,etime,command 2>/dev/null | grep -iE 'spike-shell|WebKit|WebContent' | grep -v grep >"$out/$name.processes.txt"
    stop_app; wait "$pid" 2>/dev/null
    return 1
  fi
  wait "$pid" 2>/dev/null
  [ -s "$report" ] && return 0
  return 2
}
files() { (cd "$1" && for f in migrate.db*; do [ -f "$f" ] && printf '%s=%s ' "$f" "$(wc -c <"$f" | tr -d ' ')"; done); }

# step <label> <command...>: run a check, print its line, remember a failure.
case_ok=1
step() {
  local label=$1; shift
  local line
  line=$("$@" 2>&1); local rc=$?
  echo "  $label: $line"
  [ "$rc" -eq 0 ] || case_ok=0
  return $rc
}
launched() { # name, launch status, expected
  case $2 in
    0) [ "$3" = report ] && return 0 ;;
    4) [ "$3" = barrier ] && return 0 ;;
  esac
  local what; case $2 in 0) what="finished" ;; 1) what="HANG (no report in ${limit}s)" ;; 2) what="EXITED without a report" ;; 4) what="stopped at the barrier" ;; esac
  echo "  $1: $what, expected $3; log: $out/$1.log"
  case_ok=0
  return 1
}

# 1. The fixture: the real 0 -> 1 bootstrap, then representative data.
echo "fixture: populating through the shell"
mkdir -p "$base/fixture"
launch "$base/fixture" populate fixture-populate; rc=$?
launched fixture-populate $rc report || { echo "fixture failed; nothing else run"; exit 1; }
check fixture "$out/fixture-populate.json" "$out/manifest.json" || { echo "fixture failed; nothing else run"; exit 1; }
fixture_sha=$(check sha256 "$base/fixture/migrate.db")
echo "fixture: migrate.db $(wc -c <"$base/fixture/migrate.db" | tr -d ' ') bytes, sha256 $fixture_sha; files: $(files "$base/fixture")"
m=$out/manifest.json

# reopened <dir> <name> <want>: reopen as the app would, compare with the fixture.
reopened() { launch "$1" verify "$2"; launched "$2" $? report && step "$2" check state "$m" "$out/$2.json" "$3" --library; }
# backup_ok <dir> <file> <name>: the backup, read raw in the shell, is the fixture at version 1.
backup_ok() {
  [ -f "$1/$2" ] || { echo "  $3: FAIL: no backup at $1/$2"; case_ok=0; return 1; }
  launch "$1" inspect "$3" "$2"; launched "$3" $? report && step "$3" check state "$m" "$out/$3.json" v1
}
# retry <dir> <prefix>: migrate again after a failure; it must complete once.
retry() {
  launch "$1" migrate "$2-retry" migrate.db migrate.db.backup-retry
  launched "$2-retry" $? report && step "$2-retry" check migrated "$out/$2-retry.json" &&
    reopened "$1" "$2-retry-reopen" v2 && backup_ok "$1" migrate.db.backup-retry "$2-retry-backup"
}
# launch_spill <dir> <name>: the interrupt-wal launch. Returns 0 when the
# shell was killed with uncommitted WAL frames on disk; 1 otherwise (the app is
# stopped as cleanup, and the case fails).
launch_spill() {
  local dir=$1 name=$2 pid t=0 log="$out/$2.log"
  SPIKE_DATA_DIR="$dir" SPIKE_HIDDEN=$hidden SPIKE_START=migrate.html SPIKE_AUTO=1 SPIKE_EXIT=1 \
    SPIKE_REPORT="$out/$name.json" SPIKE_MIGRATE=spill SPIKE_MIGRATE_DB=migrate.db SPIKE_MIGRATE_BACKUP=migrate.db.backup \
    run "$exe" >"$log" 2>&1 &
  pid=$!
  until grep -q "migration: step start" "$log" 2>/dev/null || [ "$t" -ge "$limit" ] || ! kill -0 "$pid" 2>/dev/null; do sleep 1; t=$((t + 1)); done
  if ! grep -q "migration: step start" "$log" 2>/dev/null; then
    echo "  $name: FAIL: no step-start barrier within ${limit}s; log: $log"; stop_app; wait "$pid" 2>/dev/null; return 1
  fi
  [ -f "$dir/migrate.db-wal" ] && cp "$dir/migrate.db-wal" "$out/$name-start.wal"
  if ! step "$name-wal-at-step-start" check wal "$dir/migrate.db-wal" empty; then
    echo "  $name: FAIL: the WAL already held frames before the step wrote anything; stopped without a kill test"; stop_app; wait "$pid" 2>/dev/null; return 1
  fi
  : >"$dir/migrate.go"
  t=0
  until grep -q "migration: spill barrier reached" "$log" 2>/dev/null || [ "$t" -ge "$limit" ] || ! kill -0 "$pid" 2>/dev/null; do sleep 1; t=$((t + 1)); done
  if ! grep -q "migration: spill barrier reached" "$log" 2>/dev/null || [ -s "$out/$name.json" ]; then
    echo "  $name: FAIL: no spill barrier within ${limit}s (or the page finished); log: $log"; stop_app; wait "$pid" 2>/dev/null; return 1
  fi
  if ! grep -q "spill barrier reached (in transaction: version 2, column true, table true, spill rows 256)" "$log"; then
    echo "  $name: FAIL: $(grep -a 'spill barrier' "$log")"; stop_app; wait "$pid" 2>/dev/null; return 1
  fi
  echo "  $name: in the transaction at the spill barrier: version 2, column and table present, 256 spill rows"
  cp "$dir/migrate.db-wal" "$out/$name-prekill.wal"
  if ! step "$name-wal-before-kill" check wal "$dir/migrate.db-wal" uncommitted; then
    echo "  $name: FAIL: no complete uncommitted frame in the WAL; not killed for a recovery test (app stopped as cleanup)"; stop_app; wait "$pid" 2>/dev/null; return 1
  fi
  backup_sha=$(check sha256 "$dir/migrate.db.backup")
  stop_app; wait "$pid" 2>/dev/null
  step "$name-wal-after-kill" check wal "$dir/migrate.db-wal" uncommitted
}
# The barrier line must show the step's changes inside the open transaction.
barrier_state() {
  if grep -q "barrier reached (in transaction: version 2, column true, table true)" "$1"; then echo "in the transaction at the barrier: version 2, column and table present"
  else echo "FAIL: $(grep -a 'barrier reached' "$1" || echo 'no barrier line')"; return 1; fi
}
# same <name> <file> <sha>: a backup must not change after it was made.
same() { local now; now=$(check sha256 "$2"); if [ "$now" = "$3" ]; then echo "backup unchanged since the failure (sha256 $3)"; else echo "FAIL: backup changed: $3 -> $now"; return 1; fi; }
fresh() { mkdir -p "$1"; cp "$base/fixture/migrate.db" "$1/"; [ "$(check sha256 "$1/migrate.db")" = "$fixture_sha" ]; }

passed=0; total=0
for r in $(seq 1 "$rounds"); do
  for c in success fail interrupt-memory interrupt-wal; do
    total=$((total + 1)); case_ok=1
    dir=$base/r$r-$c; n=r$r-$c
    echo "round $r, $c:"
    fresh "$dir" || { echo "  copy: FAIL: fixture copy differs"; case_ok=0; }
    if [ "$case_ok" = 1 ]; then case $c in
      success)
        launch "$dir" migrate "$n-migrate" migrate.db migrate.db.backup
        launched "$n-migrate" $? report && step "$n-migrate" check migrated "$out/$n-migrate.json" &&
          reopened "$dir" "$n-reopen" v2 && backup_ok "$dir" migrate.db.backup "$n-backup"
        ;;
      fail)
        launch "$dir" fail "$n-fail" migrate.db migrate.db.backup
        if launched "$n-fail" $? report && step "$n-fail" check rolled-back "$out/$n-fail.json" &&
          reopened "$dir" "$n-reopen" v1 && backup_ok "$dir" migrate.db.backup "$n-backup"; then
          b=$(check sha256 "$dir/migrate.db.backup")
          retry "$dir" "$n" && step "$n-backup-unchanged" same "$n" "$dir/migrate.db.backup" "$b"
        fi
        ;;
      interrupt-memory)
        launch "$dir" barrier "$n-barrier" migrate.db migrate.db.backup
        if launched "$n-barrier" $? barrier && step "$n-barrier" barrier_state "$out/$n-barrier.log"; then
          echo "  $n-barrier: killed at the barrier; files after the kill: $(files "$dir")"
          if reopened "$dir" "$n-reopen" any && backup_ok "$dir" migrate.db.backup "$n-backup"; then
            if [ "$(check version "$out/$n-reopen.json")" = 2 ]; then
              echo "  $n: reopened fully migrated (complete); no retry needed"
            else
              b=$(check sha256 "$dir/migrate.db.backup")
              retry "$dir" "$n" && step "$n-backup-unchanged" same "$n" "$dir/migrate.db.backup" "$b"
            fi
          fi
        fi
        ;;
      interrupt-wal)
        echo "  $n: fresh copy before launch: $(files "$dir")(no WAL file)"
        if launch_spill "$dir" "$n-spill"; then
          echo "  $n-spill: killed with uncommitted frames in the WAL; files after the kill: $(files "$dir")"
          if reopened "$dir" "$n-reopen" v1 && step "$n-wal-after-reopen" check wal "$dir/migrate.db-wal" any &&
            backup_ok "$dir" migrate.db.backup "$n-backup" && step "$n-backup-unchanged" same "$n" "$dir/migrate.db.backup" "$backup_sha"; then
            retry "$dir" "$n" && step "$n-backup-unchanged-after-retry" same "$n" "$dir/migrate.db.backup" "$backup_sha"
          fi
        else
          case_ok=0
        fi
        ;;
    esac; fi
    if [ "$case_ok" = 1 ]; then echo "round $r, $c: PASS"; passed=$((passed + 1)); else echo "round $r, $c: FAIL (kept: $dir, $out/$n-*)"; fi
  done
done
[ "$(check sha256 "$base/fixture/migrate.db")" = "$fixture_sha" ] || { echo "the fixture changed during the run"; passed=-1; }
echo "migration check: rounds: $rounds, cases passed: $passed of $total"
[ "$passed" = "$total" ]
