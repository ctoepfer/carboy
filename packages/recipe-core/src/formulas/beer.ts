import { Decimal } from "../decimal.js";
import { convert, validateQuantity, type Quantity } from "../quantity.js";
import { densityAtPlato, sgAtPlato } from "./gravity.js";
import { blockers, check, checkFraction, fraction } from "./checks.js";
import { checkBeverage, computed, unavailable, type Beverage, type FormulaDefinition, type FormulaResult } from "./registry.js";

// First formulas (owner decision 2026-10-13): MCU and the mass-based extract
// method, with Lumina's points method as a parity reference.
// Sources: FORMULA_COVERAGE.md; citations in docs/references/BIBLIOGRAPHY.md.

const HOLLE = { work: "Holle 2003, A Handbook of Basic Brewing Calculations", checked: "read" } as const;

// ---- MCU ---------------------------------------------------------------

export const MCU: FormulaDefinition = {
  id: "color.mcu",
  version: 1,
  title: "Malt colour units (MCU)",
  status: "enabled",
  source: {
    status: "secondary-checked",
    citations: [
      { ...HOLLE, locator: "ch. 1" },
      { work: "Daniels 1996, Designing Great Beers", locator: "p. 59", checked: "via" },
    ],
  },
  expression: "MCU = Σ(mass_lb × colour_°L) ÷ volume_USgal",
  assumptions: [
    "Colour is the malt's rating in degrees Lovibond (°L); other colour scales are not converted here",
    "Volume is the wort volume the colour is spread over (the batch volume as given)",
    "MCU is a wort colour index, not beer colour (SRM); converting MCU to SRM is a separate formula",
  ],
  inputs: [
    { name: "grains[].mass", description: "Mass of each colour-contributing ingredient", units: ["kg", "g", "lb", "oz"] },
    { name: "grains[].color", description: "Colour rating in °L", units: ["degL"] },
    { name: "volume", description: "Wort volume", units: ["L", "mL", "US gal", "qt", "US fl oz"] },
  ],
  applicability: { beverages: ["beer"], notes: "Grain-based worts" },
  rounding: "Exact sums and products; one division (34 significant digits, half-even). No display rounding",
  output: { name: "wort colour index", unit: "MCU" },
};

export interface MaltColorInput {
  readonly mass: Quantity;
  readonly color: Quantity;
}

export function maltColorUnits(beverage: Beverage, grains: readonly MaltColorInput[], volume: Quantity | undefined): FormulaResult {
  const bad = checkBeverage(MCU, beverage);
  if (bad) return bad;
  const missing: string[] = [];
  const invalid: string[] = [];
  if (grains.length === 0) missing.push("grains");
  grains.forEach((g, i) => {
    check(g.mass, `grains[${i}].mass`, "mass", missing, invalid);
    if (!g.color) missing.push(`grains[${i}].color`);
    else if (g.color.unit !== "degL" || validateQuantity(g.color).length > 0) invalid.push(`grains[${i}].color`);
  });
  check(volume, "volume", "volume", missing, invalid);
  const blocked = blockers(MCU, missing, invalid);
  if (blocked) return blocked;
  const gallons = convert(volume!, "US gal");
  if (gallons.isZero()) return unavailable(MCU, "invalid-input", ["volume"], "volume must be greater than zero");
  let sum = Decimal.ZERO;
  for (const g of grains) sum = sum.add(convert(g.mass, "lb").mul(Decimal.parse(g.color.value)));
  return computed(MCU, sum.div(gallons));
}

// ---- Extract mass (mass method) ------------------------------------------

export const EXTRACT_MASS: FormulaDefinition = {
  id: "extract.mass",
  version: 1,
  title: "Extract mass in wort (mass method)",
  status: "enabled",
  source: {
    status: "secondary-checked",
    citations: [
      { ...HOLLE, locator: "ch. 1" },
      { work: "Kunze 1994, Technologie Brauer und Mälzer", locator: "p. 266", checked: "via" },
      { work: "Narziss 1992, Die Bierbrauerei Bd. II", locator: "II:313", checked: "via" },
    ],
  },
  expression: "extract_kg = Σ(mass_kg × extract_yield × (1 − moisture)) × brewhouse_efficiency",
  assumptions: [
    "extract_yield is the malt analysis value on a dry basis (coarse grind), as a fraction",
    "moisture is the malt's moisture content as a fraction; (1 − moisture) converts dry-basis extract to as-is",
    "brewhouse_efficiency is the fraction of available extract that reaches the wort",
  ],
  inputs: [
    { name: "fermentables[].mass", description: "Mass of each extract-contributing ingredient", units: ["kg", "g", "lb", "oz"] },
    { name: "fermentables[].extract_yield", description: "Extract, dry basis, coarse grind", units: ["fraction", "%"] },
    { name: "fermentables[].moisture", description: "Moisture content", units: ["fraction", "%"] },
    { name: "brewhouse_efficiency", description: "Brewhouse efficiency", units: ["fraction", "%"] },
  ],
  applicability: { beverages: ["beer"], notes: "Malt and other analysed fermentables in a mash" },
  rounding: "Exact (sums and products only); unit conversion of mass may divide once",
  output: { name: "extract mass", unit: "kg" },
};

