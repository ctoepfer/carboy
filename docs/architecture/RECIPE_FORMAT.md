# Recipe Format v0: the native file

- Status: **Phase 2, in progress.** Implemented in
  [`packages/recipe-format/`](../../packages/recipe-format/)
  (`@carboy/recipe-format`). Depends only on Recipe Core; same boundary (no
  DOM, Node, storage, network, or shell).
- Date: 2026-10-14
- Builds on: [RECIPE_SCHEMA.md](RECIPE_SCHEMA.md) §1–§4 and §9,
  [RECIPE_CORE.md](RECIPE_CORE.md) §5.

## Writing

`writeNative(revision)` writes one revision document
`{ envelope, content, derived? }` as RFC 8785 canonical JSON with a final
newline. The same revision always produces the same bytes, so files diff and
compare cleanly. The content hash is computed by Recipe Core
(`createRevision`) before writing and covers the envelope (without
`content_hash`) and content, never `derived`.

## Reading

`readNative(text)` never repairs. In order:

| Check | Outcome |
|---|---|
| Not JSON | Rejected (`not-json`) |
| Not a `recipe-revision` document | Rejected (`not-a-revision`) |
| Schema MAJOR newer than supported (0) | Rejected (`newer-major`) |
| A member name repeated within one object (not I-JSON) | Rejected (`invalid`, issue `duplicate-member` with its JSON Pointer) |
| Envelope or hashing rules broken | Rejected (`invalid`), with coded issues |
| Hash doesn't match | **Read-only** (`hash-mismatch`) |
| Schema MINOR newer than supported (0.2) | **Read-only** (`newer-minor`) |
| Content invalid (references, kinds, a calculated value in content, …), or using a member newer than its declared `schema_version` (`member-newer-than-schema`) | **Read-only** (`invalid-content`) |
| Otherwise | Editable |

The stored `derived` block is returned as `storedDerived` with
`derivedTrusted: false`: callers recompute statistics from content
(`calculateStatistics`) and may compare, never use the stored values as
truth.

Duplicate member names: `JSON.parse` silently keeps the last one, so two
readers could see different recipes in one file. `duplicateMembers(text)`
scans the accepted text and reports every repeated name (compared after
escape processing, by code point, as I-JSON specifies); such a file is
rejected rather than opened, since no reading of it is authoritative.

## Schema versions

This build writes and reads schema **0.1 and 0.2**. 0.2 adds the optional
ingredient members `group_ref` and `alternatives[]` ([RECIPE_CORE §7](RECIPE_CORE.md#7-provenance-statistics-layers-and-validation)). Recipe Core
records which MINOR introduced each member, so `requiredSchemaVersion`
gives the lowest version that can express a recipe and
`checkSchemaVersion(content, "0.1")` lists what prevents writing it at 0.1
(D-022 "write at X"; nothing is converted).

## Integration milestone (2026-10-14)

`packages/recipe-format/test/e2e.test.mjs` takes a complete recipe (the
owner's Ultimate Coffee Schwarzbier grain bill) through create → validate →
calculate → canonically serialize → hash → save to disk → reopen → verify,
and checks that the envelope, content, hash, canonical bytes, and every
recalculated statistic are unchanged, that calculated values never appear
in content, that tampering and newer schemas are caught, and that a mead
recipe round-trips with its beer statistics honestly unavailable.
