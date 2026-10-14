# Canonical JSON and hash test vectors

Published test vectors for [RECIPE_SCHEMA.md §3](../../docs/architecture/RECIPE_SCHEMA.md#3-canonical-json-and-the-hashing-rule):
RFC 8785 canonical JSON and the SHA-256 content hash. Every implementation
(Recipe Core in TypeScript, the Python tools, the hosted service) must
reproduce them exactly.

## Files

| File | Contents |
|---|---|
| `vectors.json` | One entry per case: `name`, `kind`, `input` (case file), `canonical_utf8_hex` (the exact canonical bytes), `sha256` |
| `cases/*.input.json` | Input documents. Byte-exact (see `.gitattributes`); non-ASCII is written as JSON escapes so the files survive any editor |
| `cases/rfc8785-sample.*` | The example from RFC 8785 with its canonical text and UTF-8 bytes, copied from the RFC |

Kinds:

- `jcs`: the canonical bytes of the whole input document.
- `revision`: the content hash rule. Hash input is
  `{"envelope": <envelope without content_hash>, "content": <content>}`;
  `derived` is excluded. Inputs have no `content_hash`; the vector's `sha256`
  is the value a writer puts there.

## Independence

`vectors.json` is produced by [`tools/canonical-hash/vectors.py`](../../tools/canonical-hash/vectors.py)
using Trail of Bits' `rfc8785` package (Apache-2.0) and Python's `hashlib`,
not by Recipe Core. The generator first checks itself against the RFC's own
example bytes. CI runs `vectors.py check` (Python) and Recipe Core's tests
(TypeScript) against the same files.

## Coverage

| Case | What it exercises |
|---|---|
| `rfc8785-sample` | The RFC's example, including number formatting and escapes |
| `jcs-key-order` | Member order by UTF-16 code units: an astral character sorts before U+FF21; empty and digit keys |
| `jcs-escapes` | Control characters, quote and backslash, unescaped `/`, U+2028/U+2029 left literal, Latin-1, CJK, emoji |
| `jcs-numbers` | Safe integers at ±(2⁵³−1); ECMAScript float formatting (`1e+21`, `1e-7`, `-0` → `0`, subnormal). Generic JCS only: recipe documents allow integers alone |
| `revision-minimal` | Root revision with empty content |
| `revision-typical` | Quantities, NFC text with umlauts and an en dash, emoji, nested arrays, additions with timing, a declared statistic, and a `derived` block outside the hash |
| `revision-merge` | Two parents (sorted), mead, US gallons, non-zero milliseconds |

Negative and edge cases (non-NFC strings, keys that collide after NFC,
modified content or envelope, reordered arrays, unsorted or duplicate
parents, malformed quantities, `null`, non-integer numbers, lone surrogates,
envelope format errors) are tested in
`packages/recipe-core/test/revision.test.mjs` against these same files.

The revision cases are also valid recipe content
(`validateContent` reports no issues for them), so they double as small
example documents.

## Regenerating

Only when a case is added or changed, and review the diff:

```bash
python3 -m venv .venv && .venv/bin/pip install -r tools/canonical-hash/requirements.txt
.venv/bin/python tools/canonical-hash/vectors.py generate
.venv/bin/python tools/canonical-hash/vectors.py check
```

The hash is an integrity check, not authentication: anyone can recompute it.
No signatures are defined in this phase.
