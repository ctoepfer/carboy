import { Decimal } from "../decimal.js";
import { validateQuantity, type Quantity } from "../quantity.js";
import { DENSITY_20, SG_20_20 } from "./data/sucrose-20c.js";
import { checkBeverage, computed, unavailable, type Beverage, type FormulaDefinition, type FormulaResult } from "./registry.js";

// SG <-> degrees Plato / Brix from Plato's sucrose density data as tabulated
// by NBS Circular 440 (owner decision 2026-10-13: an established, citable
// source with independently verified values; see
// fixtures/reference-tables/nbs-c440-sucrose-20c.json for provenance and the
// verification record).

const STEP = Decimal.parse("0.1");
const TEN = Decimal.parse("10");
const MAX_INDEX = SG_20_20.length - 1; // 400 -> 40.0 °P
const SG = SG_20_20.map((s) => Decimal.parse(s));
const DENS = DENSITY_20.map((s) => Decimal.parse(s));

export const SG_PLATO: FormulaDefinition = {
  id: "gravity.sg-plato",
  version: 1,
  title: "Specific gravity ↔ degrees Plato (sucrose table)",
  status: "enabled",
  source: {
    status: "primary-checked",
    citations: [
      { work: "Bates et al. 1942, NBS Circular C440, Polarimetry, Saccharimetry and the Sugars", locator: "Tables 113 (p. 626) and 114 (pp. 632 ff.)", checked: "read" },
      { work: "Plato, Domke, Harting 1900, Wiss. Abh. Kaiserl. Normal-Eichungs-Kommission 2", locator: "p. 153 (via NBS Table 113)", checked: "via" },
    ],
  },
  expression: "Linear interpolation in the 0.1 °P table of apparent SG at 20/20 °C (Plato's densities via NBS C440)",
  assumptions: [
    "°Plato and °Brix are both percent sucrose by mass in a pure sucrose solution (NBS C440, p. 248); this table (Plato's densities) is used for both. Brewing (ASBC) tables derive from the same data; small differences from rounding and air-buoyancy conventions are possible",
    "For wort, must, or juice the result is sucrose-equivalent: the °P of a pure sucrose solution with the same density. It is not the true mass fraction of dissolved solids, which differ from sucrose in density (NBS C440, p. 254: for impure sugar solutions, density is a less reliable measure of total dissolved substance than refractive index)",
    "SG is apparent SG at 20 °C/20 °C, the table's convention. A hydrometer standardized at another temperature, or a sample read away from its standard temperature, must be corrected first; this formula does not. NBS's own correction table for Brix hydrometers is for approximate results only (C440 Table 110)",
    "This is a density relationship. A refractometer reading is a refractive-index measurement; it is not an SG and must not be converted here as if it were, and readings taken after fermentation starts (with alcohol present) are invalid without a separate, cited correction",
    "Values between table steps are linearly interpolated. Results are rounded to the table's resolution (SG ±0.00001, about ±0.003 °P), which is the precision of the reference data, not the accuracy of a measurement: the result is only as accurate as the reading, the instrument, and the temperature correction behind it",
  ],
  inputs: [
    { name: "gravity", description: "A gravity in °P or °Brix (0 to 40), or an SG (1.00000 to 1.17874)", units: ["Plato", "Brix", "SG"] },
  ],
  applicability: { beverages: ["beer", "wine", "mead", "cider"], notes: "Sugar solutions measured on the sucrose scale; not sake (its gravity scales differ)" },
  rounding: "SG half-even to 5 decimals (the table's precision); °P/°Brix half-even to 2 decimals",
  output: { name: "gravity", unit: "SG or Plato/Brix" },
  limitation: "0 to 40 °P only (SG 1.00000 to 1.17874); outside that range the result is unavailable, never extrapolated",
};

/** SG (apparent, 20/20 °C) for a gravity in °P or °Brix. */
export function sgFromPlato(beverage: Beverage, gravity: Quantity | undefined): FormulaResult {
  const pre = precheck(beverage, gravity, ["Plato", "Brix"]);
  if (pre) return pre;
  const p = Decimal.parse(gravity!.value);
  if (p.compare(Decimal.parse("40")) > 0) return outOfRange(`${gravity!.value} °${gravity!.unit} is above 40`);
  const sg = interpolate(SG, p).round(5);
  return computed(SG_PLATO, sg, "SG");
}

/** °P (or °Brix) for an apparent SG at 20/20 °C. */
export function platoFromSg(beverage: Beverage, gravity: Quantity | undefined, to: "Plato" | "Brix" = "Plato"): FormulaResult {
  const pre = precheck(beverage, gravity, ["SG"]);
  if (pre) return pre;
  const sg = Decimal.parse(gravity!.value);
  if (sg.compare(SG[0]!) < 0 || sg.compare(SG[MAX_INDEX]!) > 0) {
    return outOfRange(`SG ${gravity!.value} is outside ${SG[0]} to ${SG[MAX_INDEX]}`);
  }
  return computed(SG_PLATO, inverse(SG, sg).round(2), to);
}

/** Apparent SG 20/20 °C for a °P value, interpolated, unrounded. `p` in 0 to 40. */
export function sgAtPlato(p: Decimal): Decimal {
  return interpolate(SG, p);
}

/**
 * True density at 20 °C (g/mL, Plato's Table 113 values) for a °P value,
 * interpolated. Used by the mass method; not a user-facing statistic.
 * `p` must be within 0 to 40.
 */
export function densityAtPlato(p: Decimal): Decimal {
  return interpolate(DENS, p);
}

/** Exact interpolation between table steps (no rounding). `x` in °P, 0 to 40. */
function interpolate(table: readonly Decimal[], x: Decimal): Decimal {
  const scaled = x.mul(TEN); // index units; x is non-negative here
  const i = Number(scaled.toString().split(".")[0]); // floor
  if (i >= MAX_INDEX) return table[MAX_INDEX]!;
  const frac = scaled.sub(Decimal.fromInteger(i));
  const a = table[i]!;
  const b = table[i + 1]!;
  return a.add(b.sub(a).mul(frac));
}

/** Inverse of interpolate for a monotonically increasing table: °P for `y`. */
function inverse(table: readonly Decimal[], y: Decimal): Decimal {
  let lo = 0;
  let hi = MAX_INDEX;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid]!.compare(y) <= 0) lo = mid;
    else hi = mid;
  }
  const a = table[lo]!;
  const b = table[hi]!;
  const frac = y.sub(a).div(b.sub(a));
  return Decimal.fromInteger(lo).add(frac).mul(STEP);
}

function precheck(beverage: Beverage, q: Quantity | undefined, units: readonly string[]): FormulaResult | undefined {
  const bad = checkBeverage(SG_PLATO, beverage);
  if (bad) return bad;
  if (!q) return unavailable(SG_PLATO, "missing-input", ["gravity"], "missing: gravity");
  if (!units.includes(q.unit) || validateQuantity(q).length > 0) {
    return unavailable(SG_PLATO, "invalid-input", ["gravity"], `gravity must be a valid quantity in ${units.join(" or ")}`);
  }
  return undefined;
}

function outOfRange(message: string): FormulaResult {
  return unavailable(SG_PLATO, "out-of-range", ["gravity"], `${message}; the table covers 0 to 40 °P (SG 1.00000 to 1.17874)`);
}
