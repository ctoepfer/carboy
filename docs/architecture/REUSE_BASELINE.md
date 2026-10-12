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
