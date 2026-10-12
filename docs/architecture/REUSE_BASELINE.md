# Carboy — Reuse Baseline

Status: **Phase 0 in progress.** Initial inspection 2026-10-09; measured
sizes, test results, and fixture provenance added 2026-10-11 (see
"Phase 0 measurements" below). Paths are relative to each project's root.
License decided 2026-10-11: Carboy is Apache-2.0, and the owner's Lumina
recipe code and fixtures may be ported under it (D-001/D-002).

## Sources

`codesamples/…` paths refer to the public
[ctoepfer/codesamples](https://github.com/ctoepfer/codesamples) repository; the
local working copy is `/mnt/lumina_share/lumina/runtime/coding/repositories/codesamples`. Inspect the local copy: it can contain work not
yet on GitHub. Never modify these source projects from this repository.

| Source | Location | Language | License |
|---|---|---|---|
| Lumina recipes brain | `/mnt/lumina_share/lumina/brains/recipes/` (private Lumina repo) | Python | Owner's code; may be ported into Carboy under Apache-2.0 (D-002, 2026-10-11) |
| brewconvert | `codesamples/brewconvert/` | Python, zero dependencies | MIT |
| brewpanel (future Pacific BrewIO) | `codesamples/brewpanel/` | Python | MIT |

## Lumina recipes brain

About 9.8k lines of Python. Chat-first, server-rendered (FastAPI/Jinja), with
recipes stored as one dict per session.

| Asset | Path | Reuse intent |
|---|---|---|
| Beer statistics: MCU, SRM, gravity, OG, FG, ABV, Tinseth IBU | `stats_hooks.py` (~260 lines) | **Port** to Recipe Core; Lumina results become parity fixtures |
| Typed quantities and provenance | `quantity.py`, `beerxml_quantity.py` | **Port the model and vocabulary** (dimension, decimal value, provenance origins) |
| Statistics layering and display rule | `README.md` ("Source evidence and statistics layering") | **Adopt** `declared`/`imported_estimate`/`calculated`/`measured` and the prefer-the-source display rule |
| Import validation rules | `import_validation.py` | **Port** rules (implausible boil volume, yeast/tablet as liquid volume, hop-stage ambiguity, notes-vs-structured disagreement) |
| Water ion contribution checks | `water_chemistry.py` | **Port** (consistency checking only; not a pH predictor) |
| Equipment profiles | `equipment_profiles.py` | **Reuse design** (fields, snapshot onto recipe) |
| Beverage types and inference | `beverage.py` | **Adapt**: drop `wash`; add `sake`; decide on `soda`/`gruit` |
| Edit command vocabulary | `state.py` (`apply_recipe_action`), `commands.py` | **Reference** when defining the editor command contract |
| Mash and fermentation steps | `session.py`, `timeline.py` | **Reference** for stage semantics |
| BJCP style data | `bjcp_styles.py` | **Low risk as is**: 94 entries of style code, style name, and aliases only, with no guideline text or vital statistics. Descriptions or OG/IBU ranges would need a separate permission check (D-020) |
| Fixtures | `/mnt/lumina_share/lumina/tests/fixtures/recipe-formats/` (Verdant Reverie), synthetic Steez/Recursion/Pliny the Almost, Schwarzbier review artifacts | **Reuse** as parity and import fixtures after provenance check |
| Visual design | `admin/static/lumina/` (`tokens.css`, `components.css`, `forms.css`, `shell.css`), `admin/templates/recipe_print.html` | **Reuse tokens**, print layout, warning patterns |
| UI interaction | `admin/templates/recipes_chat.html` | **Not reusable** as an editor: no direct editing, inspector, or graph exists |
| LLM generation | `llm_generation.py`, `mutations.py` | **Do not copy**; Carboy's proposal/validate/review flow is stricter |

Not present in Lumina: an ingredient catalog (properties are embedded per
recipe), recipe revisions, a process graph, non-beer calculations, sake.

Lumina's model mixes legacy imperial fields (`weight_lb`, `batch_size_gal`,
°F) with additive typed `quantity` fields. The Lumina ⇄ Carboy mapping is a
Phase 2 deliverable, not a Phase 11 afterthought.

