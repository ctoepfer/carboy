"""Produce or check the canonical-hash test vectors (RECIPE_SCHEMA §3).

The vectors are computed by an implementation independent of Recipe Core:
Trail of Bits' `rfc8785` package for RFC 8785 canonical JSON and Python's
`hashlib` for SHA-256. Recipe Core's TypeScript tests must reproduce them.

    python vectors.py generate   # write fixtures/canonical-hash/vectors.json
    python vectors.py check      # recompute and compare; exit 1 on difference

Case kinds:
  jcs       canonical bytes of the whole input document
  revision  canonical bytes of {"envelope": envelope without content_hash,
            "content": content}; `derived` is excluded from the hash
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import rfc8785

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "fixtures" / "canonical-hash"
CASES = FIXTURES / "cases"
VECTORS = FIXTURES / "vectors.json"


def hash_input(name: str, doc: object) -> object:
    if not name.startswith("revision-"):
        return doc
    assert isinstance(doc, dict)
    envelope = {k: v for k, v in doc["envelope"].items() if k != "content_hash"}
    return {"envelope": envelope, "content": doc["content"]}


def compute() -> list[dict]:
    out = []
    for path in sorted(CASES.glob("*.input.json")):
        name = path.name.removesuffix(".input.json")
        doc = json.loads(path.read_text(encoding="utf-8"))
        canonical = rfc8785.dumps(hash_input(name, doc))
        out.append(
            {
                "name": name,
                "kind": "revision" if name.startswith("revision-") else "jcs",
                "input": f"cases/{path.name}",
                "canonical_utf8_hex": canonical.hex(),
                "sha256": "sha256:" + hashlib.sha256(canonical).hexdigest(),
            }
        )
    return out


def rfc_sample_check() -> list[str]:
    """The RFC's own example: our generator must agree with the RFC text."""
    hex_file = CASES / "rfc8785-sample.utf8.hex"
    expected = bytes.fromhex("".join(hex_file.read_text(encoding="ascii").split()))
    doc = json.loads((CASES / "rfc8785-sample.input.json").read_text(encoding="utf-8"))
    actual = rfc8785.dumps(doc)
    return [] if actual == expected else ["rfc8785-sample: generator disagrees with the RFC bytes"]


def main(mode: str) -> int:
    problems = rfc_sample_check()
    vectors = compute()
    if mode == "generate":
        if problems:
            print("\n".join(problems))
            return 1
        doc = {
            "description": "Canonical JSON (RFC 8785) and SHA-256 test vectors for RECIPE_SCHEMA §3. See README.md.",
            "generator": f"tools/canonical-hash/vectors.py (rfc8785 {rfc8785.__version__}, hashlib)",
            "vectors": vectors,
        }
        VECTORS.write_text(json.dumps(doc, indent=2, ensure_ascii=True) + "\n", encoding="ascii")
        print(f"wrote {len(vectors)} vectors")
        return 0
    stored = json.loads(VECTORS.read_text(encoding="ascii"))["vectors"]
    by_name = {v["name"]: v for v in stored}
    for v in vectors:
        s = by_name.pop(v["name"], None)
        if s is None:
            problems.append(f"{v['name']}: case has no stored vector (run generate)")
        elif s != v:
            problems.append(f"{v['name']}: stored vector differs from recomputed value")
    problems += [f"{n}: stored vector has no case file" for n in by_name]
    print("\n".join(problems) if problems else f"ok: {len(vectors)} vectors match (rfc8785 {rfc8785.__version__})")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "check"))
