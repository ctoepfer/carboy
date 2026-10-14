# Carboy — Beverage Scope

Status: Planning baseline, 2026-10-09. Launch staging below is **proposed**
(decision D-006, [ROADMAP.md](../ROADMAP.md#accepted-decisions)).
Every formula listed here must be sourced, implemented in Recipe Core, and
verified against independently checked fixtures before it is shown to users.

## Principle

All five beverages are first-class in the **data model** from the start:
ingredients, stages, schedules, measurements, and notes. **Calculations** are
enabled per beverage only when validated. Where a calculation is not
supported, the UI says so; it never falls back to beer math silently.

## Calculation domains

| Domain | Beer | Wine | Mead | Cider | Sake |
|---|---|---|---|---|---|
| Gravity ⇄ Brix conversion | ✓ | ✓ | ✓ | ✓ | measured only |
| Sugar contribution by source (grain extract, juice, honey, fruit, sugars) | ✓ grain/sugar | juice, sugar | honey, fruit | juice, sugar | not gravity-based |
| Predicted OG | ✓ | ✓ | ✓ | ✓ | ✗ (see below) |
| Predicted FG / attenuation | ✓ | estimate | estimate | estimate | ✗ |
| ABV from measured OG/FG | ✓ | ✓ | ✓ | ✓ | ✗ — not valid under parallel fermentation |
| Bitterness (IBU) | ✓ | — | — | — | — |
| Color (SRM/EBC) | ✓ | — | — | — | — |
| Volumes, losses, boil-off | ✓ | dilution/topping | dilution | dilution | water ratios |
| Water chemistry (ion contribution) | ✓ | — | — | — | water profile notes |
| Acid (TA) and adjustment | — | ✓ | optional | ✓ | measured acidity |
| Sulfite dosing by pH | — | ✓ | optional | ✓ | — |
| Yeast nutrients (YAN, staggered schedules) | — | ✓ | ✓ | ✓ | — |
| Stabilizing and backsweetening | — | ✓ | ✓ | ✓ | — |
| Blending / dilution (mass balance) | later | ✓ | ✓ | ✓ | later |
| Carbonation / priming | ✓ | sparkling later | ✓ | ✓ | — |
| Multi-stage additions schedule | mash/ferment steps | — | staggered nutrients | — | ✓ sandan shikomi |

Notes:

- **Sake** ferments by multiple parallel fermentation: koji converts rice
  starch while yeast ferments, so gravity readings do not describe available
  sugar and gravity-based ABV prediction is invalid. Sake support centers on
  rice polishing ratio, koji/rice/water ratios, starter (moto/shubo), the
  three-stage addition schedule with its rest day, temperature schedule, and
  measured outputs (sake meter value, acidity, ABV by measurement).
- **Wine** support must cover kits and fresh fruit/juice. Kits mostly need
  schedule tracking and measured gravity, not formulation math.
- **Mead** nutrient schedules depend on gravity, yeast nitrogen requirement,
  and volume; published schedules (for example TOSNA variants) must be cited
  and versioned, not paraphrased from memory.
- Sulfite and acid dosing affect drinkability and sensitive consumers; treat
  these as high-verification calculations with explicit units and bounds.

## Launch staging (D-006; CQ3/CQ4 decided 2026-10-13)

| Release | Beer | Wine | Mead | Cider | Sake |
|---|---|---|---|---|---|
| Desktop 1.0 | Full validated set | Shared fermentation math: Brix/SG, sugar sources, OG, ABV from measurements; **basic sulfite management** | Same, with honey/fruit; **foundational nutrient model with staggered additions** | Same, with juice; **basic sulfite management** | Recipe and schedule recording; ratios; no predicted gravity/ABV |
| 1.x | Mash pH estimate, branch/blend | Acid, nutrients, stabilization | Stabilization | Acid, nutrients | Ratio/schedule helpers validated with brewers |
| Later | — | Blending tools | Blending | Keeving and advanced methods | Further only with domain review |

**Owner decisions, 2026-10-13** (each statistic still gated per D-006 on a
cited source and passing fixtures):

- **CQ3, mead nutrients in 1.0:** the foundational nutrient model and its
  supported calculations, with staggered additions and measured versus
  estimated inputs. Cited methods only; must composition and yeast
  nutrient requirements are never assumed silently, and unsupported
  calculations say so.
- **CQ4, wine and cider sulfite in 1.0:** additions, measurements, and the
  relevant pH-dependent calculations, with provenance. Measured free SO₂ is
  kept distinct from estimates and targets and is never substituted for
  them (or they for it). Calculations and safety-related guidance are
  evidence-based and clearly limited.
- **CQ2, BeerJSON:** a 1.0 target if it passes independently tested import,
  export, and preservation requirements; not a release blocker (falls back
  to 1.1). Native format stability and BeerXML come first.

## Existing Lumina coverage (for reference)

Lumina's recipes brain calculates only beer-like and gruit statistics
(`_supports_beer_stats` in `brains/recipes/stats_hooks.py`): MCU/SRM, gravity,
OG, FG, ABV, Tinseth IBU, plus water-ion consistency checks in
`water_chemistry.py`. It recognizes `wine`, `mead`, `cider`, `soda`, `gruit`,
and `wash` types but has no non-beer calculations and no sake type. Wine, mead,
cider, and sake calculations in Carboy are new work.
