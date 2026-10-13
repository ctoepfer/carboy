// Exact decimal arithmetic on BigInt: value = coef × 10^-scale.
// Division is the only inexact operation; it rounds half-even to a fixed
// number of significant digits (spike policy; the real precision policy is a
// Phase 2 deliverable).

export const DIVISION_SIGNIFICANT_DIGITS = 34;

export class Decimal {
  private constructor(readonly coef: bigint, readonly scale: number) {}

  static parse(text: string): Decimal {
    const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
    if (!m) throw new Error(`invalid decimal string: ${JSON.stringify(text)}`);
    const frac = m[3] ?? "";
    const coef = BigInt((m[2] ?? "0") + frac);
    return new Decimal(m[1] ? -coef : coef, frac.length).normalized();
  }

  static fromInt(n: number | bigint): Decimal {
    return new Decimal(BigInt(n), 0);
  }

  private normalized(): Decimal {
    let { coef, scale } = this;
    while (scale > 0 && coef % 10n === 0n) {
      coef /= 10n;
      scale -= 1;
    }
    return new Decimal(coef, scale);
  }

  private static align(a: Decimal, b: Decimal): [bigint, bigint, number] {
    const scale = Math.max(a.scale, b.scale);
    return [a.coef * 10n ** BigInt(scale - a.scale), b.coef * 10n ** BigInt(scale - b.scale), scale];
  }

  add(o: Decimal): Decimal {
    const [x, y, s] = Decimal.align(this, o);
    return new Decimal(x + y, s).normalized();
  }

  sub(o: Decimal): Decimal {
    const [x, y, s] = Decimal.align(this, o);
    return new Decimal(x - y, s).normalized();
  }

  mul(o: Decimal): Decimal {
    return new Decimal(this.coef * o.coef, this.scale + o.scale).normalized();
  }

  div(o: Decimal, significantDigits = DIVISION_SIGNIFICANT_DIGITS): Decimal {
    if (o.coef === 0n) throw new Error("division by zero");
    // Pick a result scale large enough for the requested significant digits,
    // compute one guard digit, then round half-even.
    const magnitude = digits(abs(this.coef)) - this.scale - (digits(abs(o.coef)) - o.scale);
    const scale = Math.max(0, significantDigits - magnitude);
    const num = this.coef * 10n ** BigInt(scale + o.scale + 1);
    const den = o.coef * 10n ** BigInt(this.scale);
    return new Decimal(num / den, scale + 1).roundHalfEven(scale, num % den !== 0n);
  }

  /** Round half-even to `places` decimal places. */
  round(places: number): Decimal {
    return this.roundHalfEven(places, false);
  }

  private roundHalfEven(places: number, inexactTail: boolean): Decimal {
    if (this.scale <= places) return this.normalized();
    const drop = 10n ** BigInt(this.scale - places);
    const sign = this.coef < 0n ? -1n : 1n;
    const a = abs(this.coef);
    let q = a / drop;
    const r = a % drop;
    const half = drop / 2n;
    if (r > half || (r === half && (inexactTail || q % 2n === 1n))) q += 1n;
    return new Decimal(sign * q, places).normalized();
  }

  compare(o: Decimal): number {
    const [x, y] = Decimal.align(this, o);
    return x < y ? -1 : x > y ? 1 : 0;
  }

  /** Normalized decimal string (RECIPE_SCHEMA §3 rule 3). */
  toString(): string {
    const n = this.normalized();
    if (n.coef === 0n) return "0";
    const neg = n.coef < 0n;
    let s = abs(n.coef).toString();
    if (n.scale > 0) {
      s = s.padStart(n.scale + 1, "0");
      s = `${s.slice(0, -n.scale)}.${s.slice(-n.scale)}`;
    }
    return (neg ? "-" : "") + s;
  }
}

function abs(x: bigint): bigint {
  return x < 0n ? -x : x;
}

function digits(x: bigint): number {
  return x === 0n ? 1 : x.toString().length;
}
