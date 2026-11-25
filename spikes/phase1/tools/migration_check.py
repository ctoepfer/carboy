"""Checks for tools/migration_check.sh: compares migrate.html reports.

The library's real version 1 -> 2 upgrade (the draft table) through the Tauri
shell. Version 1 has no draft table; version 2 has exactly the production
draft table, and nothing else changes.

This reads JSON reports and hashes files. It never opens a database: every
database read happens in the shell, over its own connection.

  migration_check.py fixture <populate.json> <manifest.json>
  migration_check.py state <manifest.json> <report.json> v1|v2|any [--library]
  migration_check.py migrated <report.json>
  migration_check.py rolled-back <report.json>
  migration_check.py sha256 <file>
  migration_check.py version <report.json>   (prints the database version after)
  migration_check.py wal <file> empty|uncommitted   (WAL frame evidence, JSON)
Exit 0 when the check passes; otherwise prints why and exits 1.
"""
import hashlib
import json
import sys

DRAFT = "draft"
# The production version-2 table's columns, stated independently of the code
# under test (packages/recipe-library/src/sqlite.ts, LIBRARY_MIGRATIONS).
DRAFT_COLUMNS = ["seq", "recipe_id", "base_revision", "schema_version", "name", "content", "history_start", "history", "applied", "updated_at"]
V1_TABLES = ["recipe", "revision", "sqlite_sequence"]
RECIPE_COLUMNS = ["recipe_id", "name", "beverage", "head", "updated_at", "deleted_at"]
REVISION_COLUMNS = ["seq", "revision_id", "recipe_id", "parents", "created_at", "origin", "content_hash", "document"]
SPILL = "test_migration_spill"
EXPECTED = {"recipes": 4, "deleted": 1, "revisions": 26}


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def fail(msg):
    print(f"FAIL: {msg}")
    sys.exit(1)


def recipes(s):
    return [{k: r.get(k) for k in ("recipe_id", "name", "beverage", "head", "updated_at", "deleted_at")} for r in s["recipes"]]


def revisions(s):
    return [{k: r.get(k) for k in ("revision_id", "recipe_id", "parents", "content_hash")} for r in s["revisions"]]


def fixture(report, manifest):
    d = load(report)
    if not d.get("ok"):
        fail(f"populate didn't finish: {d.get('error')}")
    s = d["after"]
    if s["user_version"] != 1 or s["integrity"] != "ok":
        fail(f"fixture at version {s['user_version']}, integrity {s['integrity']}")
    if s["tables"] != V1_TABLES or s["recipe_columns"] != RECIPE_COLUMNS or s["revision_columns"] != REVISION_COLUMNS:
        fail(f"fixture isn't a version-1 library: tables {s['tables']}")
    deleted = sum(1 for r in s["recipes"] if r["deleted_at"] is not None)
    got = {"recipes": len(s["recipes"]), "deleted": deleted, "revisions": len(s["revisions"])}
    if got != EXPECTED:
        fail(f"fixture workload {got}, expected {EXPECTED}")
    if not all(r["verified"] for r in s["revisions"]):
        fail("a fixture revision doesn't verify")
    with open(manifest, "w", encoding="utf-8") as f:
        json.dump({"recipes": recipes(s), "revisions": revisions(s)}, f, indent=2)
    print(f"fixture: version 1, integrity ok, {got['recipes']} recipes ({deleted} deleted), {got['revisions']} revisions, all verified")


def state(manifest, report, want, library):
    m = load(manifest)
    d = load(report)
    if not d.get("ok"):
        fail(f"page error: {d.get('error')}")
    s = d["after"]
    v = s["user_version"]
    if SPILL in s["tables"]:
        fail("the spill mode's test table survived; it must never be committed")
    if s["recipe_columns"] != RECIPE_COLUMNS or s["revision_columns"] != REVISION_COLUMNS:
        fail(f"recipe or revision columns changed: {s['recipe_columns']}, {s['revision_columns']}")
    if v == 1:
        if s["tables"] != V1_TABLES:
            fail(f"version 1 but the tables are {s['tables']} (draft table partly there?)")
        found = "v1"
    elif v == 2:
        if s["tables"] != sorted(V1_TABLES + [DRAFT]) or s["draft_columns"] != DRAFT_COLUMNS or s["draft_rows"] != 0:
            fail(f"version 2 but not the production draft table: tables {s['tables']}, columns {s['draft_columns']}, rows {s['draft_rows']}")
        found = "v2"
    else:
        fail(f"unexpected version {v}")
    if want != "any" and found != want:
        fail(f"at {found}, expected {want}")
    if s["integrity"] != "ok":
        fail(f"integrity {s['integrity']}")
    if recipes(s) != m["recipes"]:
        fail("recipe rows differ from the fixture")
    if revisions(s) != m["revisions"]:
        fail(f"revisions differ from the fixture ({len(s['revisions'])} vs {len(m['revisions'])})")
    if not all(r["verified"] for r in s["revisions"]):
        fail("a revision doesn't verify")
    if library:
        heads = d.get("library_heads")
        live = [r for r in m["recipes"] if r["deleted_at"] is None]
        if heads is None or len(heads) != len(live) or not all(h["status"] == "editable" for h in heads):
            fail(f"library reopen: heads {heads}")
        if sorted((h["recipe_id"], h["head"]) for h in heads) != sorted((r["recipe_id"], r["head"]) for r in live):
            fail("library heads differ from the fixture")
        if found == "v2" and (d.get("verify_path") != "production-default" or d.get("library_drafts") != 0):
            fail(f"version-2 reopen wasn't the production path or drafts didn't list: {d.get('verify_path')}, {d.get('library_drafts')}")
    extra = f"; library reopened ({d['verify_path']}), {len(d['library_heads'])} live heads editable" if library else ""
    if library and found == "v2":
        extra += ", drafts list empty"
    print(f"{found}, integrity ok, {len(s['recipes'])} recipes and {len(s['revisions'])} revisions identical to the fixture, all verified{extra}")


