# Reference: Holle, *A Handbook of Basic Brewing Calculations*

- Status: Reference notes, 2026-10-12. Not a decision and not a formula
  registry. Formula IDs below (`H1.1` …) are labels for this page only.
- Source: Holle, S. R. (2003, 4th printing 2010). *A Handbook of Basic
  Brewing Calculations.* Master Brewers Association of the Americas,
  St. Paul, MN. ISBN 0-9718255-1-3. LCCN 2003106351.
- Checked against: an OCR transcription the owner supplied on 2026-10-12, not the
  printed book. Page numbers are from the book's contents page (chapter
  start pages). Values marked **OCR?** were unreadable or wrong in the
  transcription. Confirm them against print before relying on them.
- Source attributions follow the transcription's footnote lists. In
  chapters 5, 8, and 9 the footnote markers are garbled, so the attributions
  there are best matches and **Need confirmation** against print.

## Rights and how this page was written

The handbook is © MBAA, all rights reserved, and its notice forbids
reproduction in any information storage and retrieval system. This
repository is public and Apache-2.0. So this page **does not reproduce the
book**: no prose, worked examples, or data tables are copied. It records
formulas and physical constants (facts) in our own words, with chapter and
page so a reader can check the original, and the primary sources the book
cites. Do not commit the transcription or scans to this repository.

## How Carboy should use it

1. **It is a secondary source.** Holle compiles methods from Kunze,
   Narziss, DeClerck, Kolbach, Daniels, Mosher, and others, and footnotes
   each one. For the formula coverage table and the Phase 2 registry, cite
   the primary source where it can be checked. Cite Holle only where it can't,
   and say so.
