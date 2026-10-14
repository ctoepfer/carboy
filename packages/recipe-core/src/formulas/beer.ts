import { Decimal } from "../decimal.js";
import { convert, validateQuantity, type Quantity } from "../quantity.js";
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

// ---- OG, mass method: registered, not yet available -----------------------

export const OG_MASS_METHOD: FormulaDefinition = {
  id: "gravity.og.mass-method",
  version: 1,
  title: "Original gravity (mass method)",
  status: "unavailable",
  source: { status: "secondary-checked", citations: [{ ...HOLLE, locator: "ch. 1" }] },
  expression: "extract_kg = volume × water density × SG × °P/100, solved for °P and SG",
  assumptions: ["Needs the extract mass (extract.mass) and an SG ↔ °P relationship"],
  inputs: [
    { name: "extract", description: "Result of extract.mass", units: ["kg"] },
    { name: "volume", description: "Cool wort volume", units: ["L", "US gal"] },
  ],
  applicability: { beverages: ["beer"] },
  rounding: "—",
  output: { name: "original gravity", unit: "Plato" },
  limitation:
    "Turning extract mass into °P or SG needs the SG ↔ °P relationship. No citable source has been read for it (FORMULA_COVERAGE: secondary only, web); Holle's 4-points-per-°P rule is an approximation and is not used. Unavailable until a cited gravity formula is registered.",
};

export function originalGravityMassMethod(beverage: Beverage): FormulaResult {
  const bad = checkBeverage(OG_MASS_METHOD, beverage);
  if (bad) return bad;
  return unavailable(OG_MASS_METHOD, "formula-unavailable", ["gravity.sg-plato"], OG_MASS_METHOD.limitation!);
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

// ---- shared input checks ------------------------------------------------------

function check(q: Quantity | undefined, path: string, dimension: "mass" | "volume", missing: string[], invalid: string[]): void {
  if (!q) {
    missing.push(path);
    return;
  }
  const units = dimension === "mass" ? ["kg", "g", "lb", "oz"] : ["L", "mL", "US gal", "qt", "US fl oz"];
  if (!units.includes(q.unit) || validateQuantity(q).length > 0) invalid.push(path);
}

function checkFraction(q: Quantity | undefined, path: string, missing: string[], invalid: string[]): void {
  if (!q) {
    missing.push(path);
    return;
  }
  if (!["fraction", "%"].includes(q.unit) || validateQuantity(q).length > 0 || fraction(q).compare(Decimal.ONE) > 0) invalid.push(path);
}

function fraction(q: Quantity): Decimal {
  return convert(q, "fraction");
}

function blockers(def: FormulaDefinition, missing: string[], invalid: string[]): FormulaResult | undefined {
  // Unknown stays unknown (invariant 7): nothing is defaulted to zero.
  if (missing.length > 0) return unavailable(def, "missing-input", missing, `missing: ${missing.join(", ")}`);
  if (invalid.length > 0) return unavailable(def, "invalid-input", invalid, `invalid: ${invalid.join(", ")}`);
  return undefined;
}
