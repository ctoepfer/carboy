import { Decimal, DIVISION_SIGNIFICANT_DIGITS } from "./decimal.js";
import { factorOf, unitDefinition } from "./units.js";

/** A typed quantity as stored in recipe documents (RECIPE_SCHEMA §5). */
export interface Quantity {
  readonly value: string;
  readonly unit: string;
}

export type QuantityErrorCode =
  | "invalid-decimal"
  | "non-normalized-decimal"
  | "unknown-unit"
  | "negative-quantity"
  | "dimension-mismatch"
  | "scale-needs-formula"
  | "count-not-interchangeable";

export class QuantityError extends Error {
  constructor(
    readonly code: QuantityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "QuantityError";
  }
}

export interface QuantityIssue {
  readonly code: QuantityErrorCode;
  readonly message: string;
}

/**
 * Check a quantity against the document rules: a normalized decimal string,
 * a known unit token, and no negative value except for temperatures.
 * Returns every issue found; an empty list means valid.
 */
export function validateQuantity(q: Quantity): QuantityIssue[] {
  const issues: QuantityIssue[] = [];
  let value: Decimal | undefined;
  try {
    value = Decimal.parse(q.value);
    if (!Decimal.isNormalized(q.value)) {
      issues.push({ code: "non-normalized-decimal", message: `value ${JSON.stringify(q.value)} is not normalized; write ${JSON.stringify(value.toString())}` });
    }
  } catch {
    issues.push({ code: "invalid-decimal", message: `value ${JSON.stringify(q.value)} is not a decimal string` });
  }
  const unit = unitDefinition(q.unit);
  if (!unit) {
    issues.push({ code: "unknown-unit", message: `unknown unit token ${JSON.stringify(q.unit)}` });
  } else if (value && value.sign() < 0 && !unit.signed) {
    issues.push({ code: "negative-quantity", message: `negative ${unit.dimension} quantity` });
  }
  return issues;
}

/**
 * Convert a quantity's value to another unit of the same dimension.
 * Exact except for one final division, rounded half-even to
 * `significantDigits`. Throws QuantityError for anything that is not a unit
 * conversion (different dimensions, scales, counts).
 */
export function convert(q: Quantity, toUnit: string, significantDigits = DIVISION_SIGNIFICANT_DIGITS): Decimal {
  const from = unitDefinition(q.unit);
  const to = unitDefinition(toUnit);
  if (!from) throw new QuantityError("unknown-unit", `unknown unit token ${JSON.stringify(q.unit)}`);
  if (!to) throw new QuantityError("unknown-unit", `unknown unit token ${JSON.stringify(toUnit)}`);
  const value = parseValue(q.value);
  if (from.token === to.token) return value;

  if (from.dimension !== to.dimension) {
    throw new QuantityError("dimension-mismatch", `cannot convert ${from.dimension} (${from.token}) to ${to.dimension} (${to.token})`);
  }
  if (from.dimension === "scale") {
    throw new QuantityError("scale-needs-formula", `${from.token} → ${to.token} is a formula, not a unit conversion`);
  }
  if (from.dimension === "count") {
    throw new QuantityError("count-not-interchangeable", `${from.token} and ${to.token} counts are not interchangeable`);
  }
  if (from.dimension === "temperature") {
    const [num, den] = temperatureFraction(value, from.token, to.token);
    return num.div(den, significantDigits);
  }

  const ff = factorOf(from)!;
  const tf = factorOf(to)!;
  // value × (ff.num / ff.den) ÷ (tf.num / tf.den), as one division.
  return value.mul(ff.num).mul(tf.den).div(ff.den.mul(tf.num), significantDigits);
}

function parseValue(text: string): Decimal {
  try {
    return Decimal.parse(text);
  } catch {
    throw new QuantityError("invalid-decimal", `value ${JSON.stringify(text)} is not a decimal string`);
  }
}

// Temperature conversion as an exact fraction num/den, divided once by the
// caller. Via Celsius: C = (F − 32) × 5/9, C = K − 273.15.
const T32 = Decimal.parse("32");
const T273 = Decimal.parse("273.15");
const N5 = Decimal.parse("5");
const N9 = Decimal.parse("9");

function temperatureFraction(v: Decimal, from: string, to: string): [Decimal, Decimal] {
  // Celsius as cNum / cDen.
  let cNum: Decimal;
  let cDen = Decimal.ONE;
  if (from === "F") {
    cNum = v.sub(T32).mul(N5);
    cDen = N9;
  } else if (from === "K") {
    cNum = v.sub(T273);
  } else {
    cNum = v;
  }
  if (to === "F") return [cNum.mul(N9).add(T32.mul(cDen).mul(N5)), cDen.mul(N5)];
  if (to === "K") return [cNum.add(T273.mul(cDen)), cDen];
  return [cNum, cDen];
}