## brewconvert

MIT, roughly 3k+ lines of Python (`src/brewconvert/`: `formats/`, `model/`,
`normalize.py`, `validation.py`, `diagnostics.py`, `report.py`, `profiles.py`),
with tests in `tests/` and fixtures in `tests/fixtures/`. Lumina already
delegates BeerXML read/write and conversion diagnostics to it.

Reuse intent: **port** BeerXML import/export and the
`Diagnostic`/`ConversionReport` model into `packages/recipe-format`, using
brewconvert's tests and fixtures as the reference oracle. brewconvert remains
the Python implementation used by Lumina; a shared fixture suite keeps both
in agreement (D-005). Size the port precisely in Phase 0.

## Phase 0 measurements (2026-10-11)

### brewconvert

5,671 lines of Python (the earlier "~3k" estimate was low), six formats.
Test suite: **137 passed** (`PYTHONPATH=src pytest`, Python 3.12; the 13
warnings are its own conversion-loss reports). 1,120 lines of tests, 10
fixture files.

| Part | Files (lines) | Needed for |
|---|---|---|
| Model | `model/recipe.py` 207, `model/units.py` 347, `model/semantics.py` 76 | Every format |
| Pipeline | `normalize.py` 500, `validation.py` 711, `report.py` 565, `diagnostics.py` 74, `formats/boundary.py` 348, `detect.py` 70, `profiles.py` 62 | Every format |
| BeerXML | `formats/beerxml/reader.py` 241, `writer.py` 199 | Desktop 1.0 |
| BeerJSON | reader 307, writer 178 | Candidate for 1.x (successor standard, JSON) |
| BeerSmith BSMX, Brewfather, BeerTools, ProMash | 299, 434, 404, 282 | Later, on demand |
| CLI, package entry | `cli.py` 129, `__init__.py` 108 | Not ported |

**Port sizing (ADR 0004):** a BeerXML-only TypeScript port is about **3,400
lines of Python** (model + pipeline + BeerXML), plus the 1,120 lines of tests
that become the shared fixture suite. The other five formats add about 1,900
lines later. brewconvert's report is already versioned JSON, so the
TypeScript and Python implementations can be compared report-to-report: a
good basis for the parity contract (D-005).

### brewpanel

Working tree has 35 files with uncommitted changes (+640/−112 lines).
Test suite against the working tree, in an isolated venv with the `dev`,
`tilt`, `ispindel`, `gui`, and `secrets` extras: **142 passed, 2 skipped,
1 failed**. The failure is environmental: `test_gui_smoke.py` launches the
`brewpanel` console script from brewpanel's own `.venv`, where the package is
not installed. README claims about tested behavior hold for the working tree.
Run without `pytest-asyncio`, 40 async tests fail spuriously, so always use the
`dev` extra.

### Fixture provenance

| Fixture | Location | Provenance | Reuse |
|---|---|---|---|
| Synthetic Steez, Recursion, Pliny the Almost | Lumina `tests/fixtures/recipe-formats/synthetic/`; copies in `codesamples/brewconvert/tests/fixtures/synthetic_*.xml` | Synthetic, written for testing (not copies of real recipes) | Yes. Consider neutral names in Carboy fixtures ("Pliny the Almost" echoes a commercial trademark) |
| Verdant Reverie round trip (6 files, checksummed) | Lumina `tests/fixtures/recipe-formats/verdant-reverie/` | Real application round trip (Grainfather, BeerSmith exports and reports) of a supplied recipe; README forbids modifying files | Yes: owner's recipe (confirmed 2026-10-11) |
| Ultimate Coffee Schwarzbier | Lumina `tests/fixtures/recipe-formats/Grainfather_Ultimate_Coffee_Schwarzbier_Final.xml` | Real Grainfather export of the owner's recipe (confirmed 2026-10-11) | Yes |
| brewconvert format samples (Gose BeerJSON, Brewfather, ProMash, BeerTools, BSMX, Domo) | `codesamples/brewconvert/tests/fixtures/` | Synthetic per brewconvert README; Domo before/after needs confirmation | Yes for synthetic ones |

