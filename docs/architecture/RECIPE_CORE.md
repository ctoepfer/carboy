# Recipe Core v0: numbers, units, and quantities

- Status: **Phase 2, in progress.** Implemented in
  [`packages/recipe-core/`](../../packages/recipe-core/) (`@carboy/recipe-core`).
  This page documents what the code does; the code and its tests are
  authoritative when they disagree.
- Date: 2026-10-13
- Decision owner: Charles Toepfer
- Builds on: [ADR 0004](adr/0004-typescript-recipe-core.md) (Accepted),
  [RECIPE_SCHEMA.md](RECIPE_SCHEMA.md) §3 and §5, [OVERVIEW.md](OVERVIEW.md) §2.

## 1. Boundary

Recipe Core is pure TypeScript compiled for ES2022 with **no DOM library and
no `@types`** (`packages/recipe-core/tsconfig.json`). Any browser or Node API
(`document`, `process`, `setTimeout`, …) fails to compile, which enforces
invariant 11 from the first line of code. Tests run the compiled output
under Node's built-in test runner; Node is a test host only.

## 2. Decimal arithmetic and precision policy

Every stored number is a decimal string (RECIPE_SCHEMA §3 rule 1).
`Decimal` holds an exact BigInt coefficient and a power-of-ten scale.

