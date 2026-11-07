# Example Beer Recipes

- Status: **Reference document.** Every recipe here is an **unbrewed example**.
- Revision 1 — November 5, 2026

Six standalone example styles, each with dry-malt-extract and all-grain variants. These are newly formulated, unbrewed examples for documentation and later import. They are not schema-valid Carboy import files. No original-sheet preservation or application changes are required.

## What these figures are

**Every OG, FG, ABV, IBU, and SRM figure in this document is an external reference estimate.** They were calculated outside Carboy from the stated assumptions, and Carboy did not produce or validate them.

Under the formula gate ([D-006](../ROADMAP.md#accepted-decisions), [FORMULA_COVERAGE](../architecture/FORMULA_COVERAGE.md)), a statistic is enabled only when its formula has an accepted source and its fixtures pass:

| Figure here | Method named here | In Carboy today |
|---|---|---|
| OG | Points per pound per gallon, with the stated efficiencies | Not this method. Carboy's enabled OG uses mass-based extract, with different inputs, so it needn't match. The points method is a parity reference only |
| FG | Stated apparent attenuation | **Not enabled.** An estimate from attenuation is approved (FQ6) but not implemented |
| ABV | (OG − FG) × 131.25 | **Not enabled** (parity reference only) |
| IBU | Tinseth | **Not enabled** (parity reference only) |
| SRM | Morey | **Not enabled** (parity reference only). MCU is enabled, and it isn't SRM |

So these figures are not test fixtures, performance benchmarks, or brewing results, and importing one of these recipes later must not imply that Carboy calculated or confirmed them. Status stays **unbrewed example** until a batch says otherwise.

## Shared brewing assumptions

- Batch volume: **5.00 US gal / 18.93 L into the fermenter**. Chilled kettle volume: **5.25 gal / 19.87 L**, allowing 0.25 gal / 0.95 L kettle loss. Packaged yield will be lower.
- Pre-boil volume: **6.50 gal / 24.61 L**; 60-minute full-volume boil. The assumed 1.25 gal reduction is an equipment-dependent planning allowance; adjust starting water to your measured boil-off and thermal contraction.
- All-grain brewhouse efficiency: **70% into the fermenter**, equivalent to 73.5% kettle recovery before the stated 0.25 gal uniform wort loss. Grain calculations account for that loss; sugar and DME are treated as fully soluble additions before kettle losses.
- Extract: DME potential **44 points per pound per US gallon**; actual product data takes precedence. Steeped specialty grain recovery: **50% of listed laboratory potential**. This is an estimate, not an all-grain efficiency setting.
- Full extract charge is present at the beginning of the boil. Late extract additions or a concentrated boil require bitterness recalculation.
- OG is calculated from ingredient potentials and chilled kettle volume. FG uses the stated whole-recipe apparent attenuation assumption; it is an estimate, not a yeast guarantee. ABV = (OG − FG) × 131.25.
- IBU: Tinseth, pellet hops, no pellet bonus, average boil gravity estimated at 5.875 gal with the full fermentable charge; the Dubbel estimate conservatively treats late-added syrup as present throughout; post-flameout bitterness is not modeled. Hop weights assume the stated alpha acids. For a different lot, weight × stated AA / actual AA is a first approximation.
- Color: Morey estimate from ingredient color and chilled kettle volume. Extract and candi-syrup colors are particularly product dependent; these estimates need recalculation with actual catalog data.
- Water targets below are illustrative all-grain **mash-water ion targets in ppm**, not salt doses. Use dechlorinated water. Aim for mash pH **5.2–5.5 measured on a cooled sample**; dark grists may need alkalinity rather than acid. Do not blindly apply all-grain salt additions to extract: extract already contains minerals. RO or low-mineral water is a useful extract baseline.
- Standard all-grain mash: 60 minutes at the listed temperature, about 1.5 qt/lb (3.1 L/kg), then drain and sparge as needed to collect the stated pre-boil volume. Include sugar only during the boil, not in mash weight. Adjust strike water for grain absorption and equipment losses.
- Extract method: crush and bag the listed specialty grains; steep at **155°F / 68°C for 30 minutes** in 1–2 gal water. Lift and drain, optionally rinse with warm water. Add water, remove heat, dissolve DME thoroughly, restore heat and start the 60-minute boil. Wheat recipe has no steeping grains. These extract versions require no partial mash.
- Chill, transfer, aerate wort before pitching, and ferment using each schedule. Sanitize all cold-side equipment. Pitch quantities are starting recommendations; follow current yeast-label guidance for gravity and temperature.
- Package only after gravity is stable for at least 2–3 days and fermentation is complete. Calculate priming sugar from actual packaged volume, residual CO₂ and target carbonation. Use containers rated for the target pressure, especially the wheat beer.
- Metric conversions: 1 lb = 453.592 g; 1 oz = 28.3495 g. Small conversion rounding is for display only.

## Recipe overview

External reference estimates ([what these figures are](#what-these-figures-are)), not Carboy results.

| Style | Variant | OG | FG | ABV | IBU | SRM |
| --- | --- | --- | --- | --- | --- | --- |
| American Pale Ale | Dry extract | 1.056 | 1.012 | 5.7% | 31 | 6 |
| American Pale Ale | All grain | 1.057 | 1.012 | 5.8% | 31 | 6 |
| Irish Red Ale | Dry extract | 1.048 | 1.012 | 4.8% | 21 | 10 |
| Irish Red Ale | All grain | 1.048 | 1.012 | 4.8% | 21 | 11 |
| Dry Irish Stout | Dry extract | 1.042 | 1.009 | 4.3% | 28 | 31 |
| Dry Irish Stout | All grain | 1.044 | 1.010 | 4.5% | 27 | 31 |
| Hefeweizen | Dry extract | 1.052 | 1.012 | 5.3% | 13 | 4 |
| Hefeweizen | All grain | 1.053 | 1.012 | 5.3% | 13 | 4 |
| Märzen | Dry extract | 1.059 | 1.014 | 5.9% | 21 | 8 |
| Märzen | All grain | 1.060 | 1.014 | 6.0% | 21 | 9 |
| Belgian Dubbel | Dry extract | 1.067 | 1.012 | 7.2% | 19 | 17 |
| Belgian Dubbel | All grain | 1.069 | 1.012 | 7.4% | 19 | 17 |

## American Pale Ale

Family ID: `carboy-example-american-pale-ale`. BJCP 2021 style: **18B**. Status: **unbrewed example**.

Restrained crystal malt and layered Cascade additions provide a classic citrus-forward pale ale.

### Dry extract variant

Variant ID: `carboy-example-american-pale-ale-dme`. Revision: 1.

| Fermentable | lb | g | Potential (ppg) | Color (°L assumption) | Treatment |
| --- | --- | --- | --- | --- | --- |
| Light DME | 6.5 | 2948 | 44 | 3 | Dissolve before boil |
| Crystal 40L | 0.5 | 227 | 34 | 40 | Steep 30 min |

Estimated OG **1.056**, FG **1.012**, ABV **5.7%**, IBU **31**, color **6 SRM**. Assumed apparent attenuation: **78%**.

### All grain variant

Variant ID: `carboy-example-american-pale-ale-all-grain`. Revision: 1.

| Fermentable | lb | g | Potential (ppg) | Color (°L assumption) | Treatment |
| --- | --- | --- | --- | --- | --- |
| American two-row pale malt | 10.5 | 4763 | 37 | 2 | Mash 60 min |
| Crystal 40L | 0.5 | 227 | 34 | 40 | Mash 60 min |

Estimated OG **1.057**, FG **1.012**, ABV **5.8%**, IBU **31**, color **6 SRM**. Assumed apparent attenuation: **78%**.

Mash at **152°F / 66.7°C for 60 minutes**.

### Hops and finishing — both variants

| Hop | Assumed AA | oz | g | Addition |
| --- | --- | --- | --- | --- |
| Cascade | 6% | 0.9 | 25.5 | 60 min before end of boil |
| Cascade | 6% | 1 | 28.3 | 15 min before end of boil |
| Cascade | 6% | 1 | 28.3 | 5 min before end of boil |

Dry hop: Cascade: 1 oz (28 g), 3 days near the end of fermentation. Add gently with minimal oxygen exposure. Confirm stable gravity after dry hopping before packaging.

Yeast: **SafAle US-05: one 11.5 g packet**.

Fermentation: Pitch at 64°F (18°C); hold 64–67°F (18–19°C), then allow 68–70°F (20–21°C) to finish.

Carbonation target: **2.4 volumes CO₂**.

Illustrative all-grain water target (ppm): Ca 50–80; sulfate 100–150; chloride 50–70. Apply the shared pH guidance.

## Irish Red Ale

Family ID: `carboy-example-irish-red-ale`. BJCP 2021 style: **15A**. Status: **unbrewed example**.

A small roasted-barley addition supplies a dry finish and red-brown hue without excessive caramel sweetness.

### Dry extract variant

Variant ID: `carboy-example-irish-red-ale-dme`. Revision: 1.

| Fermentable | lb | g | Potential (ppg) | Color (°L assumption) | Treatment |
| --- | --- | --- | --- | --- | --- |
| Light DME | 5.5 | 2495 | 44 | 3 | Dissolve before boil |
| Crystal 60L | 0.5 | 227 | 34 | 60 | Steep 30 min |
| Roasted barley, 300L | 0.125 | 57 | 25 | 300 | Steep 30 min |

Estimated OG **1.048**, FG **1.012**, ABV **4.8%**, IBU **21**, color **10 SRM**. Assumed apparent attenuation: **76%**.

### All grain variant

Variant ID: `carboy-example-irish-red-ale-all-grain`. Revision: 1.

| Fermentable | lb | g | Potential (ppg) | Color (°L assumption) | Treatment |
| --- | --- | --- | --- | --- | --- |
| British pale ale malt | 8.75 | 3969 | 37 | 3 | Mash 60 min |
| Crystal 60L | 0.5 | 227 | 34 | 60 | Mash 60 min |
| Roasted barley, 300L | 0.125 | 57 | 25 | 300 | Mash 60 min |

Estimated OG **1.048**, FG **1.012**, ABV **4.8%**, IBU **21**, color **11 SRM**. Assumed apparent attenuation: **76%**.

Mash at **153°F / 67.2°C for 60 minutes**.

### Hops and finishing — both variants

| Hop | Assumed AA | oz | g | Addition |
| --- | --- | --- | --- | --- |
| East Kent Goldings | 5% | 1.2 | 34.0 | 60 min before end of boil |

Yeast: **SafAle S-04: one 11.5 g packet**.

Fermentation: Pitch at 64°F (18°C); hold 64–67°F (18–19°C), then allow 68°F (20°C) to finish.

Carbonation target: **2.1 volumes CO₂**.

Illustrative all-grain water target (ppm): Ca 50–70; sulfate 40–60; chloride 60–80. Apply the shared pH guidance.

## Dry Irish Stout

Family ID: `carboy-example-irish-stout`. BJCP 2021 style: **15B**. Status: **unbrewed example**.

Roasted barley leads the flavor. The all-grain version includes mashed flaked barley; the DME version omits it to remain a true extract-and-steep recipe. Mouthfeel will differ slightly.

### Dry extract variant

Variant ID: `carboy-example-irish-stout-dme`. Revision: 1.

| Fermentable | lb | g | Potential (ppg) | Color (°L assumption) | Treatment |
| --- | --- | --- | --- | --- | --- |
| Light DME | 4.75 | 2155 | 44 | 3 | Dissolve before boil |
| Roasted barley, 500L | 0.75 | 340 | 25 | 500 | Steep 30 min |
| Chocolate malt, 350L | 0.125 | 57 | 28 | 350 | Steep 30 min |

Estimated OG **1.042**, FG **1.009**, ABV **4.3%**, IBU **28**, color **31 SRM**. Assumed apparent attenuation: **78%**.

### All grain variant

Variant ID: `carboy-example-irish-stout-all-grain`. Revision: 1.

| Fermentable | lb | g | Potential (ppg) | Color (°L assumption) | Treatment |
| --- | --- | --- | --- | --- | --- |
| British pale ale malt | 6.5 | 2948 | 37 | 3 | Mash 60 min |
| Flaked barley | 1.5 | 680 | 32 | 2 | Mash 60 min |
| Roasted barley, 500L | 0.75 | 340 | 25 | 500 | Mash 60 min |
| Chocolate malt, 350L | 0.125 | 57 | 28 | 350 | Mash 60 min |

Estimated OG **1.044**, FG **1.010**, ABV **4.5%**, IBU **27**, color **31 SRM**. Assumed apparent attenuation: **78%**.

Mash at **150°F / 65.6°C for 60 minutes**.

### Hops and finishing — both variants

| Hop | Assumed AA | oz | g | Addition |
| --- | --- | --- | --- | --- |
| East Kent Goldings | 5% | 1.5 | 42.5 | 60 min before end of boil |

Yeast: **SafAle US-05: one 11.5 g packet**.

Fermentation: Pitch at 65°F (18°C); hold 65–68°F (18–20°C), then allow 70°F (21°C) to finish.

Carbonation target: **1.9 volumes CO₂**.

Illustrative all-grain water target (ppm): Ca 50–80; sulfate 50–80; chloride 60–90. Apply the shared pH guidance.

## Hefeweizen

Family ID: `carboy-example-hefeweizen`. BJCP 2021 style: **10A**. Status: **unbrewed example**.

A German wheat-beer yeast supplies banana and clove character. An American wheat yeast would produce a different beer. All-grain: add 0.25 lb rinsed rice hulls as a nonfermentable lautering aid.

### Dry extract variant

Variant ID: `carboy-example-hefeweizen-dme`. Revision: 1.

| Fermentable | lb | g | Potential (ppg) | Color (°L assumption) | Treatment |
| --- | --- | --- | --- | --- | --- |
| Wheat DME (assume 65% wheat / 35% barley) | 6.25 | 2835 | 44 | 3 | Dissolve before boil |

Estimated OG **1.052**, FG **1.012**, ABV **5.3%**, IBU **13**, color **4 SRM**. Assumed apparent attenuation: **77%**.

### All grain variant

Variant ID: `carboy-example-hefeweizen-all-grain`. Revision: 1.

| Fermentable | lb | g | Potential (ppg) | Color (°L assumption) | Treatment |
| --- | --- | --- | --- | --- | --- |
| Wheat malt | 6 | 2722 | 38 | 2 | Mash 60 min |
| Pilsner malt | 4 | 1814 | 37 | 1.7 | Mash 60 min |

Estimated OG **1.053**, FG **1.012**, ABV **5.3%**, IBU **13**, color **4 SRM**. Assumed apparent attenuation: **77%**.

Mash at **152°F / 66.7°C for 60 minutes**.

### Hops and finishing — both variants

| Hop | Assumed AA | oz | g | Addition |
| --- | --- | --- | --- | --- |
| Hallertau Mittelfrüh | 4% | 1 | 28.3 | 60 min before end of boil |

Yeast: **LalBrew Munich Classic: one 11 g packet**.

Fermentation: Pitch at 64°F (18°C); hold 64–68°F (18–20°C). Use generous fermenter headspace. Package fresh without extended cold conditioning.

Carbonation target: **2.8 volumes CO₂**.

Illustrative all-grain water target (ppm): Ca 40–60; sulfate 30–50; chloride 50–70. Apply the shared pH guidance.

## Märzen

Family ID: `carboy-example-marzen`. BJCP 2021 style: **6A**. Status: **unbrewed example**.

Munich and Vienna character replace a crystal-heavy approach. The DME version approximates the all-grain malt profile; verify the product composition and color before brewing. If Munich DME is unavailable, reformulate rather than substituting light DME directly.

### Dry extract variant

Variant ID: `carboy-example-marzen-dme`. Revision: 1.

| Fermentable | lb | g | Potential (ppg) | Color (°L assumption) | Treatment |
| --- | --- | --- | --- | --- | --- |
| Munich DME (assume 50% Munich / 50% pale malt) | 7 | 3175 | 44 | 8 | Dissolve before boil |
| Caramunich I, 35L | 0.25 | 113 | 34 | 35 | Steep 30 min |

Estimated OG **1.059**, FG **1.014**, ABV **5.9%**, IBU **21**, color **8 SRM**. Assumed apparent attenuation: **76%**.

### All grain variant

Variant ID: `carboy-example-marzen-all-grain`. Revision: 1.

| Fermentable | lb | g | Potential (ppg) | Color (°L assumption) | Treatment |
| --- | --- | --- | --- | --- | --- |
| Munich I malt | 6.5 | 2948 | 35 | 7 | Mash 60 min |
| Vienna malt | 3.5 | 1588 | 36 | 4 | Mash 60 min |
| Pilsner malt | 1.75 | 794 | 37 | 1.7 | Mash 60 min |
| Caramunich I, 35L | 0.25 | 113 | 34 | 35 | Mash 60 min |

Estimated OG **1.060**, FG **1.014**, ABV **6.0%**, IBU **21**, color **9 SRM**. Assumed apparent attenuation: **76%**.

Mash at **152°F / 66.7°C for 60 minutes**.

### Hops and finishing — both variants

| Hop | Assumed AA | oz | g | Addition |
| --- | --- | --- | --- | --- |
| Hallertau Mittelfrüh | 4% | 1.5 | 42.5 | 60 min before end of boil |
| Hallertau Mittelfrüh | 4% | 0.5 | 14.2 | 10 min before end of boil |

Yeast: **SafLager W-34/70: two 11.5 g packets**.

Fermentation: Pitch at 50°F (10°C); hold 50–54°F (10–12°C). When within roughly 2–5 gravity points of expected FG, raise to 60–64°F (16–18°C) for 2–3 days and until fermentation is complete. Cool gradually and lager at 34–38°F (1–3°C) for 4–6 weeks.

Carbonation target: **2.5 volumes CO₂**.

Illustrative all-grain water target (ppm): Ca 40–60; sulfate 30–50; chloride 60–80. Apply the shared pH guidance.

## Belgian Dubbel

Family ID: `carboy-example-belgian-dubbel`. BJCP 2021 style: **26B**. Status: **unbrewed example**.

Dark candi syrup supplies fermentable sugar and dark-fruit character; modest specialty malt supports it without making a heavy, syrupy beer. Add the syrup with 10 minutes left in the boil, stirring to avoid scorching.

### Dry extract variant

Variant ID: `carboy-example-belgian-dubbel-dme`. Revision: 1.

| Fermentable | lb | g | Potential (ppg) | Color (°L assumption) | Treatment |
| --- | --- | --- | --- | --- | --- |
| Light DME | 7 | 3175 | 44 | 3 | Dissolve before boil |
| Special B, 180L | 0.25 | 113 | 30 | 180 | Steep 30 min |
| Caramunich II, 45L | 0.5 | 227 | 34 | 45 | Steep 30 min |
| Dark Belgian candi syrup, 90 SRM | 1 | 454 | 32 | 90 | Boil, 10 min remaining |

Estimated OG **1.067**, FG **1.012**, ABV **7.2%**, IBU **19**, color **17 SRM**. Assumed apparent attenuation: **82%**.

### All grain variant

Variant ID: `carboy-example-belgian-dubbel-all-grain`. Revision: 1.

| Fermentable | lb | g | Potential (ppg) | Color (°L assumption) | Treatment |
| --- | --- | --- | --- | --- | --- |
| Belgian Pilsner malt | 10.5 | 4763 | 37 | 1.7 | Mash 60 min |
| Munich I malt | 1 | 454 | 35 | 7 | Mash 60 min |
| Special B, 180L | 0.25 | 113 | 30 | 180 | Mash 60 min |
| Caramunich II, 45L | 0.5 | 227 | 34 | 45 | Mash 60 min |
| Dark Belgian candi syrup, 90 SRM | 1 | 454 | 32 | 90 | Boil, 10 min remaining |

Estimated OG **1.069**, FG **1.012**, ABV **7.4%**, IBU **19**, color **17 SRM**. Assumed apparent attenuation: **82%**.

Mash at **150°F / 65.6°C for 60 minutes**.

### Hops and finishing — both variants

| Hop | Assumed AA | oz | g | Addition |
| --- | --- | --- | --- | --- |
| Styrian Goldings | 5% | 1.3 | 36.9 | 60 min before end of boil |

Yeast: **LalBrew Abbaye: two 11 g packets**.

Fermentation: Pitch at 64–65°F (18°C); hold for the first 48 hours, then allow a gradual rise to 72–75°F (22–24°C). Wait for stable gravity; condition 3–6 weeks after fermentation.

Carbonation target: **2.6 volumes CO₂**.

Illustrative all-grain water target (ppm): Ca 40–60; sulfate 30–50; chloride 50–70. Apply the shared pH guidance.

## Later Carboy import notes

This document is the editable recipe specification. Defer schema mapping and import files until Carboy supports them. No application implementation is requested here.

**Deferred until supported:** native import files, catalog seeding (D-009), and UI integration. None of these exists for this document yet, and none is implied by it.

- Keep the six family IDs and twelve variant IDs stable; use a separate revision value for recipe changes.
- These IDs identify the examples in this document. They are not recipe identifiers: an imported recipe gets a UUID `recipe_id`, and because they contain the codename they stay out of any field the software interprets ([NAMING.md](../architecture/NAMING.md) rule 2). Hold the link from a recipe to its example ID somewhere uninterpreted, such as a note or a sidecar.
- Map each variant to its own recipe, with a shared family relationship when supported. DME and all-grain versions approximate the same beer; they are not claimed to be sensory identical.
- Map ingredients, exact masses, hop AA, addition times, mash, fermentation, carbonation and equipment assumptions into the then-current native schema. Preserve useful notes when no structured field exists.
- Store calculated estimates separately from measured batch values. Recompute with Carboy's actual ingredient catalog and calculation engine; document differences instead of presenting these rounded figures as test fixtures. If a figure from this document is kept, it stays a stated value with its origin recorded, never a calculated or measured one.
- Preserve the 70% fermenter brewhouse efficiency, 5.25 gal chilled kettle volume and 0.25 gal kettle loss relationship when mapping equipment assumptions. Recalculate hop utilization across late sugar additions when supported.
- Replace assumed DME blend composition, color and yield with actual catalog products before final validation. Munich DME and wheat DME blends must remain explicit.
- Retain the status “unbrewed example.” Brewing results can support later revisions.

## Style references

BJCP 2021 style descriptions informed the intended beer character. Recipe numbers above are formulation estimates, not certification or claims of competition results.

- [American Pale Ale — 18B](https://www.bjcp.org/style/2021/18/18B/american-pale-ale/)
- [Irish Red Ale — 15A](https://www.bjcp.org/style/2021/15/15A/irish-red-ale/)
- [Irish Stout — 15B](https://www.bjcp.org/style/2021/15/15B/irish-stout/)
- [Weissbier — 10A](https://www.bjcp.org/style/2021/10/10A/weissbier/)
- [Märzen — 6A](https://www.bjcp.org/style/2021/6/6A/marzen/)
- [Belgian Dubbel — 26B](https://www.bjcp.org/style/2021/26/26B/belgian-dubbel/)
