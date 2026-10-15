#!/usr/bin/env python3
"""Produce the Lumina recipe-dict fixtures for the Lumina <-> Carboy mapping.

For each fixture in fixtures/parity/lumina/ (the owner's recipes, cleared
for publication), run Lumina's own BeerXML importer on the recorded,
checksummed source file and write Lumina's recipe dict, unchanged except
that `source_import.imported_at` (the time of the run) is removed, to
fixtures/parity/lumina-dicts/<name>.json.

Local only and read-only, like lumina_runner.py:

    <lumina>/runtime/venv/bin/python -I tools/parity/lumina_dicts.py --lumina <lumina> [--check]

--check compares instead of writing (exit 1 on any difference).
"""

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PARITY = ROOT / "fixtures" / "parity" / "lumina"
OUT = ROOT / "fixtures" / "parity" / "lumina-dicts"
PREFIX = "Lumina "


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--lumina", required=True, type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    sys.dont_write_bytecode = True
    root = args.lumina.resolve()
    sys.path[:0] = [str(root), str(root / "bin")]
    from brains.recipes.beerxml_import import parse_beerxml

    revision = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    status = 0
    for path in sorted(PARITY.glob("*.json")):
        parity = json.loads(path.read_text(encoding="utf-8"))
        source = parity["provenance"]["source_file"]
        data = (root / source[len(PREFIX):]).read_bytes()
        if hashlib.sha256(data).hexdigest() != parity["provenance"]["source_sha256"]:
            print(f"FAIL  {path.name}: source file changed")
            status = 1
            continue
        recipe = parse_beerxml(data, source_filename=Path(source).name).recipe
        recipe.get("source_import", {}).pop("imported_at", None)
        doc = {
            "fixture": f"lumina-dict-{path.stem}",
            "purpose": "Lumina's own recipe dict for the owner's recipe: input for the Lumina <-> Carboy mapping round-trip tests (recipe-format).",
            "provenance": {
                "recipe": parity["provenance"]["recipe"],
                "source_file": source,
                "source_sha256": parity["provenance"]["source_sha256"],
                "producer": "Lumina brains/recipes beerxml_import.parse_beerxml(...).recipe, run read-only (no bytecode) by tools/parity/lumina_dicts.py",
                "lumina_revision": revision,
                "normalization": "source_import.imported_at removed (time of the run); nothing else changed",
            },
            "lumina": recipe,
        }
        text = json.dumps(doc, indent=1, ensure_ascii=False, sort_keys=False) + "\n"
        target = OUT / path.name
        if args.check:
            ok = target.exists() and json.loads(target.read_text(encoding="utf-8"))["lumina"] == json.loads(text)["lumina"]
            print(f"{'PASS' if ok else 'FAIL'}  {target.name}")
            status = status or (0 if ok else 1)
        else:
            OUT.mkdir(exist_ok=True)
            target.write_text(text, encoding="utf-8")
            print(f"wrote {target.relative_to(ROOT)}")
    return status


if __name__ == "__main__":
    sys.exit(main())
