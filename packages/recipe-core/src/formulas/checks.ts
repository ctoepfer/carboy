import { Decimal } from "../decimal.js";
import { convert, validateQuantity, type Quantity } from "../quantity.js";
import { unavailable, type FormulaDefinition, type FormulaResult } from "./registry.js";

// Shared input checks for formulas (internal to Recipe Core; not exported from the package).

export function check(q: Quantity | undefined, path: string, dimension: "mass" | "volume", missing: string[], invalid: string[]): void {
  if (!q) {
    missing.push(path);
    return;
  }
  const units = dimension === "mass" ? ["kg", "g", "lb", "oz"] : ["L", "mL", "US gal", "qt", "US fl oz"];
  if (!units.includes(q.unit) || validateQuantity(q).length > 0) invalid.push(path);
}

export function checkFraction(q: Quantity | undefined, path: string, missing: string[], invalid: string[]): void {
  if (!q) {
    missing.push(path);
    return;
  }
  if (!["fraction", "%"].includes(q.unit) || validateQuantity(q).length > 0 || fraction(q).compare(Decimal.ONE) > 0) invalid.push(path);
}

export function fraction(q: Quantity): Decimal {
  return convert(q, "fraction");
}

export function blockers(def: FormulaDefinition, missing: string[], invalid: string[]): FormulaResult | undefined {
  // Unknown stays unknown (invariant 7): nothing is defaulted to zero.
  if (missing.length > 0) return unavailable(def, "missing-input", missing, `missing: ${missing.join(", ")}`);
  if (invalid.length > 0) return unavailable(def, "invalid-input", invalid, `invalid: ${invalid.join(", ")}`);
  return undefined;
}
