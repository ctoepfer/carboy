import { Decimal } from "./decimal.js";

// Exact factors as in brewconvert model/units.py (RECIPE_SCHEMA Q2):
// 1 lb = 0.45359237 kg (international pound); 1 US gal = 3.785411784 L.
const TO_BASE: Record<string, { dimension: "mass" | "volume"; factor: Decimal }> = {
  kg: { dimension: "mass", factor: Decimal.parse("1") },
  g: { dimension: "mass", factor: Decimal.parse("0.001") },
  lb: { dimension: "mass", factor: Decimal.parse("0.45359237") },
  oz: { dimension: "mass", factor: Decimal.parse("0.028349523125") },
  L: { dimension: "volume", factor: Decimal.parse("1") },
  mL: { dimension: "volume", factor: Decimal.parse("0.001") },
  "US gal": { dimension: "volume", factor: Decimal.parse("3.785411784") },
};

export interface Quantity {
  value: string;
  unit: string;
}

export function convert(q: Quantity, to: string): Decimal {
  const from = TO_BASE[q.unit];
  const target = TO_BASE[to];
  if (!from || !target) throw new Error(`unknown unit: ${!from ? q.unit : to}`);
  if (from.dimension !== target.dimension) {
    throw new Error(`unit-dimension-mismatch: ${q.unit} -> ${to}`);
  }
  return Decimal.parse(q.value).mul(from.factor).div(target.factor);
}