def migrated(report):
    d = load(report)
    if not d.get("ok"):
        fail(f"page error: {d.get('error')}")
    mig = d.get("migration") or {}
    if mig.get("status") != "migrated":
        fail(f"migration: {mig}")
    if d["before"]["user_version"] != 1 or d["after"]["user_version"] != 2:
        fail(f"versions {d['before']['user_version']} -> {d['after']['user_version']}")
    path = d.get("migration_path")
    if path not in ("production-default", "production-step-with-test-hook"):
        fail(f"unknown migration path {path}")
    print(f"migrated 1 -> 2 in the shell ({path})")


def rolled_back(report):
    d = load(report)
    if not d.get("ok"):
        fail(f"page error: {d.get('error')}")
    mig = d.get("migration") or {}
    if mig.get("status") != "error" or mig.get("code") != "migration-failed":
        fail(f"expected migration-failed, got {mig}")
    if d.get("migration_path") != "production-step-with-test-hook":
        fail(f"migration path {d.get('migration_path')}")
    t = d.get("in_transaction")
    if t != {"user_version": 1, "draft_table": True}:
        fail(f"the production step's table wasn't in the transaction before the failure: {t}")
    s = d["after"]
    if s["user_version"] != 1 or s["tables"] != V1_TABLES:
        fail(f"after the failure, in the same session: version {s['user_version']}, tables {s['tables']}")
    print(f"in the transaction before the failure: draft table present, version still 1 (set after the step); reported as migration-failed (step {mig.get('details', {}).get('version')}); same session back at version 1 with no draft table")


def wal_frames(path):
    """Reads a WAL file by SQLite's documented format (fileformat2, "The WAL
    file"): a 32-byte header, then frames of a 24-byte header plus one page.
    A frame is valid when its salts match the header's and its running checksum
    matches; a commit frame has a non-zero database size. Reading stops at the
    first frame that is incomplete or invalid, as SQLite's recovery does."""
    import os
    import struct
    size = os.path.getsize(path) if os.path.exists(path) else None
    info = {"bytes": size, "header": False, "page_size": None, "valid_frames": 0, "commit_frames": 0, "uncommitted_frames": 0, "trailing_bytes": 0}
    if not size or size < 32:
        info["trailing_bytes"] = size or 0
        return info
    with open(path, "rb") as f:
        data = f.read()
    magic, version, page_size, _seq, salt1, salt2, c1, c2 = struct.unpack(">8I", data[:32])
    if magic not in (0x377F0682, 0x377F0683):
        info["error"] = f"bad magic {magic:#x}"
        return info
    order = ">" if magic & 1 else "<"

    def checksum(block, s0, s1):
        words = struct.unpack(f"{order}{len(block) // 4}I", block)
        for i in range(0, len(words), 2):
            s0 = (s0 + words[i] + s1) & 0xFFFFFFFF
            s1 = (s1 + words[i + 1] + s0) & 0xFFFFFFFF
        return s0, s1

    if checksum(data[:24], 0, 0) != (c1, c2):
        info["error"] = "header checksum mismatch"
        return info
    info.update(header=True, page_size=page_size, version=version)
    s = (c1, c2)
    pos = 32
    frame = 24 + page_size
    while pos + frame <= len(data):
        pgno, commit, fs1, fs2, fc1, fc2 = struct.unpack(">6I", data[pos:pos + 24])
        if (fs1, fs2) != (salt1, salt2):
            break
        s = checksum(data[pos:pos + 8] + data[pos + 24:pos + frame], *s)
        if s != (fc1, fc2):
            break
        info["valid_frames"] += 1
        if commit:
            info["commit_frames"] += 1
        else:
            info["uncommitted_frames"] += 1
        pos += frame
    info["trailing_bytes"] = len(data) - pos
    return info


def wal(path, want):
    """wal <file> empty|uncommitted: prints the evidence as one JSON line."""
    info = wal_frames(path)
    print(json.dumps(info, sort_keys=True))
    if want == "empty" and info["valid_frames"] != 0:
        sys.exit(1)
    if want == "uncommitted" and not (info["bytes"] and info["bytes"] > 32 and info["uncommitted_frames"] >= 1 and info["commit_frames"] == 0):
        sys.exit(1)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    print(h.hexdigest())


if __name__ == "__main__":
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "fixture":
        fixture(*args)
    elif cmd == "state":
        state(args[0], args[1], args[2], "--library" in args[3:])
    elif cmd == "migrated":
        migrated(*args)
    elif cmd == "rolled-back":
        rolled_back(*args)
    elif cmd == "sha256":
        sha256(*args)
    elif cmd == "wal":
        wal(*args)
    elif cmd == "version":
        print(load(args[0])["after"]["user_version"])
    else:
        fail(f"unknown command {cmd}")
