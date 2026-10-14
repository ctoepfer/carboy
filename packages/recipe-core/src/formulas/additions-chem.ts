import { Decimal } from "../decimal.js";
import { convert, validateQuantity, type Quantity } from "../quantity.js";
import { checkBeverage, computed, unavailable, type Beverage, type FormulaDefinition, type FormulaResult } from "./registry.js";

// Stoichiometric pieces of the sulfite (CQ4) and nutrient (CQ3) models. Only
// chemistry with a primary citation; everything that needs wine-chemistry
// constants or requirement figures stays unavailable (FORMULA_COVERAGE).

const CIAAW = {
  work: "IUPAC/CIAAW, Abridged Standard Atomic Weights 2024 (based on the Atomic Weights 2021 report)",
  locator: "H 1.0080, N 14.007, O 15.999, P 30.974, S 32.06 ± 0.02, K 39.098",
  checked: "read",
} as const;

const SO2_FRACTION = Decimal.parse("0.5763"); // 2 SO2 / K2S2O5 = 128.116 / 222.311
const N_FRACTION = Decimal.parse("0.2121"); // 2 N / (NH4)2HPO4 = 28.014 / 132.056
const MASS_UNITS = ["kg", "g", "lb", "oz"];

export const SO2_FROM_METABISULFITE: FormulaDefinition = {
  id: "sulfite.so2-from-metabisulfite",
  version: 1,
  title: "SO₂ released by potassium metabisulfite",
  status: "enabled",
  source: { status: "primary-checked", citations: [CIAAW] },
  expression: "SO₂ mass = K₂S₂O₅ mass × purity × 0.5763 (2 SO₂ ÷ K₂S₂O₅ by mass); concentration = SO₂ mass ÷ volume",
  assumptions: [
    "The salt is potassium metabisulfite, K₂S₂O₅; purity is 1 unless the maker states otherwise and it is given",
    "The result is SO₂ released into the must or wine, not the free SO₂ that results: part of any addition binds, so free SO₂ must be measured afterwards",
    "0.5763 is rounded to four significant figures, the precision the atomic-weight uncertainty of sulfur supports",
    "Tablets (for example Campden tablets) need the maker's stated mass per tablet; a count alone is not converted",
  ],
  inputs: [
    { name: "salt", description: "Mass of potassium metabisulfite", units: MASS_UNITS },
    { name: "volume", description: "Optional volume of must, juice, or wine, for a concentration", units: ["L", "mL", "US gal", "qt", "US fl oz"] },
    { name: "purity", description: "Optional purity stated by the maker", units: ["fraction", "%"] },
  ],
  applicability: { beverages: ["wine", "cider", "mead"] },
  rounding: "Exact product with the four-figure factor; concentration exact except one division (34 significant digits)",
  output: { name: "SO₂ released", unit: "g" },
};

export const YAN_FROM_DAP: FormulaDefinition = {
  id: "nutrient.yan-from-dap",
  version: 1,
  title: "Nitrogen supplied by diammonium phosphate (DAP)",
  status: "enabled",
  source: { status: "primary-checked", citations: [CIAAW] },
  expression: "N mass = DAP mass × purity × 0.2121 (2 N ÷ (NH₄)₂HPO₄ by mass); YAN added = N mass ÷ volume",
  assumptions: [
    "The salt is diammonium phosphate, (NH₄)₂HPO₄; purity is 1 unless the maker states otherwise and it is given",
    "All of DAP's nitrogen is ammonium nitrogen, which counts as yeast-assimilable nitrogen (YAN); the result is YAN added, not the must's total YAN, which needs the must's own measured YAN",
    "Whether more nitrogen is needed, and how much, is not calculated here (no requirement formula is enabled); legal limits on DAP use are not checked",
    "0.2121 is rounded to four significant figures",
  ],
  inputs: [
    { name: "salt", description: "Mass of DAP", units: MASS_UNITS },
    { name: "volume", description: "Optional volume of must, for YAN added in mg N/L", units: ["L", "mL", "US gal", "qt", "US fl oz"] },
    { name: "purity", description: "Optional purity stated by the maker", units: ["fraction", "%"] },
  ],
  applicability: { beverages: ["wine", "cider", "mead"] },
  rounding: "Exact product with the four-figure factor; concentration exact except one division (34 significant digits)",
  output: { name: "nitrogen supplied", unit: "g" },
};

type WithConcentration = FormulaResult & { readonly concentration?: Decimal };

/** SO₂ released (g); with a volume, also `concentration` in mg/L. */
export function so2FromMetabisulfite(beverage: Beverage, salt: Quantity | undefined, volume?: Quantity, purity?: Quantity): WithConcentration {
  return stoichiometric(SO2_FROM_METABISULFITE, SO2_FRACTION, beverage, salt, volume, purity);
}

/** Nitrogen supplied (g); with a volume, also `concentration` (YAN added) in mg N/L. */
export function yanFromDap(beverage: Beverage, salt: Quantity | undefined, volume?: Quantity, purity?: Quantity): WithConcentration {
  return stoichiometric(YAN_FROM_DAP, N_FRACTION, beverage, salt, volume, purity);
}

function stoichiometric(
  def: FormulaDefinition,
  factor: Decimal,
  beverage: Beverage,
  salt: Quantity | undefined,
  volume: Quantity | undefined,
  purity: Quantity | undefined,
): WithConcentration {
  const bad = checkBeverage(def, beverage);
  if (bad) return bad;
  if (!salt) return unavailable(def, "missing-input", ["salt"], "missing: salt");
  const invalid: string[] = [];
  if (!MASS_UNITS.includes(salt.unit) || validateQuantity(salt).length > 0) invalid.push("salt");
  if (volume && (!["L", "mL", "US gal", "qt", "US fl oz"].includes(volume.unit) || validateQuantity(volume).length > 0)) invalid.push("volume");
  let p = Decimal.ONE;
  if (purity) {
    if (!["fraction", "%"].includes(purity.unit) || validateQuantity(purity).length > 0) invalid.push("purity");
    else {
      p = convert(purity, "fraction");
      if (p.isZero() || p.compare(Decimal.ONE) > 0) invalid.push("purity");
    }
  }
  if (invalid.length > 0) return unavailable(def, "invalid-input", invalid, `invalid: ${invalid.join(", ")}`);
  const grams = convert(salt, "g").mul(p).mul(factor);
  const result = computed(def, grams, "g");
  if (!volume) return result;
  const litres = convert(volume, "L");
  if (litres.isZero()) return unavailable(def, "invalid-input", ["volume"], "volume must be greater than zero");
  return { ...result, concentration: grams.mul(Decimal.parse("1000")).div(litres) };
}