## Lumina port map (2026-10-11)

Inspected at Lumina commit `096a83b`, `brains/recipes/`. Lumina was read,
not modified. Line counts: `stats_hooks.py` 261, `quantity.py` 365,
`beerxml_quantity.py` 124, `import_validation.py` 366, `water_chemistry.py` 258.

### Test baseline

Run in Lumina's own `runtime/venv` (Python 3.12, brewconvert installed at
Lumina's pinned commit `e0f9975a`, per `admin/requirements.txt`), with
bytecode and pytest cache disabled so nothing was written into Lumina:

| Test file | Result | Covers |
|---|---|---|
| `tests/test_lumina_hooks.py` | 26 passed | Every `stats_hooks.py` hook, pipeline order, beverage gating |
| `tests/test_recipe_quantity.py` | 22 passed, 3 subtests | `quantity.py` round trips, conversion, divergence |
| `tests/test_recipe_water_chemistry.py` | 12 passed | `water_chemistry.py` |
| `tests/test_recipe_import_review.py` | 16 passed | `import_validation.py` rules end to end (Steez, Recursion, Pliny fixtures) |
| `tests/test_recipe_beerxml_import.py` | 35 passed | Import mapping, `resolve_ambiguous_amount_kind`, boil-volume and salt-merge rules on Verdant Reverie |
| `tests/test_recipe_builder_operational_proof.py` | 40 passed | Stats through the web service, including ABV |

**brewconvert version skew.** The same files against the local codesamples
`master` (`0b5e05d`) fail 40 tests (`'Diagnostic' object has no attribute
'ingredient'`): brewconvert's `Diagnostic` changed after Lumina's pin. The
pinned commit `e0f9975a` is not in the local codesamples clone. Carboy's
BeerXML port must name the brewconvert revision it treats as the oracle,
and the Lumina parity run must use Lumina's pin, not `master`.

### `stats_hooks.py`: beer statistics

A pipeline of hooks run in fixed order
(`STANDARD_RECIPE_STATS_PIPELINE`), each reading `context.recipe` and
writing `context.computed[...]`. Inputs are Lumina's legacy imperial
fields, read through `quantity.resolve_amount()`.

| Hook (computed key) | Formula as implemented | Inputs → output | Source cited in Lumina | Published source to verify |
|---|---|---|---|---|
| `RecipeColorMcuHook` (`color.mcu`) | Σ(`weight_lb` × `color_lovibond`) ÷ `batch_size_gal` | lb, °L, US gal → MCU | None | Standard MCU definition; source to collect |
| `RecipeColorSrmHook` (`color.srm.morey`) | 1.4922 × MCU^0.6859 | MCU → SRM | None (name only: "Morey") | Morey equation; primary source to collect |
| `RecipeGravityPointsHook` (`gravity.points`) | Σ(`weight_lb` × `ppg` × efficiency); efficiency = per-item `efficiency`, else equipment `efficiency`, else 1.0. Sums `fermentables`, `sugar_sources`, `honey`, `fruit` | lb, ppg, fraction → gravity points | None | Extract-points method; source to collect |
| `RecipeGravityOgHook` (`gravity.og`) | 1 + (points ÷ `batch_size_gal`) ÷ 1000, **rounded to 3 places** | points, US gal → SG | None | As above |
| `RecipeFermentationFgHook` (`fermentation.fg`) | 1 + (OG − 1) × (1 − attenuation), rounded to 3 places; attenuation defaults to **0.75** when absent | SG, fraction → SG | None | Apparent-attenuation definition; source to collect |
| `RecipeFermentationAbvHook` (`fermentation.abv`) | (OG − FG) × 131.25, rounded to 1 place | SG, SG → % ABV | None | Common homebrew approximation; source to collect |
| `RecipeHopsIbuTinsethHook` (`hops.ibu.tinseth`, `hops.ibu.additions`) | Per hop: 1.65 × 0.000125^(G − 1) × (1 − e^(−0.04 × t)) ÷ 4.15 × g × α × 1000 ÷ L, where G = computed OG (default 1.050), t = `boil_time_min`, g = `weight_oz` × 28.3495, L = `batch_size_gal` × 3.78541. α > 1 is treated as a percentage and divided by 100 with a warning. Total and per-addition rounded to 1 place | oz, α, min, US gal, SG → IBU | None (name only: "Tinseth") | Glenn Tinseth's hop utilization model; confirm the primary publication and whether G should be boil gravity |

