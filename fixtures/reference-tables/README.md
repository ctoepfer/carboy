# Reference tables

Published reference data that Recipe Core embeds, kept here with their
provenance and verification so anyone can check them.

## `nbs-c440-sucrose-20c.json`

°Plato / °Brix from 0.0 to 40.0 in 0.1 steps, with apparent specific
gravity at 20 °C/20 °C and true density at 20 °C (g/mL).

- **Source:** Bates, F. J. and associates (1942), *Polarimetry,
  Saccharimetry and the Sugars*, NBS Circular C440, Tables 113 (true
  density) and 114 (apparent SG), doi:10.6028/NBS.CIRC.440. Table 113 is
  Plato's 1900 density data for sucrose solutions (Kaiserliche
  Normal-Eichungs-Kommission). US Government work, public domain.
- **Method:** `density_20` is Table 113. `sg_20_20` is computed from it by
  the circular's stated method (air 0.0012046 g/mL, brass weights 8.4 g/mL,
  apparent density of water 0.997174 g/mL), rounded half-even to 5
  decimals. The circular states Table 114 is exact to ±1 in the fifth
  decimal.
- **Verification (2026-10-13):** the computed SG equals the printed Table
  114 value at every step. 398 of 401 were confirmed against the OCR text
  of the scan; the other three were read from the page images:
  - 18.9 °P: printed 1.07809 (the OCR missed it); matches.
  - **7.4 °P: printed ".20936", a misprint** (digits transposed); the
    neighbours and Table 113 give 1.02936.
  - **36.3 °P: printed ".15597", a misprint** ("9" printed as "5"); the
    neighbours and Table 113 give 1.15997.

  Second differences of SG show no outliers anywhere in the range. As a
  sanity check only, a published cubic fit of the NBS Brix table agrees
  within ±0.005 °P across 0–40.
- **Regenerate:** `tools/reference-tables/nbs_c440.py` (rebuilds and
  verifies from the scan's OCR text) and `tools/reference-tables/gen_ts.py`
  (writes Recipe Core's embedded copy). A Recipe Core test checks the
  embedded copy against this file.
- **Used by:** `gravity.sg-plato` v1 and `gravity.og.mass-method` v2
  (docs/architecture/FORMULA_COVERAGE.md).