2. **Many methods are deliberate approximations** for brewers without
   laboratory equipment (the book's own preface says so). Carboy must not
   adopt an approximation as a silent default. Each one becomes a named,
   versioned formula with its assumption recorded (invariant 7), or it is
   not used.
3. **Fixed constants in the book are often inputs in Carboy.** Grain heat
   capacity 0.4, wort shrinkage 4 %, grain absorption, and the 0.46 CO₂ yield
   are typical values, not laws. Where a recipe or equipment profile can
   state the value, it should, and the formula takes it as an input.

### Coverage of Lumina's formulas (REUSE_BASELINE port map)

| Lumina hook | Covered by Holle? | Notes |
|---|---|---|
| `color.mcu` | **Yes**, H1.6 | Holle credits Daniels (1996, p. 59) for the "malt color units" form |
| `color.srm.morey` | No | Holle maps MCU to beer color with Daniels's lookup table (p. 61), not Morey's equation. Morey's primary source is still needed |
| `gravity.points` (ppg × lb × efficiency) | Partly, H1.1 | Holle uses a mass-based extract method (°P × wort mass), not points per pound per gallon. Equivalent in intent; not the same formula |
| `fermentation.fg` (apparent attenuation) | Partly, H9.4 | Holle defines apparent and real degree of fermentation, not a predicted FG from a yeast attenuation figure |
| `fermentation.abv` (× 131.25) | No | Holle gives only ABV ↔ ABW (H-A.4). A primary source for 131.25 is still needed |
| `hops.ibu.tinseth` | No | Holle uses Mosher's utilization tables (H7.1–H7.3). Tinseth's primary publication is still needed |
| `water_chemistry.py` ion contributions | **Yes**, H3.1 and H3.2 | Same approach (percentage of Ca in the salt); Holle adds residual alkalinity and a mash pH estimate, which Lumina doesn't have |

## Formulas by chapter

Units are as the book uses them. "Fraction" means a value between 0 and 1.
The book writes percentages and uses them as fractions.

### Chapter 1: Malt (p. 1)

| ID | Formula | Inputs | Primary source cited | Carboy note |
|---|---|---|---|---|
| H1.1 | grain mass = (cool wort volume × water mass per volume × SG × °P/100) ÷ (extract_cg_db × (1 − moisture) × brewhouse efficiency) | volume; SG; °P; fractions | Kunze p. 266; Narziss II:313 (which adds a 0.96 factor for hot volume); Lewis & Young pp. 103–104 | The denominator is the "overall efficiency" or "brewhouse yield". The numerator is the extract mass in the wort. For a grain bill, apply it per malt with that malt's share of the extract (shares sum to 1) |
| H1.2 | as-is extract = extract_cg_db × (1 − moisture) | fractions | Maltster analysis convention | If only fine-grind extract is known: cg = fg − (fine-coarse difference) |
| H1.3 | overall efficiency = extract mass in wort ÷ grain mass; brewhouse efficiency = overall ÷ (extract_cg_db × (1 − moisture)) | measured volume, °P, grain mass | — | Measured after the boil. A batch-to-recipe "learning" candidate (Phase 7) |
| H1.4 | SG ≈ 1 + 4·°P/1000 | °P | Book's own approximation | **Approximation; Holle says so.** Carboy's gravity conversion must be a cited, versioned formula (RECIPE_SCHEMA §5). Don't use this one |
| H1.5 | SRM = (EBC + 1.2) ÷ 2.65, or SRM = EBC ÷ 1.97 | EBC | Daniels p. 44; Noonan p. 11 | Two conventions are in use. ×1.97 is the current ASBC/EBC relation; the 2.65 form is older. Holle also treats SRM as equal to °Lovibond, which is a simplification |
| H1.6 | wort color (MCU) = Σ(lb malt × °L) ÷ US gal of wort | lb, °L, gal | Daniels p. 59 | Matches Lumina `color.mcu`. Holle then maps MCU to beer color with Daniels's lookup table (p. 61). Lumina uses Morey's equation instead |

Malt typical-value tables (constituents of extract, extract by malt type)
are on pp. 1–11. They are examples, not catalog data (D-009).

### Chapter 2: Volume (p. 12)

| ID | Formula | Inputs | Primary source cited | Carboy note |
|---|---|---|---|---|
| H2.1 | cylinder V = π r² h; cone V = π r² h ÷ 3 | dimensions | — | Equipment geometry (Phase 3), if vessels are described by dimensions |
| H2.2 | cool volume = hot volume × 0.96 (at 100 °C); 0.97 at 85 °C, 0.98 at 70 °C, 0.99 at 50 °C | volume, temperature | Singh & Heldman p. 611 (ratio of water densities to 20 °C) | Shrinkage should come from water density at the two temperatures, not a fixed 4 %. Holle footnotes the density basis |
| H2.3 | mass of liquid = volume × water mass per volume × SG | | — | 1 US gal water = 8.322 lb, 1 bbl = 258 lb, 1 L = 1 kg at 20 °C (book's values) |
| H2.4 | knockout volume needed = packaged volume + transfer and cold-trub loss (5–10 %) + hot-trub and whirlpool loss (5–10 %) | volume, loss fractions | Kunze p. 283; Narziss II:325; Metzger §2.1 | These losses are `loss` flows in the process graph (RECIPE_SCHEMA §7.3), with equipment values, not fixed percentages |
| H2.5 | mash water = grist mass × water:grist ratio (2–5 : 1 by mass) | mass, ratio | Kunze p. 189; Narziss II:157; DeClerck 1:269 | A mash-stage parameter |
| H2.6 | sparge water = knockout volume + boil-off + grain absorption + mash losses − mash water | volumes | Narziss II:157 (0.96 L/kg absorption, 2.2 % mash loss); Kunze p. 237 (evaporation) | Grain absorption 0.96 L/kg (0.115 gal/lb) is typical. It should be an equipment-profile value |
| H2.7 | first-runnings °P = Y ÷ (W + Y), where Y = as-is extract per unit grist mass and W = water mass per unit grist mass | fractions, ratio | — | Rearranged: W = Y(1 − P)/P. **The printed rearrangement (Formula 8) is garbled in the transcription**; this is the algebraically correct form, and it reproduces the book's own example (≈ 4 : 1 for 16 °P) |
| H2.8 | mash tun volume = (water volume + grist volume at 0.7 L/kg) × (1.30 to 1.40) | | Narziss II:154, II:160; Kunze p. 268; DeClerck 1:289 | Equipment capacity checks (Phase 3 diagnostics) |
| H2.9 | kettle volume = (cool kettle-full volume ÷ 0.96) × (1.15 to 1.30) | | Metzger §2.1; Hudston p. 122 | Same |

### Chapter 3: Water treatment (p. 22)

| ID | Formula | Inputs | Primary source cited | Carboy note |
|---|---|---|---|---|
| H3.1 | salt mass = (target Ca − current Ca) [mg/L] ÷ Ca fraction of the salt × water volume [L] | ppm, L | Lide (CRC handbook) for the fractions | Ca fractions: CaSO₄·2H₂O 0.23; CaCl₂ anhydrous 0.36, ·2H₂O 0.27, ·6H₂O 0.18. Lumina already computes these from atomic weights, which is better than rounded fractions |
| H3.2 | mEq/L = ppm ÷ equivalent weight; hardness as CaCO₃ = Σ mEq × 50 | ppm | — | Equivalent weights: Ca 20, Mg 12.2, HCO₃ 61, CO₃ 30, CaCO₃ 50. °dH: ppm ÷ (eq. wt ÷ 2.8) |
| H3.3 | residual alkalinity (mEq) = alkalinity (mEq) − (Ca mEq ÷ 3.5 + Mg mEq ÷ 7) | mEq | **Kolbach 1941, p. 232; Kolbach 1953, p. 50** | The primary source is Kolbach. Holle notes that Daniels's version had a reversed sign, since corrected |
| H3.4 | mash pH ≈ distilled-water congress-mash pH of the grist + 0.03 × RA [°dH] | pH, °dH | Kolbach 1953 p. 50 (0.03 per °dH in 12 °P wort) | **Crude predictor; Holle says so.** Congress mash wort is about 8 °P, and higher gravity lowers pH. Weighting malt pH by grist share ignores buffering. If Carboy shows a pH estimate, it must be labeled as an estimate and need a measured value to confirm |
| H3.5 | acid to lower pH by 0.1 per 100 kg pale malt: 0.64 Eq in the mash, 0.32 Eq in the kettle | | Kolbach 1953 p. 50 | **Units are equivalents, not mEq** (the transcription says mEq; the book's own acid table only works with Eq). 100 % lactic acid in the mash ≈ 58 g (transcription reads "358 g", **OCR?**) |
| H3.6 | pH change in 12 °P wort per 50 ppm: Ca −0.060, Mg −0.049, alkalinity as CaCO₃ +0.084, as HCO₃ +0.069 | ppm | Derived from H3.3–H3.4 | Recomputed and consistent with Kolbach's factors |

Guideline limits (pp. 22–32, after Kolbach and Christiansen): RA for pale
Pilsner below 2 °dH; Ca 50–100 ppm desirable, maximum 250; Mg maximum
22 ppm; Cl⁻ maximum 240 ppm; SO₄²⁻ maximum 150 ppm. These are guidance.
They must not become validation errors.

### Chapter 4: Mixing (p. 33)

| ID | Formula | Notes |
|---|---|---|
| H4.1 | A·a + B·b = (A + B)·c | Weighted average of one property (temperature, °P, ABV, color) over two quantities. Valid for °P only by mass, and for color only approximately |
| H4.2 | dilution: V₁·P₁ = V₂·P₂ | With SG, use gravity points (SG 1.048 → 48), not SG |
| H4.3 | cool knockout volume to reach target = (hot volume × 0.96 × current °P) ÷ target °P | Combines H2.2 and H4.2 |

### Chapter 5: Mashing (p. 36)

| ID | Formula | Inputs | Primary source cited | Carboy note |
|---|---|---|---|---|
| H5.1 | strike temperature = ((c_g·G + W)·T_rest − c_g·G·T_grain) ÷ W, with c_g ≈ 0.4 | masses, temperatures | Bamforth pp. 103–104 (c_g 0.38–0.42 by malt moisture); Froning 1995 (*Zymurgy*) | Ignores slaking heat and vessel heat. Bamforth's slaking-heat correction (1.1–3.1 °C by moisture) is noted on the same page. c_g is an input, default to be cited |
| H5.2 | mash heat capacity = (c_g·G + W) ÷ (G + W) | masses | — | Dimensionless |
| H5.3 | infusion water mass = MHC × mash mass × (T_target − T_now) ÷ (T_water − T_target) | | DeClerck 1:269–70 | Holle uses 90–95 °C (205 °F) for "boiling" water to allow for transfer losses |
| H5.4 | decoction volume = total mash volume × (T_target − T_start) ÷ (T_decoction − T_start), with T_decoction = 90 °C | volumes, temperatures | Narziss II:166; Kunze pp. 196–199 | Assumes the decoction and the rest mash have the same heat capacity. Holle deliberately uses 90 °C rather than 100 °C, which oversizes the decoction for safety |

Enzyme temperature ranges (Kunze pp. 181–190, with differing British
figures from Hough and Palmer) are on p. 36. These are descriptive. They
are not stage-kind rules.

### Chapter 6: Wort boiling (p. 44)

| ID | Formula | Notes |
|---|---|---|
| H6.1 | evaporation fraction = (V_start − V_end) ÷ V_start; per hour = that ÷ boil hours; volume per hour = rate × V_start | No temperature correction is needed because it is a ratio. The equipment profile's boil-off belongs here |
| H6.2 | remaining boil time = (current cool volume − target cool volume) ÷ volume evaporated per hour | Uses H4.3 for the target volume |

### Chapter 7: Hops (p. 49)

| ID | Formula | Inputs | Primary source cited | Carboy note |
|---|---|---|---|---|
| H7.1 | IBU = mg hops × utilization × alpha ÷ L of cool wort | mg, fractions, L | Lewis, M. 1995 pp. 153–154 (IBU ≈ iso-α-acid mg/L) | The basic definition. Lumina's Tinseth hook has the same shape, with Tinseth's utilization model in place of a table lookup |
| H7.2 | IBU = utilization × alpha × oz × 7,490 ÷ US gal | oz, gal | — | 7,490 = 28,350 mg/oz ÷ 3.785 L/gal |
| H7.3 | hop mass = volume × target IBU ÷ (utilization × alpha) | | — | Inverse of H7.1. Useful for "hit 35 IBU" previews |

Utilization comes from tables by boil time, wort gravity, and whole versus
pellet hops (p. 52), which Holle takes from **Mosher, *The Brewer's
Companion* (1993), pp. 108–109**. Holle warns that the tables are crude
guidance (Mosher gives no source for them) and cites an informal
37-brewer test (Bonham 1999) in which Mosher's calculator came closest.
Bitterness loss to packaged beer is 10–20 % (Virdon p. 58). Alpha-acid loss
in storage varies by variety (HopUnion 1995 table, p. 50). Carboy should
not copy the Mosher tables. If a table-based model is ever offered, cite
Mosher directly and check the redistribution terms.

### Chapter 8: Yeast pitching (p. 56)

| ID | Formula | Notes |
|---|---|---|
| H8.1 | pitch rate [million cells/mL] = rate per °P × °P; ale 0.40–1.00, lager 1.00–1.65 (1.67 by arithmetic) | Derived by Holle from 5–12 and 12–20 million/mL at 12 °P, after Knudsen p. 240 ("1 million cells/mL/°P") |
| H8.2 | total cells = pitch rate × wort mL; starter mL = total cells ÷ starter cells per mL | Starter density 80–100 million/mL is an assumption that should be replaced by a count |
| H8.3 | packets = total cells ÷ cells per packet | |
| H8.4 | thick slurry: 0.5 L per hL gives 15 million cells/mL; scale linearly | Kunze p. 299; Heyse. A rough rule. Batch-side (Phase 7), not recipe |

Supplier and textbook pitch-rate survey and O₂ solubility: pp. 56–63.

### Chapter 9: Carbonation (p. 64)

| ID | Formula | Inputs | Primary source cited | Carboy note |
|---|---|---|---|---|
| H9.1 | volumes CO₂ ≈ 4.85 × (psig + 14.7) ÷ (°F + 12.4) | psig, °F | Appendix C, Table D footer | Recovered from the table footer. It reproduces the book's own examples (2.27 vol at 34 °F and 7 psig). Add 1 psi per 2,000 ft of altitude. Empirical fit; source of the fit not given |
| H9.2 | 1 vol CO₂ per vol beer = 1.976 g/L; 1 g/L = 0.506 vol | | Gas density of CO₂ at 0 °C, 1 atm | Holle labels this "at 50 °F", but volumes are defined at standard conditions, so the factor doesn't depend on beer temperature |
| H9.3 | CO₂ from fermentation ≈ 0.46 × fermentable extract mass | | Hough p. 115 (stoichiometry with yeast growth) | 46–47 %. Also used for priming |
| H9.4 | ADF = (OE − AE) ÷ OE; RDF ≈ 0.82 × ADF; real final extract = OE × (1 − RDF) | °P | DeClerck 1:392 (0.819 factor) | The 0.82 factor is an approximation. Carboy's attenuation and real-extract formulas need a cited choice (Balling or ASBC) |
| H9.5 | spunding point °P = final apparent extract + (target g CO₂/L ÷ 0.46) ÷ 10 | °P, g/L | Hough p. 115 | Close the tank 0.5–1.0 °P above it |
| H9.6 | wort priming fraction = ((target − residual CO₂ g/100 g) ÷ 0.46) ÷ (OE − real final extract) | | Kunze p. 332 | Residual CO₂ at atmospheric pressure by temperature: Kunze p. 332 (Holle Table 3) |
| H9.7 | sugar priming = (target − residual CO₂) ÷ 0.46 × beer mass ÷ fermentable fraction; 4.3 g fermentable sugar per L per volume of CO₂ | | — | 4.3 = 1.976 ÷ 0.46. Hydrostatic pressure adds about 0.1 atm per metre of beer depth (use the mean depth) |

Style carbonation levels: p. 70 (Piendl 1997 and a homebrew style chart).
These are guidance, and the source of the second table is a retailer chart.

### Chapter 10: Draught dispense (p. 75)

| ID | Formula | Notes |
|---|---|---|
| H10.1 | excess force = keg gauge pressure ± 0.5 psi per ft of fall or rise − line length × resistance per ft − fittings; choker length = excess ÷ choker resistance per ft | A balancing procedure. Line resistances (p. 77, Micro Matic 2002) are approximate |
| H10.2 | CO₂ fraction of mixed gas = (equilibrium gauge + atmospheric) ÷ (dispense gauge + atmospheric), all absolute | Dalton's law. Atmospheric pressure is 14.7 psi at sea level and 10.1 psi at 10,000 ft |

Dispense is outside the recipe model. It is recorded here only for completeness.

### Appendices (pp. 81–107)

| ID | Item | Note |
|---|---|---|
| H-A.1 | Unit factors (Appendix A) | Several are wrong or mislabelled in the transcription; see errata. Carboy uses brewconvert's exact factors (RECIPE_SCHEMA Q2), not these |
| H-A.2 | °C ↔ °F | The table's lower rows are misaligned in the transcription. Compute; don't read the table |
| H-A.3 | °P = (SG − 1) ÷ 0.004 | Same approximation as H1.4 |
| H-A.4 | ABW = 0.789 × ABV | Ignores beer density. A cited formula is still needed |
| H-D | Congress mash procedure (Appendix D) | Explains why malt color and pH ratings come from about 8 °P lab wort. That matters wherever malt analysis data feed a calculation |

## Errata found by recomputation

Each was checked by recomputing the book's own example, on 2026-10-12. "Print?"
means the error may be in the transcription and not the book.

| Where | Transcription says | Recomputed | Likely cause |
|---|---|---|---|
| Ch. 1, Example 7 | brewhouse efficiency missing | 0.69 ÷ (0.79 × 0.97) = **90 %** | OCR |
| Ch. 1, Example 5 | Caramunich extract 71.5 %, but the calculation uses 75 % | 75 % gives 62 % overall; 71.5 % gives 60 % | Inconsistent in source (also in Appendix E). Print? |
| Ch. 2, Formula 8 | garbled rearrangement | W = Y(1 − P) ÷ P; 3.97 : 1 for the example | OCR |
| Ch. 2, Example 4 | "1½-hour boil at 7.6 %/h" but computes one 7.6 % step (0.90 bbl) | 1½ h at 7.6 %/h would be 1.42 bbl | Inconsistent in source; the metric version says 1 hour |
| Ch. 3, Example 1 | 11.49 lb CaSO₄ | **1.49 lb** (673,589 mg ÷ 453,590) | OCR |
| Ch. 3, acid table | 100 % lactic acid 358 g; "0.64 mEq" | **58 g**; 0.64 **Eq** per 100 kg | OCR, and the unit is wrong in the text |
| Ch. 5, Example 5 | strike water 168.79 °F | **129.8 °F** (168,792 lb·°F ÷ 1,300 lb) | OCR merged the steps |
| Ch. 5, metric Example 4 | "0.8 × 1.4 kg … 21.3 kg" | 0.8 × 3.0 kg × 19 ÷ 28 = **1.63 kg** | OCR |
| Ch. 5, Example 6 | second decoction 0.5 bbl | **3.5 bbl** (11 × 15 ÷ 47) | OCR |
| Ch. 7, Example 1 | bittering hops ≈ 7 oz | **47 oz** (7,925 ÷ 167.8) | OCR dropped a digit, or a print error |
| Ch. 8, slurry table footnotes | "multiply by 1.057 × 0.8522"; "(32 × 31)" | ÷ 0.8522 (×1.240); 32 ÷ 31 (×1.03) | Operators wrong; the stated results 1.24 and 1.03 are right |
| Ch. 8, O₂ table | water at 20 °C: "99" ppm | about 9 ppm | OCR |
| App. A | 1 m = 39.57 in; 1 atm = 14.696 psig | 39.37 in; 14.696 psi (absolute) | Print? |
| App. A | °C/°F table below 10 °C (e.g. 9 °C = 46 °F, 4 °C = 32 °F) | 48.2 °F, 39.2 °F | OCR row shift |
| App. C | Table D-2 (bar vs g/kg CO₂) mostly unreadable | — | OCR; use a primary source |

## Primary sources Holle cites for formulas

To collect for the formula coverage table (NEXT_ACTIONS, "Collect primary
sources"):

- Kolbach, P. (1941). Zur Beurteilung gipshaltiger Brauwässer.
  *Wochenschrift für Brauerei* 63(44):231–234. (Residual alkalinity.)
- Kolbach, P. (1953). Der Einfluss des Brauwassers auf das pH von Würze
  und Bier. *Monatsschrift für Brauerei*, Wiss. Beilage 6(5):49–52. (pH
  shift per °dH; acid equivalents.)
- Daniels, R. (1996). *Designing Great Beers.* Brewers Publications.
  pp. 44, 59, 61, 71. (Color conversion, MCU, wort-to-beer color table.)
- Mosher, R. (1993). *The Brewer's Companion.* Alephenalia. pp. 108–109.
  (Hop utilization tables.)
- Kunze, W. (1994). *Technologie Brauer und Mälzer.* VLB Berlin.
  pp. 189–199, 237, 264–268, 283, 299, 332. (Grain bill, mashing,
  evaporation, losses, slurry, priming.)
- Narziss, L. (1992). *Die Bierbrauerei, Bd. II.* Enke. II:153–166, 313,
  325. (Water quantities, decoction, grain bill with a hot-volume factor.)
- DeClerck, J. (1957/1994). *A Textbook of Brewing.* Vols. 1–2.
  1:269–270, 1:392. (Infusion water, real degree of fermentation.)
- Bamforth, C. W. (2002). *Standards of Brewing.* Brewers Publications.
  pp. 103–104. (Grain heat capacity, slaking heat.)
- Singh, R. P. & Heldman, D. R. (2001). *Introduction to Food
  Engineering*, 3rd ed. p. 611. (Water density, i.e. shrinkage.)
- Hough, J. S. (1994). *The Biotechnology of Malting and Brewing.* p. 115.
  (CO₂ yield from extract.)

Still not covered by Holle or these sources: Morey's SRM equation, Tinseth's
IBU model, the ABV × 131.25 approximation, and an exact SG ↔ °P
conversion.
