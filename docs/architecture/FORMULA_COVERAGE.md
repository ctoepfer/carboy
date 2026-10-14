# Formula Coverage

- Status: **Draft (Phase 0), 2026-10-12. Not implemented.** FQ1–FQ4 and
  D-006 decided 2026-10-12 (recommendations accepted).
- Feeds: the Phase 2 formula registry, the ingredient property table
  (RECIPE_SCHEMA §7.2), and the stage-kind table (§7.3).

For each calculation in [BEVERAGE_SCOPE.md](../product/BEVERAGE_SCOPE.md):
the candidate formula, how well its source is established, its inputs, and
the schema rows it needs. **No formula here is approved for users.** A
formula ships only when its source status is good enough (FQ1) and
independently checked fixtures pass (BEVERAGE_SCOPE).

## Source status

| Status | Meaning |
|---|---|
| **Primary checked** | The original publication was read, and the formula and its inputs match |
| **Secondary checked** | A published, citable secondary source was read (with page), and it cites a primary we have not read yet |
| **Secondary only (web)** | Only calculators, forums, or summaries were found. Not citable for release |
| **Needs source** | No source checked yet. The formula is a candidate only |

Checked on 2026-10-12. "Holle" means Holle (2003), *A Handbook of Basic Brewing Calculations*,
cited by chapter ([BIBLIOGRAPHY.md](../references/BIBLIOGRAPHY.md)). It is a
secondary source; the primary works it cites are named per row. Page-level
details still need checking against the printed book.

## Implemented in Recipe Core (2026-10-13)

