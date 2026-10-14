import { Decimal } from "./decimal.js";

// Unit table (RECIPE_SCHEMA §5, Q2; docs/architecture/RECIPE_CORE.md §3).
//
// Tokens and exact factors follow brewconvert `model/units.py` (Q2). Each
// convertible unit has an exact rational factor to its dimension's base unit
// (num / den), so a conversion rounds at most once, in a single final
// division. Scales such as SG, Plato, SRM, or EBC have no factor: converting
// between them is a versioned formula, never a unit factor.

export type Dimension =
  | "mass"
  | "volume"
  | "duration"
  | "temperature"
  | "pressure"
  | "concentration"
  | "fraction"
  | "count"
  | "scale";

interface Factor {
  readonly num: Decimal;
  readonly den: Decimal;
}

export interface UnitDefinition {
  readonly token: string;
  readonly dimension: Dimension;
  /** Factor to the dimension's base unit; absent for temperature, counts, and scales. */
  readonly factor?: Factor;
  /** Negative values allowed (temperatures only). */
  readonly signed?: boolean;
}

const d = Decimal.parse;
const f = (num: string, den = "1"): Factor => ({ num: d(num), den: d(den) });

// US fluid ounce = 1/128 US gallon = 0.0295735295625 L (exact).
const US_FL_OZ = "0.0295735295625";

const DEFINITIONS: readonly UnitDefinition[] = [
  // Mass, base kg. International avoirdupois pound (exact).
  { token: "kg", dimension: "mass", factor: f("1") },
  { token: "g", dimension: "mass", factor: f("0.001") },
  { token: "lb", dimension: "mass", factor: f("0.45359237") },
  { token: "oz", dimension: "mass", factor: f("0.028349523125") },

  // Volume, base L. US liquid measures, not imperial.
  { token: "L", dimension: "volume", factor: f("1") },
  { token: "mL", dimension: "volume", factor: f("0.001") },
  { token: "US gal", dimension: "volume", factor: f("3.785411784") },
  { token: "qt", dimension: "volume", factor: f("0.946352946") },
  { token: "US fl oz", dimension: "volume", factor: f(US_FL_OZ) },
  // US customary: tablespoon = 1/2 US fl oz, teaspoon = 1/6 US fl oz.
  { token: "tbsp", dimension: "volume", factor: f(US_FL_OZ, "2") },
  { token: "tsp", dimension: "volume", factor: f(US_FL_OZ, "6") },

  // Duration, base min.
  { token: "s", dimension: "duration", factor: f("1", "60") },
  { token: "min", dimension: "duration", factor: f("1") },
  { token: "h", dimension: "duration", factor: f("60") },
  { token: "day", dimension: "duration", factor: f("1440") },

  // Temperature: affine, handled separately.
  { token: "C", dimension: "temperature", signed: true },
  { token: "F", dimension: "temperature", signed: true },
  { token: "K", dimension: "temperature", signed: true },

  // Pressure, base kPa. psi = lbf/in² = 0.45359237 kg × 9.80665 m/s² ÷
  // 0.00064516 m² (exact rational; brewconvert stores 16 digits of it).
  { token: "kPa", dimension: "pressure", factor: f("1") },
  { token: "bar", dimension: "pressure", factor: f("100") },
  { token: "psi", dimension: "pressure", factor: f("4.4482216152605", "0.64516") },

  // Concentration, base mg/L. ppm = mg/L is brewconvert's dilute aqueous
  // convention (Q2), stated in RECIPE_CORE.md §3.
  { token: "mg/L", dimension: "concentration", factor: f("1") },
  { token: "ppm", dimension: "concentration", factor: f("1") },
  { token: "g/L", dimension: "concentration", factor: f("1000") },

  // Dimensionless fractions, base fraction.
  { token: "fraction", dimension: "fraction", factor: f("1") },
  { token: "%", dimension: "fraction", factor: f("0.01") },

  // Counts: never interchangeable, never mass or volume.
  { token: "package", dimension: "count" },
  { token: "sachet", dimension: "count" },
  { token: "tablet", dimension: "count" },
  { token: "count", dimension: "count" },

  // Scales: convertible only to themselves; conversion is a formula.
  { token: "SG", dimension: "scale" },
  { token: "Plato", dimension: "scale" },
  { token: "Brix", dimension: "scale" },
  { token: "degL", dimension: "scale" },
  { token: "SRM", dimension: "scale" },
  { token: "EBC", dimension: "scale" },
  { token: "IBU", dimension: "scale" },
  { token: "pH", dimension: "scale" },
];

const TABLE: ReadonlyMap<string, UnitDefinition> = new Map(DEFINITIONS.map((u) => [u.token, u]));

/** All unit tokens, in table order. */
export const UNIT_TOKENS: readonly string[] = DEFINITIONS.map((u) => u.token);

export function unitDefinition(token: string): UnitDefinition | undefined {
  return TABLE.get(token);
}

export function isUnitToken(token: string): boolean {
  return TABLE.has(token);
}

/** Exact factor to the dimension's base unit, as num/den. Internal to Recipe Core. */
export function factorOf(u: UnitDefinition): Factor | undefined {
  return u.factor;
}