| Operation | Behaviour |
|---|---|
| `parse` | Plain decimal strings only: digits, optional fraction, optional leading `-`. No exponent, `+`, whitespace, or locale separators (locale input is the UI's job, USABILITY §2.4) |
| `isNormalized` | The stricter document form of RECIPE_SCHEMA §3 rule 3 (`"5"`, not `"5.0"`; `"0"`, not `"-0"`) |
| `add`, `sub`, `mul`, `neg`, `abs` | **Exact** |
| `div` | The **only** rounding operation: rounded **once**, half-even, to **34 significant digits** (IEEE 754 decimal128 precision) unless a caller asks for fewer |
| `round(places)` | Half-even; used for display and for formulas whose source states a rounding step. Stored values are never rounded implicitly |
| `toString` | Normalized document form |

**Transcendental functions** (`math.ts`, 2026-10-14): `expDecimal`,
`lnDecimal`, and `powDecimal` (x^y = exp(y · ln x), x > 0) use only integer
arithmetic at the requested precision plus 20 guard digits, then round
half-even once. JavaScript's `Math.exp` and `Math.pow` are not used in
formulas, because engines may differ in the last bit (invariant 6). Tested
against Python `decimal` (correctly rounded) to all 34 digits.

**Parity tolerance.** brewconvert computes conversions in Python's `decimal`
at 40 digits with intermediate rounding, so results can differ from Recipe
Core in the last digits. Parity fixtures (D-005) compare with a declared
tolerance, never byte equality of long quotients.

## 3. Units

The unit table follows brewconvert's tokens and exact factors (Q2). Each
convertible unit has an **exact rational factor** to its dimension's base
unit, so every conversion is one exact product and at most one division.

| Dimension | Base | Tokens | Notes |
|---|---|---|---|
| mass | kg | `kg` `g` `lb` `oz` | International avoirdupois pound, 0.45359237 kg exactly |
| volume | L | `L` `mL` `US gal` `qt` `US fl oz` `tbsp` `tsp` | US liquid measures (not imperial). US fl oz = 1/128 US gal; tbsp = 1/2 US fl oz; tsp = 1/6 US fl oz |
| duration | min | `s` `min` `h` `day` | |
| temperature | — | `C` `F` `K` | Affine; converted via Celsius as one exact fraction. The only signed dimension |
| pressure | kPa | `kPa` `bar` `psi` | psi = 0.45359237 kg × 9.80665 m/s² ÷ 0.00064516 m², kept as that exact ratio (brewconvert stores 16 digits of it; the first 16 agree) |
| concentration | mg/L | `mg/L` `ppm` `g/L` | `ppm` = `mg/L` is brewconvert's dilute-aqueous-solution convention, adopted with Q2; it is not valid for dense solutions such as must or wort |
| fraction | fraction | `fraction` `%` | |
| count | — | `package` `sachet` `tablet` `count` | Never interchangeable with each other, never mass or volume (RECIPE_SCHEMA §5) |
| scale | — | `SG` `Plato` `Brix` `degL` `SRM` `EBC` `IBU` `pH` | Each converts only to itself. **Converting between scales is a versioned formula** (SG ↔ °P, SRM ↔ EBC, SRM ↔ °L), never a unit factor |

**Differences from brewconvert, deliberately:**

1. **Colour scales are not convertible by factor.** brewconvert converts EBC
   to SRM with the factor 1.97; Recipe Core treats that as an empirical
   formula, as RECIPE_SCHEMA §5 already does for SG and Plato.
2. **Rational factors** for `s`, `F`, and `psi` instead of truncated
   decimals.
3. **No aliases in Recipe Core.** Spellings such as `lbs`, `°F`, `degF`
   (Lumina), or `gallon` are mapped by importers (Recipe Format), which
   record the original spelling; Recipe Core accepts canonical tokens only.

### RQ1: tokens beyond the Q2 list (approved 2026-10-13)

RECIPE_SCHEMA Q2 listed mass, volume, duration, temperature, gravity,
pressure, concentration, and count tokens. The schema's own examples and
the formula coverage table also need: `fraction`, `%`, `tbsp`, `tsp`,
`Brix` (wine, mead, cider: BEVERAGE_SCOPE), `degL`, `SRM`, `EBC`, `IBU`,
and `pH`. **Approved by the owner on 2026-10-13**, with these conditions,
which the table above already meets: dimensional correctness; gravity and
colour-scale conversions that need empirical relationships are versioned
formulas, not unit factors; **pH is a scale, never a linearly convertible
concentration**; canonical tokens internally, aliases mapped only at
import and display boundaries.

### RQ2: `mg` (proposed 2026-10-14)

Nutrient and sulfite doses are usually stated in milligrams, and `mg` is
not a token (Q2 and RQ1 have `kg`, `g`, `lb`, `oz`). Proposal: add `mg`
(mass, 0.000001 kg exactly). **Owner confirmation needed**; until then
inputs in milligrams are refused (`unknown-unit`), and callers convert to
grams.

## 4. Quantities

A quantity is `{ "value": "<decimal string>", "unit": "<token>" }`
(RECIPE_SCHEMA §5).

- `validateQuantity(q)` returns every issue at once, each with a stable
  code: `invalid-decimal`, `non-normalized-decimal`, `unknown-unit`,
  `negative-quantity` (only temperatures may be negative).
- `convert(q, unit)` returns a `Decimal` or throws `QuantityError` with a
  code: `unknown-unit`, `invalid-decimal`, `dimension-mismatch`,
  `scale-needs-formula`, `count-not-interchangeable`.
- Conversion is for calculation and display. It never rewrites a stored
  quantity: a recipe keeps the value and unit the user entered (USABILITY
  U10).

## 5. Canonical JSON and the content hash

Implements RECIPE_SCHEMA §2–§3 (`canonical.ts`, `hash.ts`, `revision.ts`).

- **Canonical JSON:** RFC 8785. Primitives serialize exactly as ECMAScript
  `JSON.stringify` (the RFC's reference); members sort by UTF-16 code units;
  NaN, Infinity, lone surrogates, and non-JSON values are refused with a
  code. UTF-8 encoding is done in Recipe Core (no `TextEncoder`).
- **SHA-256:** [`@noble/hashes`](https://github.com/paulmillr/noble-hashes)
  2.4.0, pinned exactly (MIT, zero dependencies, independently audited
  including SHA-256, runs on every target engine; owner decision
  2026-10-13). Never implemented in Recipe Core.
- **Writer** (`createRevision`): copies only known envelope members, sorts
  `parents`, NFC-normalizes every string and key (two keys that become equal
  are reported, never merged), checks every rule, then hashes.
- **Reader** (`verifyRevision`): checks the same rules, hashes every
  envelope member except `content_hash` (so members a newer MINOR adds are
  protected), and never repairs. Results: `valid`, `invalid` (rule
  violations, each with a code and JSON Pointer), or `hash-mismatch` (open
  read-only).
- **Rules checked:** no `null`; numbers only as integers below 2⁵³; strings
  and keys NFC and well-formed; every `{value, unit}` object is a valid
  quantity (§4); lowercase RFC 9562 UUIDs; `parents` sorted and unique;
  RFC 3339 UTC timestamps with milliseconds; known `origin`.
- **Vectors:** [`fixtures/canonical-hash/`](../../fixtures/canonical-hash/README.md).

The hash is an integrity check, not authentication or a signature.

## 6. Formula registry

`src/formulas/`: each formula is a `FormulaDefinition` with an id and
version, a status, its source status and citations, the expression,
assumptions, inputs (with accepted units), applicability (beverages),
rounding behaviour, and output. Results are either `computed` (value, unit,
formula id and version, the assumptions that applied) or `unavailable` with
a reason: `unsupported-beverage`, `missing-input`, `invalid-input`,
`formula-unavailable` (with the missing dependency), or `not-enabled`.
Nothing is ever defaulted: a missing moisture or efficiency is reported,
not assumed.

Status follows D-006: only `enabled` formulas produce values for users;
`parity-reference` formulas run only when a caller opts in (`{ parity:
true }`) to compare with Lumina or BeerXML-derived values. Results may also be `out-of-range` when an input lies outside what the
formula's source covers; nothing is extrapolated. Reference data a formula
needs (such as Plato's sucrose table) is embedded from a verified fixture in
`fixtures/reference-tables/`, never fitted ad hoc. The current
entries and their sources are listed in
[FORMULA_COVERAGE.md](FORMULA_COVERAGE.md#implemented-in-recipe-core-2026-10-13).

## 7. Provenance, statistics layers, and validation

Implements RECIPE_SCHEMA §6–§9 (`provenance.ts`, `statistics.ts`,
`stage-kinds.ts`, `content.ts`). Every check reports a coded issue with a
JSON Pointer; nothing is repaired or filled in.

- **Provenance:** the seven value origins (declared, imported, inferred,
  calculated, measured, manually entered, AI-proposed), confidence,
  resolution. A calculated value must name its formula
  `{ id, version }` (version as a string). `source` may hold only
  `format`, `field`, `original_display`: no file names or paths.
- **Statistics layers:** `declared`, `imported_estimate`, `measured` in
  content; `calculated` only in `derived` (a calculated layer or origin in
  content is an error). Each layer holds only matching origins, so an
  estimate can never sit in the measured layer, or a measured value be
  passed off as declared by an import. Display rule: the chosen layer if
  it has a value, else declared, imported estimate, calculated; measured
  only when chosen; otherwise **unknown**, never zero.
- **Calculated entries:** `toCalculatedStatistic` turns a formula result
  into its `derived` entry, keeping an unavailable result unavailable;
  `isCalculatedCurrent` detects a cached value from an older formula
  version so it is recalculated and the change shown.
- **Stage-kind table v0:** `mash`, `sparge`, `boil` (points `first_wort`,
  `flameout`), `whirlpool`, `chilling`, `fermentation` and `conditioning`
  (point `dry_hop`), `stabilization`, `packaging`. Parameter rows come with
  the formulas that read them; non-beer kinds with their beverage formulas.
- **Content validation, first slice:** beverage type (no fallback to beer);
  ids valid and unique across the document; additions name an existing
  ingredient and stage and have an amount; flows name existing stages;
  ingredient, stage, and flow kinds from their tables; timing basis,
  offsets, contact durations, and named points allowed by the stage kind
  with their implied basis; statistics and provenance throughout.
- **Statistics calculator** (`calculate.ts`, 2026-10-14):
  `calculateStatistics(content)` returns the calculated layer for `derived`
  (`extract`, `og`, `og_plato`, `mcu`) and diagnostics; it never writes
  content. Extract sources are `fermentable` and `sugar` additions in
  hot-side stages (mash, sparge, boil, whirlpool, chilling); later
  additions are excluded with `addition-after-og-point`. Fruit or honey on
  the hot side of a beer makes extract and OG `formula-unavailable`.
  Missing properties or targets are reported by JSON Pointer. Assumption:
  `targets.batch_volume` is the cool wort volume at 20 °C, and brewhouse
  efficiency applies to every extract source, boil sugars included (as
  Holle's single overall efficiency).
- **Schema 0.2 members** (`schema.ts`, `content.ts`, 2026-10-14): optional
  ingredient `group_ref` (requirement) and `alternatives[]` (approved
  stand-ins: `catalog_ref`, optional `note`, provenance `manually_entered`
  or `ai_proposed`); catalog references need non-empty `catalog`, `item`,
  `version`; an alternative may not repeat the preferred product or
  another alternative (same catalog and item, any version). Per-member
  MINOR bookkeeping: `requiredSchemaVersion`, `checkSchemaVersion`. The
  recipe `language` member waits for UQ5.
- **Remaining validation** (2026-10-14): every quantity is checked where
  it appears (addition amounts, stage and step parameters, targets,
  ingredient properties), with the issue on `/value` or `/unit`; stage
  `parameters` are an object of quantities and `steps` an array of
  `{ id, name?, parameters }` (parameter names are not tabled until a
  formula reads them); flows may branch and merge but a flow leading back
  to a stage it comes from is `process-cycle`; known targets:
  `batch_volume` a positive volume, `efficiency` a fraction.
- **Ingredient property table v0** (`properties.ts`, Q9 closed table):
  `color` (degL, SRM, EBC), `extract_yield` and `moisture` (fraction, %)
  for fermentable and sugar, read by `color.mcu` and `extract.mass`;
  `alpha_acid` (fraction, %) for hops, because BeerXML 1.0 requires HOP
  ALPHA (no IBU formula yet). Anything else is `unknown-property`;
  imported fields without a row belong in `unmapped` (an object, kept
  verbatim, never calculated from).
- **Beverage advisories** (`advisories.ts`): completeness hints ported from
  Lumina's `validation.py` (beer without fermentable or hops; mead without
  honey; cider without fruit; wine without fruit or sugar; no culture for
  beer, wine, mead, cider). Reported separately; they never make content
  invalid, so an unfinished recipe stays editable. Sake has none (no
  source).

## 7a. Scaling policy v1 (2026-10-14)

`scaleRecipe(content, batchVolume)` (`scaling.ts`) returns the expansion of
the `scale_recipe` macro (EDITOR_COMMANDS §5.8): a `set_target` for the
batch volume and a `set_addition_amount` per changed addition. It never
edits content; applying the commands is the editor's job (Phase 4).

| Addition | Treatment | Source |
|---|---|---|
| Fermentable, sugar, honey, fruit, hop, adjunct, by mass or volume | × new/old batch volume | Lumina `state.py` `_scale_batch` (botanicals there ≈ adjuncts here) |
| Culture | Not scaled (`culture`): pitch rate is the brewer's call | Lumina ("review pitch rate") |
| Any amount in a count unit (package, sachet, tablet, count) | Not scaled (`count`) | Whole units can't be multiplied by a fraction |
| Water agent, nutrient, acid, fining, other | Not scaled (`review-dose`): the dose may follow mash or sparge water, or a measured value, rather than batch volume | Lumina doesn't scale them; no source for a rule |
| Other volume targets (boil volume, …) | Not scaled (`equipment-volume`): boil-off and losses aren't linear | EDITOR_COMMANDS §5.8 |
| Hops | Scaled, with note `hop-utilization-not-modelled` (utilization depends on boil gravity and volume; no IBU formula yet) | EDITOR_COMMANDS §5.8 |

**Rounding:** each amount is computed from exact rationals with one
division, rounded half-even to 34 significant digits, and stored at that
precision; nothing is rounded to "nice" values. Whether scaled amounts
should be rounded to a stated precision before they are stored (for
example 1 g, or 0.01 kg) is open question **SQ1** for the owner; display
rounding is a UI matter either way. Statistics of the scaled recipe are
recalculated, never carried over.

## 7b. Migrations (2026-10-14)

`migrateRevision(original, { revision_id, created_at })` (`migrate.ts`)
moves a revision with an older schema MAJOR forward through the ordered
`MIGRATIONS`, one step per MAJOR, into a **new** revision: same
`recipe_id`, `parents: [original revision_id]`, `origin: "migration"`,
the last step's `schema_version`. The original must verify (a tampered or
miswritten revision is not migrated), is never changed, and stays in
history. Each step receives a copy of the content, so it can't alter the
original. Refusals: `not-needed`, `newer-major`, `no-migration-path`,
`unverified-original`, `migration-failed` (with the step), and
`invalid-result` (the migrated content fails validation). MINOR changes
are additive and need no migration (§4, D-022).

`MIGRATIONS` is empty: the schema has only MAJOR 0. The mechanism is
tested with test-only steps toward hypothetical 1.0 and 2.0 schemas. When
MAJOR 1 exists, `readNative` reports an older MAJOR and the caller runs
`migrateRevision`.

## 8. Verification

`npm test` at the repository root builds and runs every package's tests;
the `core` workflow runs them on Node 22 and 24 for every push and pull
request, and checks the hash vectors with the independent Python
implementation. Expected values are exact products or were computed independently
(Python `decimal`, 80 digits, rounded half-even to 34); the three oz/lb
regression values are the ones brewconvert documents as its oracle.

**Parity fixtures in both languages (D-005):** the Lumina parity fixtures
pass in TypeScript (`parity.test.mjs`) and are reproduced exactly by
Lumina's own code through the Python runner
([fixtures/parity/README.md](../../fixtures/parity/README.md)), run locally
because Lumina is not public.

## 9. Next in Recipe Core

In order: more formulas as their sources are read (Morey,
Tinseth, ABV; wine-condition pK₁, YAN requirements). Stage parameter rows
come with the formulas that read them.