Gating: color and gravity hooks run only for beer-like, `gruit`, or untyped
recipes (`_supports_beer_stats`); IBU only for beer-like or untyped
(`_supports_ibu_stats`). OG, FG, and ABV hooks are not gated.

**Port notes: behavior Carboy must not copy blindly**

1. **Unknown becomes zero.** Missing `color_lovibond`, `ppg`, `alpha_acid`,
   `boil_time_min`, or amounts default to 0, so an incomplete recipe silently
   computes a low value. This breaks invariant 7. Carboy must report
   "cannot compute" with the missing input instead.
2. **Invented default attenuation.** 0.75 when the yeast states none. Carboy
   must treat FG as unknown, or use an explicitly provenanced assumption.
3. **Mid-pipeline rounding.** OG is rounded to 3 places before FG, ABV, and
   IBU use it. Parity fixtures must reproduce this rounding or document the
   difference. Carboy should round only for display (Phase 2 precision policy).
4. **Inexact constants.** 28.3495 g/oz and 3.78541 L/gal versus the exact
   28.349523125 and 3.785411784 that brewconvert uses. Parity tolerances must
   cover the difference.
5. **Efficiency applies to every gravity source**, including sugars, honey,
   and fruit, with a default of 1.0 when nothing is configured.
6. **Tinseth gravity.** Lumina uses the computed OG (or 1.050) and batch
   volume. Whether the published model calls for boil gravity and
   post-boil volume needs confirmation from the primary source before Carboy
   ports it.
7. Only boil additions feed IBU. Non-boil additions are kept as import
   evidence (`source_import["excluded_hop_additions"]`).

### `quantity.py`: typed quantities

| Symbol | What it does | Tests |
|---|---|---|
| `DIMENSIONS` | `mass`, `volume`, `count`, `duration`, `temperature`. Gravity, pressure, and concentration are deliberately excluded (statistics and water are modeled separately) | `test_recipe_quantity.py` |
| `TemperatureQuantity` | Decimal value + `degF`/`degC`; SI value in °C via (F − 32) × 5/9; unknown unit sets `status` to `ambiguous` | same |
| `DurationQuantity` | Decimal value + `sec`/`min`/`hr`/`day`; SI value in seconds by exact integer factors; negative values are invalid | same |
| mass/volume/count | Delegated to `brewconvert.model.units.Quantity` (exact factors: lb = 0.45359237 kg, oz = 0.028349523125 kg, US gal = 3.785411784 L, ...) | same |
| `quantity_to_json` / `quantity_from_json` | Stored shape: `value` (decimal string), `unit`, `dimension`, `normalized_value`/`normalized_unit` (derived, not authoritative), `status` (`explicit`/`inferred`/`ambiguous`), `source_field`, `original_display`, `provenance` {`origin`, `source_filename`, `source_format`, `adapter_profile`, `resolution`} | `test_recipe_quantity.py`, `test_recipe_export.py`, `test_recipe_water_chemistry.py` |
| `resolve_amount` | Single read path: typed quantity converted to the legacy unit when usable, else the legacy field unchanged | `test_recipe_quantity.py` |
| `set_amount_with_quantity`, `set_process_quantity` | Single write paths: typed quantity plus legacy projection. Recipe-level quantities live in `recipe["process"]["quantities"][name]` | first: `test_recipe_quantity.py`; `set_process_quantity`: **no direct test** |
| `find_quantity_divergence` | Detects a legacy field that drifted from its typed quantity (tolerance 1e-6) | `test_recipe_quantity.py` |
| `build_quantity_from_parsed` | Builds a quantity from chat-parsed (value, unit) | `test_recipe_quantity.py` |
| `PROCESS_STAGES` | `mash`, `sparge`, `first_wort`, `boil`, `flameout`, `whirlpool`, `chilling`, `fermentation`, `conditioning`, `dry_hop`, `stabilization`, `packaging` | via import tests |