export interface ExtractInput {
  readonly mass: Quantity;
  readonly extract_yield: Quantity;
  readonly moisture: Quantity;
}

export function extractMass(beverage: Beverage, fermentables: readonly ExtractInput[], efficiency: Quantity | undefined): FormulaResult {
  const bad = checkBeverage(EXTRACT_MASS, beverage);
  if (bad) return bad;
  const missing: string[] = [];
  const invalid: string[] = [];
  if (fermentables.length === 0) missing.push("fermentables");
  fermentables.forEach((f, i) => {
    check(f.mass, `fermentables[${i}].mass`, "mass", missing, invalid);
    checkFraction(f.extract_yield, `fermentables[${i}].extract_yield`, missing, invalid);
    checkFraction(f.moisture, `fermentables[${i}].moisture`, missing, invalid);
  });
  checkFraction(efficiency, "brewhouse_efficiency", missing, invalid);
  const blocked = blockers(EXTRACT_MASS, missing, invalid);
  if (blocked) return blocked;
  let sum = Decimal.ZERO;
  for (const f of fermentables) {
    const asIs = fraction(f.extract_yield).mul(Decimal.ONE.sub(fraction(f.moisture)));
    sum = sum.add(convert(f.mass, "kg").mul(asIs));
  }
  return computed(EXTRACT_MASS, sum.mul(fraction(efficiency!)));
}

// ---- OG, mass method -------------------------------------------------------

export const OG_MASS_METHOD: FormulaDefinition = {
  id: "gravity.og.mass-method",
  version: 2,
  title: "Original gravity (mass method)",
  status: "enabled",
  source: {
    status: "secondary-checked",
    citations: [
      { ...HOLLE, locator: "ch. 1" },
      { work: "Kunze 1994, Technologie Brauer und Mälzer", locator: "p. 266", checked: "via" },
      { work: "Narziss 1992, Die Bierbrauerei Bd. II", locator: "II:313", checked: "via" },
      { work: "Bates et al. 1942, NBS Circular C440", locator: "Tables 113, 114 (Plato's densities)", checked: "read" },
    ],
  },
  expression: "extract_kg = volume_L × density_20(°P) × °P / 100, solved for °P; SG from °P (gravity.sg-plato)",
  assumptions: [
    "extract is the extract mass in the wort (extract.mass), with brewhouse efficiency defined against the same cool wort (Holle ch. 1: overall efficiency = extract in wort ÷ grain mass, measured after the boil)",
    "volume is the cool wort volume at 20 °C; a hot volume must be converted first (Narziss's 0.96 factor in Holle ch. 1 applies to hot volume and is not applied here)",
    "The wort's density is that of a sucrose solution of the same °P (Plato's true density, NBS C440 Table 113), so the result is sucrose-equivalent °P, the convention of the scale, not the wort's true dissolved-solids fraction",
    "Valid from 0 to 40 °P; stronger worts are unavailable, never extrapolated",
    "The result is a prediction from recipe inputs; its accuracy depends on the extract, moisture, efficiency, and volume figures, not on the table's resolution",
  ],
  inputs: [
    { name: "extract", description: "Extract mass in the wort (result of extract.mass)", units: ["kg", "g", "lb", "oz"] },
    { name: "volume", description: "Cool wort volume at 20 °C", units: ["L", "mL", "US gal", "qt", "US fl oz"] },
  ],
  applicability: { beverages: ["beer"] },
  rounding: "°P solved to better than 1e-10 by bisection, then half-even to 2 decimals; SG from the unrounded °P, half-even to 5 decimals",
  output: { name: "original gravity", unit: "SG" },
};