The formula registry ([RECIPE_CORE.md §6](RECIPE_CORE.md#6-formula-registry))
holds these so far:

| Registry id | Status | Note |
|---|---|---|
| `color.mcu` v1 | **Enabled** | Holle ch. 1 (Daniels p. 59 via); °L inputs only |
| `extract.mass` v1 | **Enabled** | Holle ch. 1 (Kunze p. 266, Narziss II:313 via); extract mass in kg |
| `gravity.sg-plato` v1 | **Enabled** | **Primary checked**: NBS Circular C440 (1942) Tables 113–114, Plato's sucrose densities (1900); linear interpolation, 0–40 °P; [reference table](../../fixtures/reference-tables/README.md) |
| `gravity.og.mass-method` v2 | **Enabled** | Holle ch. 1 (Kunze, Narziss via) for extract = volume × density × °P/100, solved with Plato's densities; v1 was the registered-unavailable placeholder |
| `sulfite.so2-from-metabisulfite` v1 | **Enabled** (2026-10-14) | **Primary checked**: CIAAW atomic weights; factor 0.5763; SO₂ *released*, not resulting free SO₂; wine, cider, mead |
| `nutrient.yan-from-dap` v1 | **Enabled** (2026-10-14) | **Primary checked**: CIAAW atomic weights; factor 0.2121; YAN *added*, no requirement calculated; wine, cider, mead |
| `gravity.og.points-lumina` v1 | Parity reference | Opt-in only; matches Lumina on Verdant Reverie (points within 1e-9 relative; OG 1.064 at 3 places) |

**SG ↔ °P (2026-10-13).** The source is the tabulated data, not a fitted
equation: Plato's density measurements (Kaiserliche Normal-Eichungs-
Kommission, 1900) as tabulated by the US National Bureau of Standards
(Circular C440, 1942: Table 113 true density, Table 114 apparent SG at
20/20 °C), a public-domain primary reference. The table was rebuilt from the
scan and verified three ways: Table 114 recomputed from Table 113 by the
circular's own method matches the printed Table 114 exactly at 398 of 401
steps from 0 to 40 °P; the other three were read from the page images, two of
them **misprints in the 1942 table** (7.4 °P and 36.3 °P), corrected; and
second differences show no outliers. Published cubic fits were checked
against it and **not adopted**: the fit to the NBS table agrees within
±0.005 °P, but the widely quoted "ASBC" and web cubics drift above ~20 °P
(−0.03 °P at 30 °P, −0.11 °P at 40 °P), which matters for strong worts and
for wine and mead musts.

**What a °P value means (2026-10-14).** Three distinctions the formulas
and the interface keep, from NBS C440 itself where it speaks to them:

- **Sucrose-equivalent, not composition.** °Brix (and °Plato) is the
  percentage by weight of sucrose in a *pure* sucrose solution (C440,
  p. 248). A wort or must at "12 °P" has the density of a 12 % sucrose
  solution; its dissolved solids (maltose, dextrins, fructose, acids,
  minerals) are not 12 % by mass, and C440 notes that for impure sugar
  solutions density is a less reliable measure of total dissolved substance
  than refractive index (p. 254). Carboy labels these values as
  sucrose-equivalent and never presents them as composition.
- **Temperature conventions.** The table is apparent SG at 20 °C/20 °C
  (Table 114); Plato's densities are true densities at 20 °C (Table 113).
  Brix hydrometers were originally calibrated at 17.5 °C and most at 20 °C
  by 1942 (C440, p. 248); hydrometers sold to home brewers often state
  another standard temperature on the instrument. A reading must be
  referred to 20 °C/20 °C before conversion. C440's correction table for
  Brix hydrometers (Table 110) is for approximate results only; no
  temperature correction is enabled until a cited method is chosen.
- **Precision is not accuracy.** The table resolves SG to ±0.00001
  (about ±0.003 °P); results are rounded to that resolution. A measured
  gravity is only as accurate as the instrument, its reading, and its
  temperature correction, which are recorded with the measurement
  (provenance), not implied by the formula's digits.
- **Refractometers are a different measurement.** They read refractive
  index (sucrose-equivalent by RI). C440 reports that different sugars at
  equal concentration give approximately the same refractive index (p. 254,
  citing Tolman and Smith), but a refractometer reading is not an SG, and
  readings with alcohol present need a separate, cited correction (not yet
  sourced, FORMULA_COVERAGE "Beer" list).

**Mass-method OG, reviewed independently of Lumina (2026-10-14).** The
relation extract = cool volume × density × °P/100 is Holle's (ch. 1) with
Plato's true density in place of "water mass per volume × SG"; the two are
the same quantity at 20 °C. Brewhouse efficiency must be defined against
the same cool wort (Holle ch. 1, overall efficiency measured after the
boil); Narziss's 0.96 hot-volume factor is not applied because the input is
cool volume. Tests build extracts backwards from the definition for 8, 12,
25, 35, and 40 °P and recover each exactly with Table 114's SG; beyond
40 °P the result is unavailable. The formula is grain-mash only: wine,
mead, cider, and sake report unsupported.

## Beer

| Calculation | Candidate formula | Source status | Inputs | Property rows | Stage-kind rows |
|---|---|---|---|---|---|
| Malt color units (MCU) | Σ(mass × color) ÷ volume (lb, °L, US gal) | **Secondary checked**: Holle ch. 1, citing Daniels 1996 p. 59 | mass per addition; fermentable color; batch volume | fermentable `color` | mash (additions); target batch volume |
| Beer color, SRM | Morey: 1.4922 × MCU^0.6859 (Lumina `color.srm.morey`) | **Secondary only (web)**: calculators agree on the exponent form; some pages misprint it as a product. Primary (Morey) not found. Holle uses Daniels's lookup table instead | MCU | as MCU | — |
| SRM ↔ EBC | EBC = 1.97 × SRM | **Secondary checked**: Holle ch. 1 (also an older 2.65 form) | color | — | — |
| Lovibond ↔ SRM | Needs choice (often treated as equal for wort) | **Needs source**. RECIPE_SCHEMA §7.2 already requires this before Phase 2 | color | fermentable `color` unit | — |
| Extract / OG, points method | OG = 1 + Σ(mass × potential × efficiency) ÷ volume ÷ 1000 (Lumina `gravity.points`/`gravity.og`) | **Needs source** for the points form | mass; potential; efficiency; volume | fermentable/sugar `potential`; per-item efficiency? | target efficiency; batch volume |
| Extract / OG, mass method | extract mass = Σ(mass × extract fraction × (1 − moisture) × brewhouse efficiency); °P from extract mass ÷ wort mass | **Secondary checked**: Holle ch. 1, citing Kunze p. 266 and Narziss II:313 | mass; extract cg db; moisture; efficiency; volume | fermentable `extract_yield`, `moisture` | as above |
| SG ↔ °P | Plato's sucrose density table (NBS C440 Tables 113–114), linear interpolation, 0–40 °P | **Primary checked** (2026-10-13), implemented as `gravity.sg-plato`. The web cubic (°P = −616.868 + 1111.14·SG − 630.272·SG² + 135.997·SG³) and Holle's 4-points-per-°P rule are **not** used: the cubic drifts above ~20 °P, and Holle's rule is a stated approximation | gravity | — | — |
| FG from attenuation | FG = 1 + (OG − 1)(1 − apparent attenuation) | Definition is **secondary checked** (Holle ch. 9 defines ADF). **No default attenuation** (Lumina port note 2): unknown culture attenuation means FG "cannot compute" | OG; culture attenuation | culture `attenuation` | fermentation |
| Real extract / RDF | RDF ≈ 0.82 × ADF; RE = OE × (1 − RDF) | **Secondary checked**: Holle ch. 9 (factor 0.819) | OE; AE | — | — |
| ABV from OG/FG | (OG − FG) × 131.25 (Lumina) | **Needs source**. Holle gives only ABV ↔ ABW. A cited formula (for example one based on real extract) must be chosen | OG; FG (stated or measured) | — | — |
| IBU, Tinseth | per addition: 1.65 × 0.000125^(G − 1) × (1 − e^(−0.04 t)) ÷ 4.15 × mg α-acid ÷ L | **Secondary only (web)**: the original page (realbeer.com) has been retired. Secondary sources quote it as using the **average boil gravity**, not OG; Lumina uses OG or 1.050 (port note 6) | hop mass; alpha acid; boil minutes; gravity; volume | hop `alpha_acid`, `form` (pellet/whole) | boil (`before_end` timing; `first_wort`, `flameout` points) |
| IBU, definition | IBU ≈ mg iso-α-acid per L = mg hops × utilization × α ÷ L | **Secondary checked**: Holle ch. 7, citing Lewis 1995 | as above, plus utilization | hop `alpha_acid` | boil |
| Volumes: shrinkage, boil-off, losses | Cool = hot × ρ(T_hot)/ρ(20 °C); boil-off rate; loss flows | **Secondary checked**: Holle chs. 2 and 6 (citing Singh & Heldman p. 611 for the density basis) | volumes; temperatures; equipment rates | — | boil (duration, boil-off); `loss` flows |
| Grain absorption, sparge water | absorption × grist mass; sparge = total − mash water | **Secondary checked**: Holle ch. 2, citing Narziss II:157 | grist mass; equipment absorption | — | mash, sparge (water volumes) |
| Strike / infusion temperature | Holle ch. 5 (grain heat capacity 0.38–0.42) | **Secondary checked**: Holle, citing Bamforth 2002 pp. 103–104 | masses; temperatures; heat capacity | — | mash steps (temperature, infusion volume) |
| Decoction volume | Holle ch. 5 | **Secondary checked**, citing Narziss II:166 and Kunze pp. 196–199 | temperatures; mash volume | — | mash steps (decoction) |
| Water: ion contribution from salts | ion mass fraction × salt mass ÷ water volume, from atomic weights (Lumina `water_chemistry.py`) | **Secondary checked** for the method (Holle ch. 3). The atomic weights (IUPAC/CIAAW) still need their edition cited | salt mass; hydration form; water volume | water_agent `formula`/`hydration` | mash, sparge (salt additions) |
| Residual alkalinity | RA = alk − (Ca/3.5 + Mg/7), in mEq | **Secondary checked**: Holle ch. 3, citing Kolbach 1941/1953 (primary not read) | water ions | — | — (water profile) |
| Mash pH estimate | malt lab pH + 0.03 × RA (°dH) | **Secondary checked**: Holle ch. 3 (Kolbach 1953). Holle calls it crude | RA; malt congress pH | fermentable `di_ph` (congress mash pH) | mash |
| Carbonation: priming sugar | (target − residual CO₂) ÷ 0.46 ÷ fermentable fraction | **Secondary checked**: Holle ch. 9, citing Kunze p. 332 and Hough p. 115 | target CO₂; temperature; volume; sugar fermentability | sugar `fermentability` | packaging (priming addition) |
| Carbonation: forced (pressure) | vol ≈ 4.85(psig + 14.7)/(°F + 12.4) | **Secondary checked** as Holle's table footer; the fit's origin is not given | temperature; pressure | — | packaging / conditioning |

## Wine, mead, cider

| Calculation | Candidate | Source status | Inputs | Property rows | Stage-kind rows |
|---|---|---|---|---|---|
| Brix ↔ SG | Sucrose-solution table or fit (ICUMSA/ASBC) | **Needs source** | gravity | — | — |
| Sugar contribution (juice, honey, fruit, sugars) | Points or sugar mass per volume | **Needs source** and catalog data (D-009) | mass/volume; sugar content | `sugar_content` per kind | fermentation (additions) |
| OG prediction | From sugar sources and volume | **Needs source** | as above | as above | — |
| ABV from measured OG/FG | Same choice as beer, with a check of whether it is valid at wine strength | **Needs source** | OG; FG | — | — |
| Titratable acidity adjustment | Acid mass for a TA change | **Needs source** | volume; TA; acid | acid `acid_type` | stabilization / fermentation |
| Sulfite by pH | Free SO₂ needed for a target molecular SO₂ at a given pH | **Needs source** (high-verification; BEVERAGE_SCOPE) | pH; target molecular SO₂; volume; sulfite salt | `sulfite_fraction` | stabilization |
| YAN and staggered nutrients (TOSNA etc.) | Published schedule, versioned | **Needs source** (the schedule's own publication, by version) | YAN; gravity; volume; yeast nitrogen class | nutrient `yan_contribution`; culture `nitrogen_need` | fermentation (steps) |
| Stabilizing and backsweetening | Sorbate by ABV; sugar by target gravity | **Needs source** | ABV; volume | — | stabilization |
| Blending and dilution | Mass balance A·a + B·b = C·c | **Secondary checked**: Holle ch. 4 (by mass for gravity) | volumes; property | — | `blend`/`dilution` flows |

### Source review: mead nutrients (CQ3) and wine/cider sulfite (CQ4), 2026-10-13

Owner decisions CQ3 and CQ4 put a foundational nutrient model and basic
sulfite management into 1.0, with cited methods only. **Nothing below is
enabled yet**: each item states what is citable now and what must be read.
Web sources found during the search are listed at the end of this page as
leads, not citations.

**Sulfite (CQ4)**

| Calculation | Candidate | Source status | Needed before enabling |
|---|---|---|---|
| Molecular SO₂ from free SO₂ and pH | molecular = free ÷ (1 + 10^(pH − pK₁)), the bisulfite equilibrium | **Needs source** for pK₁. Usseglio-Tomasset & Bosia (1984) are reported to give pK₁ 1.78 at 19 °C in water and nearer 2.0 under wine conditions; calculators use 1.77 or 1.81. Read only via web articles | Read Usseglio-Tomasset & Bosia (1984) and a reviewed text (Boulton et al. 1996, *Principles and Practices of Winemaking*; or Ribéreau-Gayon et al., *Handbook of Enology* vol. 2). pK₁ becomes a **named, versioned assumption** (temperature and ethanol dependent), never a hidden constant |
| SO₂ released by potassium metabisulfite | K₂S₂O₅ → 2 SO₂: 128.116 ÷ 222.311 = 0.5763 of the salt's mass | **Primary checked** (CIAAW Abridged Standard Atomic Weights 2024) | **Enabled** as `sulfite.so2-from-metabisulfite` (2026-10-14) |
| Addition to reach a free SO₂ target | (target free − measured free) × volume ÷ 0.5763 | Arithmetic on the two rows above | Must say it is an **estimate**: part of any addition binds, so the resulting free SO₂ has to be measured, not assumed |
| Molecular SO₂ targets (≈0.8 mg/L white, ≈0.5 mg/L red) | Guidance values | Secondary (attributed to Jackson, *Wine Science*) | Read the cited text. Targets are **user-chosen**, shown with their source, never a silent default. Red wines: pigment-bound SO₂ makes molecular SO₂ unreliable from free SO₂ alone (reported); limit or flag |
| Cider: SO₂ by juice pH bands | Tabulated total SO₂ per pH band (Long Ashton tradition) | **Community** (cider.org.uk); primary (Beech & Carr; Lea) not read | Read Lea, *Craft Cider Making*, or Lea & Drilleau (2003); otherwise cider uses the molecular-SO₂ rows above |

**pK₁ in water, primary source found (2026-10-14).** Goldberg and Parker
(1985), *J. Res. Natl. Bur. Stand.* 90(5):341, a critical evaluation, select
K_A = 0.0139 ± 0.0004 mol kg⁻¹ at 25 °C for SO₂(aq) + H₂O ⇌ H⁺ + HSO₃⁻
(Huss and Eckert's data), with ΔH° = −17.80 ± 0.40 kJ mol⁻¹ and
ΔC_p = −272 ± 10 J mol⁻¹ K⁻¹. Their temperature equation gives pK₁ = 1.71
(10 °C), 1.76 (15 °C), **1.81 (20 °C)**, 1.86 (25 °C). The widely used "1.81"
is therefore the aqueous constant at 20 °C, for water at infinite
dilution. Wine's ethanol and ionic strength shift the effective constant
(reported, via secondary sources, as nearer 2.0; Usseglio-Tomasset and Bosia
1984, not read). **Molecular SO₂ stays unavailable** until a source for the
wine-condition constant is read; using the aqueous value for wine would be
an unsourced approximation (open question FQ5).

Rules that hold regardless: measured free SO₂ (with date and method) is
kept apart from estimates and targets and is never replaced by either;
pH and free SO₂ must be measured values for a molecular SO₂ result, or the
result is unavailable.

**Mead nutrients (CQ3)**

| Calculation | Candidate | Source status | Needed before enabling |
|---|---|---|---|
| Staggered additions | Additions with timing on the fermentation stage (RECIPE_SCHEMA §7.2) | **Schema, no formula needed** | Nothing: supported now as recipe data |
| YAN added by DAP | mass × 0.2121 (28.014 ÷ 132.056) | **Primary checked** (CIAAW 2024) | **Enabled** as `nutrient.yan-from-dap` (2026-10-14) |
| YAN added by other nutrients | mass × the product's stated nitrogen content | **Maker data**: a cited data-sheet property per product (catalog) | Data sheets; unknown content stays unknown |
| Total YAN added | Σ of the rows above | Arithmetic | None beyond its inputs |
| Must YAN | Measured value | **Measurement only**; honey musts are reported to be very low in YAN, but no value is assumed | — |
| YAN requirement / target | Bisson & Butzke (2000) are reported to recommend about 25 mg N/L per °Brix above a 21 °Brix baseline | **Secondary only**; later studies dispute high requirements; mead studies (Mendes-Ferreira et al. 2010; Pereira et al. 2015) show nitrogen needs depend on yeast and must | Read Bisson & Butzke (2000) and the mead studies. Until then a target is **user-entered guidance**, not a calculation |
| Sugar-break timing (e.g. ⅓ sugar break) | A gravity point between OG and expected FG | Community protocol (TOSNA) | Treated as a user-defined schedule; Carboy can show the gravity point once OG and FG are known, labelled with its source |

What 1.0 can therefore do without guessing: record staggered additions,
sum the YAN they add where each product's nitrogen content is cited, show
measured must YAN, and compare against a target the user chooses, with
"unavailable" wherever an input or source is missing.

## Sake

No predicted gravity or ABV (parallel fermentation; BEVERAGE_SCOPE).
Ratios (polishing, koji/rice/water) and the three-stage schedule are
recording helpers, **Needs source** with domain review, and need new stage
kinds (moto, the three additions with the rest day).

## Rows these formulas need

**Ingredient property table (RECIPE_SCHEMA §7.2), first rows.** Add a row
only when its formula's source is at least "secondary checked", or an
import format needs it:

| Kind | Property | Type | Read by | Status |
|---|---|---|---|---|
| fermentable | `color` | quantity, units `degL`/`SRM`/`EBC` | MCU | Ready (Holle) |
| fermentable | `extract_yield` | fraction (coarse grind, dry basis) | mass-method OG | Ready (Holle) |
| fermentable | `moisture` | fraction | mass-method OG | Ready (Holle) |
| fermentable, sugar | `potential` | SG (or points) | points-method OG | Blocked: representation and source (Q9 note) |
| fermentable | `di_ph` | pH | mash pH estimate | Ready (Holle), 1.x only |
| hop | `alpha_acid` | fraction | IBU | Needed by any IBU model |
| hop | `form` | enum `pellet`, `whole`, `extract` | IBU utilization | Needed by any table-based or corrected model |
| culture | `attenuation` | fraction (apparent) | FG | Ready (definition) |
| water_agent | `formula`, `hydration` | enum | ion contribution | Ready (method); atomic-weight edition to cite |
| sugar | `fermentability` | fraction | priming | Ready (Holle) |

**Stage-kind table (§7.3) parameters these need:** `mash` (water volume,
grist temperature; steps with temperature, duration, infusion volume and
temperature, or decoction); `sparge` (water volume, temperature); `boil`
(duration, boil-off rate or volume; points `first_wort`, `flameout`);
`fermentation` (temperature steps; point `dry_hop`); `packaging`
(carbonation target, temperature). Equipment snapshot: brewhouse efficiency,
grain absorption, boil-off, losses.

## Proposed D-006 staging

Keep BEVERAGE_SCOPE's staging, with one gate per statistic: **a statistic
is enabled in a release only when its formula's source status meets FQ1 and
its fixtures pass.** On today's evidence:

| Statistic | Desktop 1.0 if… |
|---|---|
| Beer MCU, EBC/SRM conversion, volumes, strike/infusion, salt ion contributions, priming | Ready to implement once FQ1 accepts Holle as a secondary source, or the cited primaries are read |
| Beer SRM (Morey), IBU (Tinseth), ABV | Blocked until a citable source is read (primary sources being collected) |
| Beer FG | Only from a stated culture attenuation; never defaulted |
| Mash pH estimate, residual alkalinity | 1.x, labeled as estimates (Holle calls them crude) |
| Wine, mead, cider: Brix/SG, sugar sources, OG, ABV from measurements | Blocked on sources (all "Needs source") |
| Sulfite, acid, nutrients, stabilization | 1.x, high-verification, as BEVERAGE_SCOPE says |
| Sake | Recording only, as BEVERAGE_SCOPE says |

## Decisions

Decided 2026-10-12 (owner accepted the recommendations):

| # | Question | Decision |
|---|---|---|
| FQ1 | Is a reviewed secondary source enough to ship a formula? | Yes, when it is published and reviewed (such as Holle, MBAA 2003), the formula is labeled with both citations, and the primary is listed "to verify". Web-only sources never are |
| FQ2 | OG method | Both, as named formulas: the mass method is the default for recipes created in Carboy; the points method for Lumina and BeerXML parity |
| FQ3 | Tinseth gravity | Follow the published model once a citable copy is read; Lumina's OG-based variant is kept only as a parity variant |
| FQ5 (open, 2026-10-14) | May molecular SO₂ be offered with the aqueous pK₁ (Goldberg & Parker 1985, temperature-dependent), clearly labelled as an approximation that ignores ethanol and ionic strength, before a wine-condition source is read? | Recommendation: **no**; keep it unavailable until the wine-condition source is read, because the approximation's error in wine is unquantified |
| FQ4 | ABV formula | Choose one with a citable source before Phase 2; 131.25 only as a Lumina parity variant |

**D-006, decided 2026-10-12:** BEVERAGE_SCOPE's staging, gated per statistic as in [Proposed D-006 staging](#proposed-d-006-staging): a statistic is enabled only when its source meets FQ1 and its fixtures pass.

## Web sources consulted (2026-10-12, secondary only)

- Morey exponent form: Brewer's Friend SRM calculator,
  <https://www.brewersfriend.com/srm-calculator>; *Craft Beer & Brewing*,
  <https://www.beerandbrewing.com/seeing-the-color-in-your-future>.
- SG ↔ °P cubic and its De Clerck origin: US patent 8,818,562 (PDF via
  USPTO); *Craft Beer & Brewing* SG–Plato converter,
  <https://www.beerandbrewing.com/tools/sg-plato-converter>.
- Tinseth formula and gravity guidance: Brewer's Friend forum,
  <https://www.brewersfriend.com/forum/threads/update-to-the-boil-size-target-volume-and-batch-size.11921/>;
  Grainfather help, <https://help.grainfather.com/hc/en-us/articles/360014527537-Calculation-IBU>.
  The original realbeer.com page now redirects elsewhere.

## Web sources consulted (2026-10-13, leads only)

For the CQ3/CQ4 review; none is a citation for a formula.

- Molecular SO₂ and pK₁ discussion: BRsquared, "Sulphur Dioxide",
  <http://www.brsquared.org/wine/Articles/SO2/SO2.htm>; WineMaker,
  "Calculating molecular SO₂", <https://winemakermag.com/wine-wizard/calculate-molecular-so2>.
- Bisson & Butzke (2000) record: <https://www.ajevonline.org/content/51/2/168>.
- Mead nitrogen studies: Pereira et al. (2015), <https://onlinelibrary.wiley.com/doi/full/10.1002/jib.184>.
- Cider SO₂ by pH: cider.org.uk, <https://cider.org.uk/sulphite.html>.
