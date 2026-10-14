// Exact decimal arithmetic on BigInt: value = coef × 10^-scale.
//
// Precision policy (docs/architecture/RECIPE_CORE.md §2):
// - add, sub, mul, neg, and abs are exact.
// - div is the only rounding operation: half-even to
//   DIVISION_SIGNIFICANT_DIGITS significant digits (decimal128 precision).
// - round(places) is for display and for formulas that state a rounding step;
//   stored values are never rounded implicitly.

export const DIVISION_SIGNIFICANT_DIGITS = 34;

const PLAIN = /^(-)?(\d+)(?:\.(\d+))?$/;
const NORMALIZED = /^-?(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/;

export class DecimalError extends Error {
  constructor(
    readonly code: "invalid-decimal" | "division-by-zero" | "invalid-precision",
    message: string,
  ) {
    super(message);
    this.name = "DecimalError";
  }
}

export class Decimal {
  private constructor(
    readonly coef: bigint,
    readonly scale: number,
  ) {}

  static readonly ZERO = new Decimal(0n, 0);
  static readonly ONE = new Decimal(1n, 0);

  /**
   * Parse a plain decimal string (digits, optional fraction, optional leading
   * "-"). No exponent, no "+", no whitespace. Use isNormalized() to check the
   * stricter document form (RECIPE_SCHEMA §3 rule 3).
   */
  static parse(text: string): Decimal {
    const m = PLAIN.exec(text);
    if (!m) throw new DecimalError("invalid-decimal", `invalid decimal string: ${JSON.stringify(text)}`);
    const frac = m[3] ?? "";
    const coef = BigInt((m[2] ?? "0") + frac);
    return new Decimal(m[1] ? -coef : coef, frac.length).normalized();
  }

  /** True when `text` is a decimal string in normalized document form. */
  static isNormalized(text: string): boolean {
    return NORMALIZED.test(text) && text !== "-0";
  }

  static fromInteger(n: number | bigint): Decimal {
    if (typeof n === "number" && !Number.isSafeInteger(n)) {
      throw new DecimalError("invalid-decimal", `not a safe integer: ${n}`);
    }
    return new Decimal(BigInt(n), 0);
  }

  isZero(): boolean {
    return this.coef === 0n;
  }

  sign(): -1 | 0 | 1 {
    return this.coef < 0n ? -1 : this.coef > 0n ? 1 : 0;
  }

  neg(): Decimal {
    return new Decimal(-this.coef, this.scale);
  }

  abs(): Decimal {
    return this.coef < 0n ? this.neg() : this;
  }

  add(o: Decimal): Decimal {
    const [x, y, s] = align(this, o);
    return new Decimal(x + y, s).normalized();
  }

  sub(o: Decimal): Decimal {
    const [x, y, s] = align(this, o);
    return new Decimal(x - y, s).normalized();
  }

  mul(o: Decimal): Decimal {
    return new Decimal(this.coef * o.coef, this.scale + o.scale).normalized();
  }

  /** Quotient rounded half-even to `significantDigits` significant digits. */
  div(o: Decimal, significantDigits = DIVISION_SIGNIFICANT_DIGITS): Decimal {
    if (o.coef === 0n) throw new DecimalError("division-by-zero", "division by zero");
    if (!Number.isInteger(significantDigits) || significantDigits < 1) {
      throw new DecimalError("invalid-precision", `invalid significant digits: ${significantDigits}`);
    }
    if (this.coef === 0n) return Decimal.ZERO;
    // Find the quotient's exact number of integer digits, compute one guard
    // digit beyond the requested precision, then round half-even once, using
    // the guard digit and whether anything was left over.
    const a = absBig(this.coef);
    const b = absBig(o.coef);
    const e = digits(a) - this.scale - (digits(b) - o.scale); // quotient < 10^e
    const k = o.scale - this.scale - (e - 1); // |q| >= 10^(e-1) ⇔ a·10^k >= b
    const atLeast = k >= 0 ? a * 10n ** BigInt(k) >= b : a >= b * 10n ** BigInt(-k);
    const places = significantDigits - (atLeast ? e : e - 1);
    const shift = places + 1 + o.scale - this.scale;
    let num = this.coef;
    let den = o.coef;
    if (shift >= 0) num *= 10n ** BigInt(shift);
    else den *= 10n ** BigInt(-shift);
    const q = new Decimal(num / den, places + 1);
    return q.roundHalfEven(places, num % den !== 0n).roundSignificant(significantDigits);
  }

  /** Round half-even to `places` digits after the point (may be negative). */
  round(places: number): Decimal {
    if (!Number.isInteger(places)) throw new DecimalError("invalid-precision", `invalid places: ${places}`);
    return this.roundHalfEven(places, false);
  }

  compare(o: Decimal): -1 | 0 | 1 {
    const [x, y] = align(this, o);
    return x < y ? -1 : x > y ? 1 : 0;
  }

  equals(o: Decimal): boolean {
    return this.compare(o) === 0;
  }

  /** Normalized decimal string (RECIPE_SCHEMA §3 rule 3). */
  toString(): string {
    const n = this.normalized();
    if (n.coef === 0n) return "0";
    let s = absBig(n.coef).toString();
    if (n.scale > 0) {
      s = s.padStart(n.scale + 1, "0");
      s = `${s.slice(0, -n.scale)}.${s.slice(-n.scale)}`;
    } else if (n.scale < 0) {
      s += "0".repeat(-n.scale);
    }
    return (n.coef < 0n ? "-" : "") + s;
  }

  toJSON(): string {
    return this.toString();
  }

  private normalized(): Decimal {
    let { coef, scale } = this;
    if (coef === 0n) return new Decimal(0n, 0);
    while (scale > 0 && coef % 10n === 0n) {
      coef /= 10n;
      scale -= 1;
    }
    return coef === this.coef && scale === this.scale ? this : new Decimal(coef, scale);
  }

  private roundHalfEven(places: number, inexactTail: boolean): Decimal {
    if (this.scale <= places) return this.normalized();
    const drop = 10n ** BigInt(this.scale - places);
    const negative = this.coef < 0n;
    const a = absBig(this.coef);
    let q = a / drop;
    const r = a % drop;
    const twice = r * 2n;
    if (twice > drop || (twice === drop && (inexactTail || q % 2n === 1n))) q += 1n;
    return new Decimal(negative ? -q : q, places).normalized();
  }

  // Rounding can carry into a new leading digit (9.99… → 10.0…); trim back to
  // the requested significant digits. The carried value ends in zeros, so
  // this never changes the value.
  private roundSignificant(significantDigits: number): Decimal {
    const n = this.normalized();
    const excess = digits(absBig(n.coef)) - significantDigits;
    return excess > 0 ? n.roundHalfEven(n.scale - excess, false) : n;
  }
}

function align(a: Decimal, b: Decimal): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [a.coef * 10n ** BigInt(scale - a.scale), b.coef * 10n ** BigInt(scale - b.scale), scale];
}

function absBig(x: bigint): bigint {
  return x < 0n ? -x : x;
}

function digits(x: bigint): number {
  return x === 0n ? 1 : x.toString().length;
}
