import { Decimal, DecimalError } from "./decimal.js";

// Deterministic exp, ln, and power on Decimal (invariant 6). JavaScript's
// Math.exp and Math.pow are not required to give the same last bit on every
// engine, so formulas that need them (Morey, Tinseth) use these instead:
// exact integer arithmetic at a working precision with guard digits, then
// one half-even rounding to the requested significant digits.
//
// - exp: argument halved until |x| < 1/8, Taylor series, squared back.
// - ln: x = 2^k · y with y in [0.75, 1.5); ln y = 2·atanh((y−1)/(y+1)) by
//   series; ln 2 = 2·atanh(1/3).
// - pow(x, y) = exp(y · ln x), x > 0.

const GUARD = 20;
const TWO = Decimal.fromInteger(2);
const EIGHTH = Decimal.parse("0.125");
const LOW = Decimal.parse("0.75");
const HIGH = Decimal.parse("1.5");

const sig = (d: Decimal, digits: number) => (d.isZero() ? d : d.div(Decimal.ONE, digits));

export function expDecimal(x: Decimal, significantDigits = 34): Decimal {
  const p = significantDigits + GUARD;
  let r = x;
  let halvings = 0;
  while (r.abs().compare(EIGHTH) > 0) {
    r = r.div(TWO, p);
    halvings++;
  }
  // Taylor: Σ r^n / n!
  let term = Decimal.ONE;
  let sum = Decimal.ONE;
  const eps = Decimal.parse(`0.${"0".repeat(p + 2)}1`);
  for (let n = 1; term.abs().compare(eps) > 0; n++) {
    term = sig(term.mul(r), p).div(Decimal.fromInteger(n), p);
    sum = sum.add(term);
  }
  sum = sig(sum, p);
  for (let i = 0; i < halvings; i++) sum = sig(sum.mul(sum), p);
  return sig(sum, significantDigits);
}

export function lnDecimal(x: Decimal, significantDigits = 34): Decimal {
  if (x.sign() <= 0) throw new DecimalError("invalid-decimal", "ln needs a positive argument");
  const p = significantDigits + GUARD;
  let y = x;
  let k = 0;
  while (y.compare(HIGH) >= 0) {
    y = y.div(TWO, p);
    k++;
  }
  while (y.compare(LOW) < 0) {
    y = sig(y.mul(TWO), p);
    k--;
  }
  const lny = atanh2(y.sub(Decimal.ONE).div(y.add(Decimal.ONE), p), p);
  const result = k === 0 ? lny : lny.add(Decimal.fromInteger(k).mul(ln2(p)));
  return sig(result, significantDigits);
}

/** x^y for x > 0, as exp(y · ln x). */
export function powDecimal(x: Decimal, y: Decimal, significantDigits = 34): Decimal {
  const p = significantDigits + GUARD;
  return expDecimal(sig(y.mul(lnDecimal(x, p)), p), significantDigits);
}

/** 2·atanh(z) = 2·Σ z^(2n+1)/(2n+1), for |z| ≤ 1/5. */
function atanh2(z: Decimal, p: number): Decimal {
  const z2 = sig(z.mul(z), p);
  let power = z;
  let sum = z;
  const eps = Decimal.parse(`0.${"0".repeat(p + 2)}1`);
  for (let n = 3; power.abs().compare(eps) > 0; n += 2) {
    power = sig(power.mul(z2), p);
    sum = sum.add(power.div(Decimal.fromInteger(n), p));
  }
  return sig(sum.mul(TWO), p);
}

const LN2 = new Map<number, Decimal>();
function ln2(p: number): Decimal {
  if (!LN2.has(p)) LN2.set(p, atanh2(Decimal.ONE.div(Decimal.fromInteger(3), p + 5), p + 5));
  return LN2.get(p)!;
}
