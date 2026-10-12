# Recipe Schema v0 and Revision Envelope

- Status: **Draft v0 (Phase 0). Not implemented. Nothing here is frozen.**
- Date: 2026-10-11
- Decision owner: Charles Toepfer
- Freezes: enough for fixtures in Phase 2; stable for the Bridge's library
  storage (Bridge B3)

This document defines the shape of a saved recipe revision: the
**envelope** that identifies it and links it into a history, and the
**content** that Recipe Core validates and calculates from. It also defines
the canonical serialization and hashing rule that the application and the AI
Bridge must compute identically.

It is a design draft. It contains no JSON Schema file and no code. The JSON
Schema follows once the toolchain is selected (Phase 1) and is written in
Phase 2 against the fixtures.

Related: [OVERVIEW.md §5](OVERVIEW.md#5-authoritative-data-model),
[INVARIANTS.md](INVARIANTS.md), [NAMING.md](NAMING.md),
[PUBLIC_PRIVATE_BOUNDARY.md](PUBLIC_PRIVATE_BOUNDARY.md),
[ADR 0006](adr/0006-local-persistence.md),
[ADR 0007](adr/0007-ai-integration-tiers.md),
[REUSE_BASELINE.md](REUSE_BASELINE.md#lumina-port-map-2026-10-11).

## Requirements this draft answers

| # | Requirement | From |
|---|---|---|
| R1 | Stable recipe identity; immutable revisions | OVERVIEW §5, ADR 0006 |
| R2 | Revisions form a history with parents; a merge has several parents; a root has none | Sync model (D-011a) |
| R3 | Two implementations compute the same hash for the same revision | Phase 0 plan; invariant 6 |
| R4 | A duplicate revision ID with the same hash is a no-op; with a different hash it is a conflict | Sync model (D-011a) |
| R5 | A reader rejects schemas newer than it understands and never partially overwrites them | OVERVIEW §6 |
| R6 | A service never hands a device a document newer than that device supports | D-022 |
| R7 | Every quantity is typed and provenanced; unknown stays unknown, never zero | Invariant 7 |
| R8 | Statistics keep independent layers; display prefers the source's claim | Invariant 7; Lumina README |
| R9 | Graph layout never changes process semantics | OVERVIEW §5 |
| R10 | No brand or codename in any interpreted field | NAMING rule 2 |
| R11 | Service metadata never prevents the app from opening or editing a recipe | PUBLIC_PRIVATE_BOUNDARY |
| R12 | Every addressable entity has a stable ID that edit commands can target | ADR 0007; editor command contract |

## 1. Document layout

A saved revision is one JSON object with three top-level parts:

```text
revision
├── envelope   identity, history, schema version, hash  (always hashed, except the hash itself)
├── content    the recipe: what Recipe Core validates and calculates from  (hashed)
└── derived    calculated results cached with their formula versions  (NOT hashed)
```

Anything else (sync bookkeeping, a service's search index, review-queue
state) is a **sidecar record** keyed by `revision_id`, stored outside the
revision. Sidecars are never part of the revision document and never hashed.
This satisfies R11 with no "ignore unknown members" rule inside the
revision itself.

## 2. Envelope

| Member | Type | Rule |
|---|---|---|
| `format` | string | Constant identifying the document type: `"recipe-revision"`. Brand-neutral (R10) |
| `schema_version` | string `"MAJOR.MINOR"` | See §4 |
| `recipe_id` | UUID string | UUIDv7 (Q1 decided). Assigned once when the recipe is created; shared by all its revisions. Copying a recipe ("save as new") assigns a new `recipe_id` and records the source in `content.lineage` |
| `revision_id` | UUID string | UUIDv7 ([RFC 9562](https://www.rfc-editor.org/rfc/rfc9562)), assigned by whoever creates the revision (Q1 decided). IDs sort roughly by creation time, but ordering never depends on it |
| `parents` | array of UUID strings | Revision IDs this revision was derived from. `[]` = root; one = edit; two or more = merge. Sorted ascending (byte order) so the hash doesn't depend on the order of merging |
| `created_at` | string | UTC timestamp, RFC 3339, `Z` suffix, millisecond precision. Informational; never used for ordering or conflict resolution |
| `origin` | string | How this revision came to exist: `user_edit`, `import`, `ai_proposal_accepted`, `ai_created`, `merge`, `migration`. Values-level provenance is in `content`; this is the revision-level summary |
| `content_hash` | string | `"sha256:"` + 64 lowercase hex digits. See §3 |

IDs are lowercase hyphenated UUID strings. **Writers generate UUIDv7** for recipe, revision, entity, and proposal IDs. **Readers accept any valid RFC 9562 UUID** and never derive meaning (such as time) from it, so imported or older IDs of other versions stay valid. Device identity, user identity,
and account identity are **not** in the envelope: they are personal data,
they differ between local and synced copies, and they belong in sidecars.

## 3. Canonical JSON and the hashing rule

**Serialization.** The JSON Canonicalization Scheme,
[RFC 8785 (JCS)](https://www.rfc-editor.org/rfc/rfc8785): members sorted by
UTF-16 code units, no insignificant whitespace, numbers in ECMAScript
form, strings minimally escaped, UTF-8 output. JCS requires I-JSON input
([RFC 7493](https://www.rfc-editor.org/rfc/rfc7493)): no duplicate member
names, and numbers that are exact IEEE-754 doubles.

**Hash input.** The JCS serialization of the object
`{ "envelope": <envelope without content_hash>, "content": <content> }`.
`derived` and every sidecar are excluded.

**Hash.** SHA-256 ([FIPS 180-4](https://csrc.nist.gov/pubs/fips/180-4/upd1/final))
of those bytes, written `sha256:<hex>`.

**Rules that make the hash portable** (writers MUST, readers verify):

1. **No floating-point values in hashed parts.** Every measured, entered, or
   calculated value is a decimal string (§5). JSON numbers are allowed only
   for integers with magnitude below 2⁵³ (ordinals, counts of steps). This
   removes the main source of cross-language JCS disagreement.
2. **Unknown is absent.** An unknown optional member is omitted. Writers
   never emit `null`, `""`, or `0` for "unknown". `null` is invalid in
   hashed parts. (Absent and `null` hash differently; one spelling keeps
   hashes stable, and it enforces invariant 7.)
3. **Decimal strings are normalized:** optional leading `-`, no leading `+`,
   no leading zeros except a single `0` before the point, no exponent, no
   trailing zeros after the point, no trailing point, and `-0` is written
   `0`. So `"5.0"` is written `"5"`, and `"0.50"` is written `"0.5"`. The
   value a user typed (for example `"5.0 gal"`) is kept in
   `provenance.original_display` when it matters.
4. **Arrays are ordered and their order is meaningful** (display order of
   ingredients and stages). Arrays whose order is not meaningful are
   specified as sorted by `id` (only `parents` in v0).
5. **Strings are NFC-normalized Unicode** before hashing. JCS itself does
   not normalize.

**Verification.** A reader recomputes the hash on load. A mismatch means
the document was altered or written incorrectly; the reader reports it and
opens the revision read-only. It never "repairs" the hash silently.

**Test vectors.** Phase 2 publishes vectors (input document, JCS bytes,
hash) and runs them in every implementation's CI, including the Bridge's.
The draft carries none, because a hand-written vector is not evidence.

## 4. Schema versioning

`schema_version` is `"MAJOR.MINOR"`. v0 drafts use `"0.x"`; the first
release that users can save files with is `"1.0"`.

| Change | Bump | Example |
|---|---|---|
| Adds an optional member or a new enum value that older readers can't interpret | MINOR | A new stage kind |
| Removes or renames a member, changes a type, unit, or meaning | MAJOR | Changing a quantity's representation |
| Editorial only (docs, examples) | none | — |

**Reader rules** (R5, R6):

| Document version vs. reader | Behavior |
|---|---|
| Same MAJOR, MINOR ≤ reader | Open and edit normally |
| Same MAJOR, MINOR > reader | **Open read-only** with "created by a newer version". Do not edit: the reader can't know what the unknown members mean or how they interact with calculations, and dropping them on save would lose data |
| Older MAJOR | Migrate forward through the ordered migrations; the migration creates a new revision with `origin: "migration"`, and the original stays in history unchanged |
| Newer MAJOR | Reject with a clear message. Never partially open or overwrite |

**D-022 (schema negotiation), decided 2026-10-11 (Q3).** A service holding
revisions for several devices records, per device, the highest
`schema_version` it supports (sent at pairing and on every sync). The
service:

- writes new revisions at the **lowest MINOR any paired device supports**
  within the current MAJOR, when Recipe Core can express the content at
  that version;
- if it can't (the content needs a newer MINOR), delivers the revision only
  to devices that support it and reports it to the others as "update
  required" (never a silently degraded copy);
- never down-converts across a MAJOR.

Recipe Core therefore needs a "write at version X" capability for MINORs in
its supported range. That is a Phase 2 requirement. It stays cheap because
MINOR changes are additive: every optional member and enum value records
the MINOR that introduced it, and "write at X" means checking the content
uses nothing newer than X and stamping `schema_version` X. No content is
converted.

## 5. Typed quantities

Every physical value is an object, not a bare number:

```json
{ "value": "20", "unit": "L" }
```

| Member | Rule |
|---|---|
| `value` | Normalized decimal string (§3 rule 3) |
| `unit` | A token from the unit table below. The dimension is implied by the unit, so it is not stored (it would be redundant and could disagree) |
| `provenance` | Optional on input; see §6. When absent, the containing entity's provenance applies |

**Unit tokens: decided 2026-10-11 (Q2).** Adopt brewconvert's unit tokens and exact
factors (`model/units.py`, MIT), because brewconvert is the oracle for the
BeerXML port and its factors are exact. That means `kg`, `g`, `lb`, `oz`
(mass); `L`, `mL`, `US gal`, `qt`, `US fl oz` (volume); `s`, `min`, `h`,
`day` (duration); `C`, `F`, `K` (temperature); `SG`, `Plato` (gravity);
`kPa`, `psi`, `bar` (pressure); `ppm`, `mg/L`, `g/L` (concentration);
`package`, `sachet`, `tablet`, `count` (count). Lumina's tokens `degF`,
`degC`, `sec`, and `hr` are mapped on import, not stored. Two cautions:

- brewconvert lists `SG` and `Plato` under one dimension with factor 1. They
  are **not** linearly convertible. Gravity conversion is a versioned
  formula (Phase 2), never a unit factor.
- `tsp` and `tbsp` are volumes, but a teaspoon of a powder is really a mass
  with an unknown density. Lumina keeps them as their own kinds. v0 stores
  them as volume, and a mass-based calculation that needs density reports
  "cannot compute" unless the ingredient snapshot provides one.

The rejected alternative was UCUM (`Cel`, `[degF]`, `[gal_us]`, ...): a
formal standard, but less readable, and it would not match the BeerXML
oracle.

**Count additions** (`package`, `tablet`, `count`) never convert to mass or
volume unless the ingredient snapshot states a unit mass or volume. Then the
conversion is calculated, with provenance.

## 6. Provenance

Attached to a quantity, an ingredient snapshot property, or an entity:

```json
{
  "origin": "imported",
  "confidence": "estimated",
  "source": { "format": "beerxml", "field": "AMOUNT", "original_display": "1 tablet" },
  "note": "Count word in DISPLAY_AMOUNT overrides AMOUNT_IS_WEIGHT"
}
```

| Member | Values |
|---|---|
| `origin` | `declared`, `imported`, `inferred`, `calculated`, `measured`, `manually_entered`, `ai_proposed` (OVERVIEW §5) |
| `confidence` | `confirmed`, `estimated`, `ambiguous` (from Lumina `beerxml_quantity.py`). Lumina's `status` `explicit`/`inferred`/`ambiguous` maps to `confirmed`/`estimated`/`ambiguous` |
| `source` | Optional: `format`, `field`, `original_display`. **No file paths or file names**: they can contain personal data and differ per device. Lumina stores `source_filename`; the mapping drops it to a sidecar |
| `formula` | Required when `origin` is `calculated`: `{ "id": "...", "version": "..." }` from the formula registry |
| `assumptions` | Optional array of `{ "id": "...", "value": <quantity or string> }`, for example an assumed salt hydration form |
| `resolution` | Optional: the import-review resolution applied (`preserve`, `manual`, `reinterpret`, `retain_both`) |
| `note` | Optional free text, shown to the user and never interpreted |

Default origin: `manually_entered` for values typed in the app;
`ai_proposed` for values that arrived in an accepted AI proposal. The
acceptance itself is recorded at revision level (`origin:
"ai_proposal_accepted"`); the value-level origin stays `ai_proposed`, so a
later reader can tell which numbers came from AI.

## 7. Content

```text
content
├── name                 string
├── beverage             { type, style? }
├── lineage?             { copied_from: { recipe_id, revision_id } }
├── targets              batch volume, boil volume, efficiency, ... (quantities)
├── equipment?           snapshot of the equipment profile used (not a reference)
├── ingredients[]        ingredient snapshots, each with a stable id
├── process              { stages[], flows[] }
├── additions[]          ingredient × stage × timing × quantity
├── water?               source/target profiles, treatments
├── statistics           layered stated values (no calculated layer, see §8)
├── calculation_settings formula choices, e.g. which IBU model
├── notes[]              { id, text }, never interpreted by calculations
└── presentation?        graph coordinates, collapsed state, viewport
```

### 7.1 Beverage

`type` ∈ `beer`, `wine`, `mead`, `cider`, `sake` (product scope). Lumina also
has `gruit`, `soda`, `wash`, and `other`. `wash` is excluded; `gruit` and
`soda` are D-019 (open). There is deliberately no `other` in v0: a value
the reader can't place would turn on no calculations, and the UI already
handles "no calculations for this beverage" (BEVERAGE_SCOPE). Unknown types
are a validation error, not a fallback to beer math.

`style` is optional: `{ "system": "bjcp-2021", "code": "...", "name": "..." }`.
Codes and names only (D-020).

### 7.2 Ingredients and additions

An **ingredient** is a snapshot of the properties calculation used, so the
revision computes the same results forever (invariant 6) even if the
catalog changes:

```json
{
  "id": "1f0c...",
  "kind": "fermentable",
  "name": "Pale malt",
  "properties": {
    "color": { "value": "3", "unit": "degL" },
    "potential": { "value": "1.037", "unit": "SG" }
  },
  "catalog_ref": { "catalog": "...", "item": "...", "version": "..." }
}
```

`kind` v0: `fermentable`, `hop`, `culture`, `water_agent`, `fruit`,
`honey`, `sugar`, `adjunct`, `nutrient`, `acid`, `fining`, `other`.
`catalog_ref` is optional; refreshing from the catalog is an explicit,
reviewed edit.

**Ingredient property table.** Which properties each `kind` may carry is
defined in **one place**: a per-kind property table, published with the
schema. Each row gives the property name, its value type (a quantity with
allowed dimensions, or an enum or string), and which formulas read it. Commands
(`set_ingredient_property`), validation, import mapping, and the UI all read
this table. Nothing else in the schema or the command contract names
individual properties, so answering Q9 changes the table and nothing else.

> **Decided 2026-10-11 (owner): Q9, closed table plus `unmapped`.**
> Only properties in the table are accepted by commands and read by
> calculations. A row is added when a formula with a cited source (D-006) or
> an import format (BeerXML, BeerJSON) needs it. Imported fields with no
> row go into `ingredient.unmapped` verbatim, with provenance `imported`.
> They are kept, shown, and exported, but never calculated from and never
> writable by commands. An unknown property name in a command is rejected
> (`unknown-property`).
>
> *Rejected alternative:* open, free-named properties. They would avoid a
> schema MINOR bump per new property, but a misspelled name would silently
> make a statistic "cannot compute", and two writers could store one fact
> under two names. Still to decide per row: representations such as
> potential (Lumina `ppg`, BeerXML `YIELD` %, or specific gravity).

`degL` (degrees Lovibond), `EBC`, and `SRM` are color units. brewconvert's
table has `SRM` and `EBC` (factor 1/1.97) but no Lovibond. Lovibond ↔ SRM is
a formula, not a factor. The unit table in Phase 2 must add them with cited
sources.

An **addition** places an amount of an ingredient into a stage:

```json
{
  "id": "8a2e...",
  "ingredient": "1f0c...",
  "stage": "c41d...",
  "amount": { "value": "4.5", "unit": "kg" },
  "timing": { "basis": "before_end", "offset": { "value": "60", "unit": "min" } }
}
```

`timing` members:

| Member | Rule |
|---|---|
| `basis` | `at_start`, `after_start`, `before_end`, `at_end` |
| `offset` | Duration quantity; required for `after_start` and `before_end` |
| `point` | Optional named timing point: `first_wort`, `flameout` (boil), `dry_hop` (fermentation, conditioning). Allowed values per stage kind come from the stage-kind table (§7.3; Q5 decided) |
| `contact` | Optional duration the ingredient stays in contact (dry hop days, oak, fruit), when it is removed before the stage ends |

A boil addition "60 minutes" is `before_end` 60 min, stated explicitly
instead of assumed (Lumina README, "Process stages"). Separating ingredient and
addition lets one ingredient be added several times (mash and sparge salts,
staggered nutrients, sake's three additions) without merging (Lumina's
`mash-sparge-salt-merge` rule).

### 7.3 Process

`stages[]`: `{ id, kind, name?, parameters, steps[] }`. `parameters` holds
typed quantities (duration, temperature, volume). `steps[]` is an ordered
list of `{ id, name?, parameters }` for multi-step schedules such as mash
rests.

**Stage-kind table.** Stage kinds are defined in **one place**: a
stage-kind table published with the schema. Each row gives the kind, its
parameters (name, dimension, required or optional), its step parameters,
and the named timing points (`timing.point`, §7.2) that additions in a
stage of that kind may use. Commands (`add_stage`, `set_stage_parameter`,
`add_step`, `add_addition`), validation, and formulas read the table. The
command contract names no stage kind. Answering Q5 changes only rows of
this table, plus the Lumina and BeerXML mapping.

Candidate rows come from Lumina's `PROCESS_STAGES`, minus the three that
became timing points (Q5): `mash`, `sparge`, `boil`, `whirlpool`,
`chilling`, `fermentation`, `conditioning`, `stabilization`, `packaging`. Non-beer stages
(for example sake's moto and three-stage addition) are added with the
beverage formulas.

> **Decided 2026-10-11 (owner): Q5, timing points, not stages.** The
> stage-kind table has no `first_wort`, `flameout`, or `dry_hop` kinds:
> - the `boil` row allows points `first_wort` (with `basis: "at_start"`)
>   and `flameout` (with `at_end`);
> - the `fermentation` and `conditioning` rows allow `dry_hop`, with
>   `after_start` or `before_end` timing and an optional `contact` duration.
>
> `whirlpool` and `chilling` stay stages, because they have their own
> duration, temperature, and volume. This matches BeerXML 1.0, where a
> hop's `USE` (`Boil`, `Dry Hop`, `Mash`, `First Wort`, `Aroma`) is a
> property of the addition. A dry hop shows in the graph as an addition on
> its fermentation stage, not as its own node. A first-wort hop is
> `add_addition` with `stage: <boil>, timing: { basis: "at_start", point: "first_wort" }`.
>
> *Rejected alternative:* separate stage kinds, as in Lumina. That would
> create zero-length stages with no flow of their own that overlap the
> boil, complicating the linear-chain calculation.
>
> **Decided 2026-10-11 (owner): Q5b, vessel = stage, temperature = step.**
> A new `fermentation` or `conditioning` stage begins when the beer moves to
> another vessel (a `transfer` flow), so losses and volumes follow each
> racking. A change of temperature or time in the same vessel is a step
> within the stage. Lumina's `primary`, `secondary`, `tertiary`, and
> `conditioning` (`validation.py` `VALID_FERMENTATION_STAGES`) map to steps
> of one stage, because Lumina never records a separate vessel.
>
> *Rejected alternative:* always steps of one `fermentation` stage. Simpler,
> but volume and loss through racking couldn't be modeled.

`flows[]`: `{ id, kind, from, to, amount? }`, with `kind` ∈ `transfer`,
`addition`, `loss`, `dilution`, `blend` (OVERVIEW §5). v0 launch supports a
linear chain. The schema accepts branches and merges; their calculations
report "unsupported" until defined.

### 7.4 Presentation

`presentation` holds graph coordinates, collapsed state, and viewport keyed
by stage ID. Recipe Core never reads it (R9). It is part of `content`, and
therefore of the hash, so a layout change is saved like any other change.
Whether layout-only edits should create revisions or be saved as a sidecar
is open question Q4.

## 8. Statistics layers

`content.statistics` stores only stated values: what the source or user
claimed, and what was measured.

```json
"statistics": {
  "og":  { "declared": { "value": "1.062", "unit": "SG", "provenance": { "origin": "declared" } },
           "imported_estimate": { "value": "1.060", "unit": "SG", "provenance": { "origin": "imported" } },
           "display": "declared" },
  "ibu": { "declared": { "value": "38", "unit": "IBU",
                         "provenance": { "origin": "inferred", "confidence": "estimated", "note": "From recipe notes" } } }
}
```

| Layer | Stored in | Meaning |
|---|---|---|
| `declared` | `content` | The source's stated value, or one the user typed as a target |
| `imported_estimate` | `content` | The source application's own calculation |
| `measured` | `content` (and batches) | A real reading |
| `calculated` | **`derived`, not `content`** | Recipe Core's result |
| `display` | `content` | Which layer the UI shows by default. Absent = the rule below |

**Why `calculated` is not hashed.** A calculated value depends on the
formula version as well as the recipe. If it were hashed, the same recipe
would get a different hash after a formula fix, and two devices on
different Recipe Core versions would disagree about the identity of the same
revision (R3). It is recomputed on open from `content` and cached in
`derived` with its formula ID and version. If the cached version differs
from the running formula, the app recalculates and shows that the value
changed.

**Default display rule** (Lumina, `session.py` `_update_statistics_layers`):
`declared`, else `imported_estimate`, else `calculated`. A recipe created
in the app with nothing declared shows `calculated`.

## 9. Derived

```json
"derived": {
  "core_version": "...",
  "computed_at": "2026-10-11T20:00:00.000Z",
  "statistics": {
    "og": { "value": "1.061", "unit": "SG",
            "provenance": { "origin": "calculated", "formula": { "id": "gravity.og.points", "version": "1" } } }
  },
  "diagnostics": [ { "code": "missing-input", "path": "/ingredients/0/properties/potential", "message": "..." } ]
}
```

`derived` is optional, never authoritative, and a reader may discard and
rebuild it. Formula IDs shown are illustrative; the registry is Phase 2.

## 10. Batch snapshot (outline)

A batch (Phase 7) records `{ recipe_id, revision_id, content_hash }` and
embeds the full revision `content` it was brewed from, so later edits never
rewrite batch history. Measurements, actual timings, device identities, and
deviations belong to the batch, not the recipe. The batch schema is
designed in Phase 7; v0 only reserves this linkage.

## 11. Identity across Lumina, BeerXML, and services

| Concept | Lumina today | This draft |
|---|---|---|
| Recipe identity | One recipe dict per chat session | `recipe_id` (UUID) |
| Revision | None | Immutable `revision_id` + `parents` + `content_hash` |
| Amounts | Legacy imperial float fields plus an additive typed `quantity` | Typed quantities only; legacy fields exist only in the Lumina mapping (Phase 2) |
| Statistics | `recipe["statistics"][name]` with four layers + `display_selection` | Same layers; `calculated` moved to `derived` |
| Import warnings | `ImportWarning` on the pending import | Import report (Recipe Format), not stored in the revision; the resolutions applied are recorded in provenance |

## 12. Size limits

Not set. Performance budgets (maximum document size, ingredient count, stage
count) come from measured workloads in Phase 0 and bound what a service
accepts. Placeholder until then: none.

## Open questions

Decided 2026-10-11 and recorded above: Q1 (UUIDv7, §2), Q2 (brewconvert
unit tokens, §5), Q3 (D-022, §4), Q5 and Q5b (§7.3), Q9 (§7.2).

| # | Question | Owner | Target |
|---|---|---|---|
| Q4 | Layout-only edits: new revision (current draft) or sidecar? | Owner | Phase 1 (graph spike) |
| Q6 | D-016 native file extension, media type, and the JSON Schema `$id` base (brand-neutral) | Owner | Phase 0 |
| Q7 | D-019: `gruit` and `soda` | Owner | Phase 0 |
| Q8 | Is NFC normalization of strings acceptable (it can change user text byte-for-byte while it looks identical)? | Owner | Phase 2 |

## Not decided by this draft

Language, storage engine, and JSON Schema tooling (ADRs 0003, 0004, 0006).
The editor command contract is the next document
(`docs/architecture/EDITOR_COMMANDS.md`); it targets the entity IDs defined
here.