/** OG by the mass method. Returns SG; `plato` holds the same gravity in °P. */
export function originalGravityMassMethod(
  beverage: Beverage,
  extract: Quantity | undefined,
  volume: Quantity | undefined,
): FormulaResult & { readonly plato?: Decimal } {
  const bad = checkBeverage(OG_MASS_METHOD, beverage);
  if (bad) return bad;
  const missing: string[] = [];
  const invalid: string[] = [];
  check(extract, "extract", "mass", missing, invalid);
  check(volume, "volume", "volume", missing, invalid);
  const blocked = blockers(OG_MASS_METHOD, missing, invalid);
  if (blocked) return blocked;
  const litres = convert(volume!, "L");
  if (litres.isZero()) return unavailable(OG_MASS_METHOD, "invalid-input", ["volume"], "volume must be greater than zero");
  // Solve P · density(P) = 100 · extract / volume. The left side increases
  // strictly with P, so bisection finds the single root.
  const target = Decimal.parse("100").mul(convert(extract!, "kg")).div(litres);
  const f = (p: Decimal) => p.mul(densityAtPlato(p));
  const MAX = Decimal.parse("40");
  if (f(MAX).compare(target) < 0) {
    return unavailable(OG_MASS_METHOD, "out-of-range", ["extract", "volume"], "the wort would be stronger than 40 °P, beyond the gravity table");
  }
  let lo = Decimal.ZERO;
  let hi = MAX;
  const HALF = Decimal.parse("0.5");
  const EPS = Decimal.parse("0.0000000001");
  while (hi.sub(lo).compare(EPS) > 0) {
    const mid = lo.add(hi).mul(HALF);
    if (f(mid).compare(target) < 0) lo = mid;
    else hi = mid;
  }
  const p = lo.add(hi).mul(HALF);
  return { ...computed(OG_MASS_METHOD, sgAtPlato(p).round(5), "SG"), plato: p.round(2) };
}

// ---- OG, points method: Lumina parity reference -----------------------------

export const OG_POINTS_LUMINA: FormulaDefinition = {
  id: "gravity.og.points-lumina",
  version: 1,
  title: "Original gravity, points method (Lumina parity)",
  status: "parity-reference",
  source: { status: "needs-source", citations: [{ work: "Lumina stats_hooks gravity.points / gravity.og", checked: "read" }] },
  expression: "OG = 1 + Σ(mass_lb × ppg × efficiency) ÷ volume_USgal ÷ 1000",
  assumptions: [
    "ppg (gravity points per pound per US gallon) as Lumina's importer derived it",
    "Kept only to compare with Lumina and BeerXML-derived results (FQ2); not a user-facing formula until a source is read",
  ],
  inputs: [
    { name: "sources[].mass", description: "Mass", units: ["kg", "g", "lb", "oz"] },
    { name: "sources[].ppg", description: "Points per pound per US gallon (decimal string)", units: [] },
    { name: "sources[].efficiency", description: "Efficiency as a fraction (decimal string)", units: [] },
    { name: "volume", description: "Batch volume", units: ["L", "US gal"] },
  ],
  applicability: { beverages: ["beer"] },
  rounding: "Exact sums and products; one division per step (34 significant digits). Lumina rounds OG to 3 places for display",
  output: { name: "original gravity", unit: "SG" },
};

export interface PointsSource {
  readonly mass: Quantity;
  readonly ppg?: string;
  readonly efficiency?: string;
}

/**
 * Parity reference only. Returns `not-enabled` unless the caller explicitly
 * opts in (`{ parity: true }`), so it can't become a user-facing result by
 * accident.
 */
export function originalGravityPointsLumina(
  beverage: Beverage,
  sources: readonly PointsSource[],
  volume: Quantity | undefined,
  options: { readonly parity?: boolean } = {},
): FormulaResult & { readonly points?: Decimal } {
  if (!options.parity) return unavailable(OG_POINTS_LUMINA, "not-enabled", [], "parity reference; not a user-facing formula");
  const bad = checkBeverage(OG_POINTS_LUMINA, beverage);
  if (bad) return bad;
  const missing: string[] = [];
  const invalid: string[] = [];
  if (sources.length === 0) missing.push("sources");
  sources.forEach((s, i) => {
    check(s.mass, `sources[${i}].mass`, "mass", missing, invalid);
    for (const k of ["ppg", "efficiency"] as const) {
      const v = s[k];
      if (v === undefined) missing.push(`sources[${i}].${k}`);
      else if (!Decimal.isNormalized(v) || Decimal.parse(v).sign() < 0) invalid.push(`sources[${i}].${k}`);
    }
  });
  check(volume, "volume", "volume", missing, invalid);
  const blocked = blockers(OG_POINTS_LUMINA, missing, invalid);
  if (blocked) return blocked;
  const gallons = convert(volume!, "US gal");
  if (gallons.isZero()) return unavailable(OG_POINTS_LUMINA, "invalid-input", ["volume"], "volume must be greater than zero");
  let points = Decimal.ZERO;
  for (const s of sources) points = points.add(convert(s.mass, "lb").mul(Decimal.parse(s.ppg!)).mul(Decimal.parse(s.efficiency!)));
  const og = Decimal.ONE.add(points.div(gallons).div(Decimal.parse("1000")));
  return { ...computed(OG_POINTS_LUMINA, og), points };
}
