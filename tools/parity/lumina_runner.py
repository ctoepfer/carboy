#!/usr/bin/env python3
"""Python side of the shared parity fixtures (D-005).

Re-runs each fixture's recorded producer, Lumina's own BeerXML importer and
statistics pipeline, against the recorded source file, and checks that
Lumina still produces the fixture's expected values. The TypeScript side
(packages/recipe-core/test/parity.test.mjs) checks Recipe Core against the
same values. Together: a fixture passes in both.

Lumina is a separate, private project, so this runs locally, never in CI.
It is read-only: it imports Lumina's modules without writing bytecode and
reads the source files; it never modifies Lumina.

    <lumina>/runtime/venv/bin/python -I tools/parity/lumina_runner.py --lumina <lumina>

Exit status: 0 all fixtures reproduce, 1 a value or source differs,
2 a fixture can't be run.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "parity"
KEYS = ("color.mcu", "gravity.points", "gravity.og")
SOURCE_PREFIX = "Lumina "


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--lumina", required=True, type=Path, help="root of a Lumina checkout (read only)")
    parser.add_argument("--fixtures", type=Path, default=FIXTURES)
    args = parser.parse_args()

    sys.dont_write_bytecode = True
    root = args.lumina.resolve()
    sys.path[:0] = [str(root), str(root / "bin")]  # bin/ holds lumina_hooks, as on Lumina's runtime path
    try:
        from brains.recipes.beerxml_import import parse_beerxml
        from brains.recipes.stats_hooks import calculate_recipe_stats
    except ImportError as exc:
        print(f"cannot import Lumina from {args.lumina}: {exc}", file=sys.stderr)
        return 2

    status = 0
    files = sorted(p for p in args.fixtures.rglob("*.json"))
    for path in files:
        fixture = json.loads(path.read_text(encoding="utf-8"))
        expected = fixture.get("expected_lumina")
        if expected is None:
            continue
        name = path.relative_to(args.fixtures)
        source = fixture["provenance"]["source_file"]
        if not source.startswith(SOURCE_PREFIX):
            print(f"SKIP  {name}: source is not a Lumina file ({source})")
            status = max(status, 2)
            continue
        source_path = args.lumina / source[len(SOURCE_PREFIX):]
        try:
            data = source_path.read_bytes()
        except OSError as exc:
            print(f"SKIP  {name}: {exc}")
            status = max(status, 2)
            continue
        digest = hashlib.sha256(data).hexdigest()
        if digest != fixture["provenance"]["source_sha256"]:
            print(f"FAIL  {name}: source file changed (sha256 {digest})")
            status = max(status, 1)
            continue

        recipe = parse_beerxml(data, source_filename=source_path.name).recipe
        computed = calculate_recipe_stats(recipe).computed
        diffs = [f"{k}: Lumina now {computed.get(k)!r}, fixture {expected[k]!r}" for k in KEYS if k in expected and computed.get(k) != expected[k]]
        if diffs:
            print(f"FAIL  {name}: " + "; ".join(diffs))
            status = max(status, 1)
        else:
            print(f"PASS  {name}: " + ", ".join(f"{k}={expected[k]!r}" for k in KEYS if k in expected))
    return status


if __name__ == "__main__":
    sys.exit(main())