**Port intent.** Carboy ports the model, not the dual-field mechanism: a
Carboy revision has typed quantities only, so `resolve_amount`,
`set_amount_with_quantity`, and `find_quantity_divergence` belong in the
Lumina ⇄ Carboy mapping (Phase 2), not in Recipe Core. Unit tokens differ
between Lumina (`degF`, `sec`, `hr`) and brewconvert (`F`, `s`, `h`); the
schema draft picks one vocabulary ([RECIPE_SCHEMA.md](RECIPE_SCHEMA.md#5-typed-quantities)).

### `beerxml_quantity.py`: ambiguous BeerXML amounts

| Symbol | What it does | Tests |
|---|---|---|
| `canonical_quantity` | Builds the imported-amount record: kind (`mass`, `liquid_volume`, `count`, `package`, `tablet`, `teaspoon`, `tablespoon`, `package_equivalent`), phase, timing, confidence (`confirmed`/`estimated`/`ambiguous`), validation status, original and display values | **No direct test** |
| `resolve_ambiguous_amount_kind` | A count word in `DISPLAY_AMOUNT` ("1 tablet", "0.14 pkg") overrides BeerXML's weight/volume flag, with confidence `estimated` | `test_recipe_beerxml_import.py` |

Port to Recipe Format's BeerXML reader (Phase 4), not Recipe Core.

### `import_validation.py`: import rules

Severity is `info`/`warning`/`blocking`. Blocking never stops parsing or the
preview; it only blocks committing the import until resolved or
acknowledged. Resolutions: `preserve`, `manual`, `reinterpret`,
`retain_both`, `unresolved`.

| Function (code) | Rule | Severity | Tests (fixture) |
|---|---|---|---|
| `import_warnings_from_report` | Maps brewconvert `Diagnostic` codes to severities: 9 blocking codes, 7 warning codes, everything else `info` | per code | `test_recipe_import_review.py` (indirect) |
| `check_implausible_volume_ratio` (`boil-volume-implausible`) | boil ÷ batch outside [0.5, 2.5] | blocking | `test_recipe_import_review.py` (Steez), `test_recipe_beerxml_import.py` |
| `check_notes_vs_calculated_ibu` (`notes-vs-calculated-ibu`) | IBU stated in notes (regex: "~38 IBU", "90-95 IBU") versus calculated; ratio outside [0.6, 1.6] | warning | `test_recipe_import_review.py` (Steez, Pliny) |
| `check_boil_vs_whirlpool_ambiguity` (`boil-vs-whirlpool-ambiguity`) | Notes mention an N-minute whirlpool and a hop is labeled an N-minute boil addition; evidence carries IBU under both readings (whirlpool approximated as t = 0) | blocking | `test_recipe_import_review.py` (Steez) |
| `check_mash_sparge_salt_merge` (`mash-sparge-salt-merge`) | Salt phases in the source differ from the mapped water treatments | blocking | `test_recipe_beerxml_import.py` (Verdant Reverie) |
| `check_ro_target_vs_salts` (`ro-target-vs-salts`) | Wraps `water_chemistry.check_target_consistency` | warning if volume missing, else blocking | via water chemistry |
| `run_import_validation` | brewconvert diagnostics first, then the Lumina rules in the order above | — | `test_recipe_import_review.py` |

Thresholds (0.5–2.5, 0.6–1.6, the whirlpool t = 0 approximation) are
Lumina heuristics with no cited source. Carboy should carry them as named,
versioned rule parameters, not as facts. The thresholds and the ion-to-ion
tolerance below are candidates for owner review.

### `water_chemistry.py`: salt ion contributions

Consistency checking only; no mash pH or Kolbach prediction.

| Symbol | What it does | Tests |
|---|---|---|
| `_ATOMIC_WEIGHTS`, `_formula_mass` | Ca 40.078, Mg 24.305, Na 22.990, S 32.06, O 15.999, H 1.008, C 12.011, Cl 35.453 g/mol. These match IUPAC/CIAAW abridged standard atomic weights (edition to cite in Phase 2) | `test_recipe_water_chemistry.py` |
| `SALT_FORMS`, `SaltForm.ppm_per_gram_per_liter` | Seven forms (gypsum CaSO₄·2H₂O, CaCl₂·2H₂O, CaCl₂, Epsom MgSO₄·7H₂O, NaHCO₃, CaCO₃, NaCl). ppm per g/L = 1000 × ion-group mass ÷ molar mass, derived from formulas | same |
| `resolve_salt_form` | Substring match on names, explicit hydration markers first. A generic "calcium chloride" resolves to the dihydrate and reports `form_was_assumed` | same |
| `predict_ion_contribution_ppm` | Σ grams ÷ total litres × ppm-per-g/L per ion; returns `None` when volume is missing or non-positive | same |
| `check_target_consistency` | Compares stated chloride/sulfate ppm and Cl:SO₄ ratio to the prediction; flags differences over 25 % | same |

**Port intent.** Port as is. The chemistry is derived from formulas, so
its only external source is the atomic-weight table. The 25 % tolerance is
a Lumina choice. The salt-name aliases belong in the ingredient catalog
(D-009), not in Recipe Core.

## brewpanel / Pacific BrewIO

Per its README: SQLite persistence with versioned migrations, keyring-backed
secret storage with redaction, a `SafetyGate` with `@requires_confirmation`,
`DeviceManager`, discovery service, NiceGUI GUI, and three working drivers
(simulator, Tilt BLE, iSpindel HTTP receiver). Six drivers (Grainfather, RAPT,
Plaato, Inkbird, BrewPiLess, Brewblox) plus Nespresso are stubs. The BrewIO
extraction (`docs/pacific-brewio-architecture.md`) is a plan, not an
implementation.

Notes:

- The local working tree has substantial uncommitted changes; GitHub
  `master` may not reflect current state. Phase 0 must inspect the local tree.
- `docs/hardware_internal/` is git-ignored, unreviewed research. Carboy must
  not depend on or copy it; only `docs/hardware/` is public.
- README claims (tests, verified behavior) have not been re-run for this
  baseline.

Reuse intent: **use as the BrewIO host** behind a versioned protocol
([ADR 0005](adr/0005-brewio-host-protocol.md)). Carboy does not reimplement
drivers.

## Other relevant systems

- **Pacific Brewing Supplies**: Drupal catalog and STAR inventory/order system
  (`/var/www/star`). Actual deployed contracts must be inspected before the
  shop connector is designed (Phase 11). Do not invent endpoints.
- **Lumina** consumes STAR via `star_recipe_bridge.py`; that bridge is a
  reference for recipe-to-shop mapping, not a contract Carboy depends on.
