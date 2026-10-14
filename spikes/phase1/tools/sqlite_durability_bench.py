"""SQLite durability cost under WAL: synchronous=FULL vs NORMAL, each with
and without fullfsync (ADR 0006; fullfsync matters on macOS only).

Spike tool (throwaway). Writes N revision-sized rows, one transaction each
(the autosave pattern), and reports per-commit latency for each setting on
the filesystem that holds --dir. Run it on the disk the app uses.

    python3 sqlite_durability_bench.py --dir ~/.config/invalid.spike.phase1-shell --n 300

Notes:
- Uses Python's sqlite3 (the system SQLite), not the app's bundled copy; the
  cost measured is the filesystem's fsync behaviour, which both share.
- WAL + NORMAL syncs at checkpoints, not at each commit: a power loss can
  lose the most recent commits but not corrupt the database. FULL syncs the
  WAL at every commit. https://www.sqlite.org/pragma.html#pragma_synchronous
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import sqlite3
import statistics
import tempfile
import time


def bench(directory: str, mode: str, n: int, size: int, fullfsync: bool = False) -> dict:
    path = os.path.join(directory, f"bench-{mode.lower()}-{int(fullfsync)}-{os.getpid()}.db")
    con = sqlite3.connect(path, isolation_level=None)
    try:
        assert con.execute("PRAGMA journal_mode=WAL").fetchone()[0] == "wal"
        con.execute(f"PRAGMA synchronous={mode}")
        # macOS: F_FULLFSYNC instead of fsync, for commits and checkpoints.
        # Accepted but without effect on other platforms.
        con.execute(f"PRAGMA fullfsync={'ON' if fullfsync else 'OFF'}")
        con.execute(f"PRAGMA checkpoint_fullfsync={'ON' if fullfsync else 'OFF'}")
        actual = con.execute("PRAGMA synchronous").fetchone()[0]
        ff = con.execute("PRAGMA fullfsync").fetchone()[0]
        con.execute("CREATE TABLE revision (revision_id TEXT PRIMARY KEY, content_hash TEXT, document TEXT)")
        doc = "x" * size
        times = []
        for i in range(n):
            t0 = time.perf_counter()
            con.execute("BEGIN")
            con.execute("INSERT INTO revision VALUES (?, ?, ?)", (f"r{i:06d}", f"h{i}", doc))
            con.execute("COMMIT")
            times.append((time.perf_counter() - t0) * 1000)
        times.sort()
        return {
            "synchronous": mode,
            "pragma_value": actual,
            "fullfsync": ff,
            "commits": n,
            "median_ms": round(statistics.median(times), 3),
            "p95_ms": round(times[int(0.95 * (n - 1))], 3),
            "max_ms": round(times[-1], 3),
            "total_s": round(sum(times) / 1000, 3),
        }
    finally:
        con.close()
        for suffix in ("", "-wal", "-shm"):
            try:
                os.remove(path + suffix)
            except FileNotFoundError:
                pass


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=tempfile.gettempdir())
    ap.add_argument("--n", type=int, default=300)
    ap.add_argument("--size", type=int, default=3000, help="document bytes per row")
    ap.add_argument("--out")
    a = ap.parse_args()
    d = os.path.expanduser(a.dir)
    os.makedirs(d, exist_ok=True)
    plan = [("FULL", False), ("FULL", True), ("NORMAL", False), ("NORMAL", True)] * 2
    runs = [bench(d, m, a.n, a.size, ff) for m, ff in plan]
    report = {
        "platform": platform.platform(),
        "sqlite_version": sqlite3.sqlite_version,
        "directory": "(app data directory)" if a.dir != tempfile.gettempdir() else "(temp directory)",
        "document_bytes": a.size,
        "runs": runs,
    }
    text = json.dumps(report, indent=2)
    print(text)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            f.write(text + "\n")


if __name__ == "__main__":
    main()
