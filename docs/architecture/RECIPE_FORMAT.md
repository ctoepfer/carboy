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

## Lumina mapping v0 (2026-10-14)

`fromLumina(dict, { newId })` maps a Lumina recipe dict (as Lumina's BeerXML
importer produces it) to Carboy content plus a **report**; `toLumina(content)`
maps back. Rules:

- Typed quantities are authoritative; Lumina's legacy imperial floats
  (`weight_lb`, `weight_oz`, `batch_size_gal`, `boil_size_gal`, …) and the
  derived members of its quantities are recomputed on export.
- Lumina's quantity `status` and source become provenance: `ambiguous` →
  `confidence: "ambiguous"`, `inferred` → `estimated`; `source_field` and
  `original_display` are kept; source **file names are not stored**.
- Placement follows Lumina's own `use` (Mash, Boil, Primary/Secondary →
  fermentation, Bottle → packaging; water salts by phase). Only Boil times
  become timing (`before_end`, or `at_end` for 0); no timing is invented.
  Fermentables go to the mash unless the method is `extract`.
- Lumina-only fields of an item (`ppg`, per-malt `efficiency`, yeast
  `attenuation` and `form`, misc `use`, notes, alternative readings, …) are
  kept in the ingredient's `unmapped`, each as the JSON text of the original
  value, so they round-trip exactly and are never calculated from.
- Statistics: stated layers only, with BeerXML 1.0's implicit units (OG/FG
  SG, ABV %, IBU, colour SRM); Lumina's `batch_volume`/`boil_volume`
  statistics duplicate the targets and are recomputed. Calculated values are
  never imported into content.
- Lumina's style text becomes `beverage.style_text` (schema 0.2).
- Everything without a Carboy home is listed in the report with a reason
  (`not-mapped`, `derived`, `file-name-not-stored`, `workflow-state`,
  `import-metadata`). Unsupported beverages (`soda`, `gruit`, `wash`,
  `other`) are refused, not mapped to beer.

**Round-trip fixtures** (`test/lumina.test.mjs`) on the owner's two real
recipes as Lumina's importer produced them
([fixtures/parity/lumina-dicts/](../../fixtures/parity/README.md)): the
mapped content validates at schema 0.2 and saves and reopens editable;
Carboy's MCU on it equals Lumina's own (within 1e-9 relative); Lumina →
Carboy → Lumina reproduces every field the report doesn't list (floats
within 1e-9 relative, derived values recomputed); Carboy → Lumina → Carboy
is byte-identical.

## Integration milestone (2026-10-14)

`packages/recipe-format/test/e2e.test.mjs` takes a complete recipe (the
owner's Ultimate Coffee Schwarzbier grain bill) through create → validate →
calculate → canonically serialize → hash → save to disk → reopen → verify,
and checks that the envelope, content, hash, canonical bytes, and every
recalculated statistic are unchanged, that calculated values never appear
in content, that tampering and newer schemas are caught, and that a mead
recipe round-trips with its beer statistics honestly unavailable.
