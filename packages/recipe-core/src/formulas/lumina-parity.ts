import { Decimal } from "../decimal.js";
import { expDecimal, powDecimal } from "../math.js";
import { convert, type Quantity } from "../quantity.js";
import { blockers, check, checkFraction, fraction } from "./checks.js";
import { checkBeverage, computed, unavailable, type Beverage, type FormulaDefinition, type FormulaResult } from "./registry.js";

// Lumina's remaining beer statistics (brains/recipes/stats_hooks.py), ported
// as PARITY REFERENCES only (FQ2–FQ4): they reproduce Lumina's constants and
// rounding so Carboy can be compared with Lumina, and return `not-enabled`
// unless the caller opts in. None is a user-facing formula until its source
// is read (FORMULA_COVERAGE: Morey and Tinseth web-only; ABV needs a source;
// FG from a culture's attenuation is open question FQ6).
//
// Transcendental steps use Recipe Core's deterministic exp/pow (math.ts), so
// results are the same on every engine.

const LUMINA = (hook: string) => ({ work: `Lumina stats_hooks ${hook}`, checked: "read" as const });
const N = (s: string) => Decimal.parse(s);
const notEnabled = (def: FormulaDefinition) => unavailable(def, "not-enabled", [], "parity reference; not a user-facing formula");

export const SRM_MOREY: FormulaDefinition = {
  id: "color.srm.morey",
  version: 1,
  title: "Beer colour, Morey (parity reference)",
  status: "parity-reference",
  source: { status: "web-only", citations: [LUMINA("color.srm.morey")] },
  expression: "SRM = 1.4922 × MCU^0.6859",
  assumptions: ["MCU from color.mcu", "Kept to compare with Lumina; enabled only when a primary or reviewed secondary source is read (FORMULA_COVERAGE)"],
  inputs: [{ name: "mcu", description: "Malt colour units", units: ["MCU"] }],
  applicability: { beverages: ["beer"] },
  rounding: "Deterministic decimal power, 34 significant digits; Lumina does not round",
  output: { name: "colour", unit: "SRM" },
};

export function srmMorey(beverage: Beverage, mcu: Decimal | undefined, options: { readonly parity?: boolean } = {}): FormulaResult {
  if (!options.parity) return notEnabled(SRM_MOREY);
  const bad = checkBeverage(SRM_MOREY, beverage);
  if (bad) return bad;
  if (!mcu) return unavailable(SRM_MOREY, "missing-input", ["mcu"], "missing: mcu");
  if (mcu.sign() <= 0) return unavailable(SRM_MOREY, "invalid-input", ["mcu"], "MCU must be greater than zero");
  return computed(SRM_MOREY, N("1.4922").mul(powDecimal(mcu, N("0.6859"))).div(Decimal.ONE));
}

export const FG_LUMINA: FormulaDefinition = {
  id: "fermentation.fg.lumina",
  version: 1,
  title: "Final gravity from attenuation, SG points (Lumina parity)",
  status: "parity-reference",
  source: { status: "needs-source", citations: [LUMINA("fermentation.fg")] },
  expression: "FG = round₃(1 + (OG − 1) × (1 − attenuation))",
  assumptions: [
    "OG as Lumina displays it (3 places)",
    "Attenuation is required: Lumina's default of 0.75 is not reproduced (port note 2)",
    "Holle defines apparent attenuation in °P, not SG points; whether a culture's stated attenuation may predict FG is FQ6",
  ],
  inputs: [
    { name: "og", description: "Original gravity", units: ["SG"] },
    { name: "attenuation", description: "Apparent attenuation", units: ["fraction", "%"] },
  ],
  applicability: { beverages: ["beer"] },
  rounding: "Rounded half-even to 3 places, as Lumina displays it",
  output: { name: "final gravity", unit: "SG" },
};

export function finalGravityLumina(beverage: Beverage, og: Quantity | undefined, attenuation: Quantity | undefined, options: { readonly parity?: boolean } = {}): FormulaResult {
  if (!options.parity) return notEnabled(FG_LUMINA);
  const bad = checkBeverage(FG_LUMINA, beverage);
  if (bad) return bad;
  const missing: string[] = [];
  const invalid: string[] = [];
  if (!og) missing.push("og");
  else if (og.unit !== "SG") invalid.push("og");
  checkFraction(attenuation, "attenuation", missing, invalid);
  const blocked = blockers(FG_LUMINA, missing, invalid);
  if (blocked) return blocked;
  const points = N(og!.value).sub(Decimal.ONE);
  return computed(FG_LUMINA, Decimal.ONE.add(points.mul(Decimal.ONE.sub(fraction(attenuation!)))).round(3));
}

export const ABV_LUMINA: FormulaDefinition = {
  id: "fermentation.abv.lumina",
  version: 1,
  title: "Alcohol by volume, 131.25 factor (Lumina parity)",
  status: "parity-reference",
  source: { status: "needs-source", citations: [LUMINA("fermentation.abv")] },
  expression: "ABV % = round₁((OG − FG) × 131.25)",
  assumptions: ["OG and FG as Lumina displays them (3 places)", "FQ4: 131.25 only as a Lumina parity variant until a cited ABV formula is chosen"],
  inputs: [
    { name: "og", description: "Original gravity", units: ["SG"] },
    { name: "fg", description: "Final gravity", units: ["SG"] },
  ],
  applicability: { beverages: ["beer"] },
  rounding: "Rounded half-even to 1 place, as Lumina displays it",
  output: { name: "alcohol by volume", unit: "%" },
};

export function abvLumina(beverage: Beverage, og: Quantity | undefined, fg: Quantity | undefined, options: { readonly parity?: boolean } = {}): FormulaResult {
  if (!options.parity) return notEnabled(ABV_LUMINA);
  const bad = checkBeverage(ABV_LUMINA, beverage);
  if (bad) return bad;
  const missing = [og ? undefined : "og", fg ? undefined : "fg"].filter((x): x is string => !!x);
  const invalid = [og && og.unit !== "SG" ? "og" : undefined, fg && fg.unit !== "SG" ? "fg" : undefined].filter((x): x is string => !!x);
  const blocked = blockers(ABV_LUMINA, missing, invalid);
  if (blocked) return blocked;
  return computed(ABV_LUMINA, N(og!.value).sub(N(fg!.value)).mul(N("131.25")).round(1));
}

export const IBU_TINSETH_LUMINA: FormulaDefinition = {
  id: "bitterness.ibu.tinseth-lumina",
  version: 1,
  title: "Bitterness, Tinseth with OG (Lumina parity)",
  status: "parity-reference",
  source: { status: "web-only", citations: [LUMINA("hops.ibu.tinseth")] },
  expression: "Σ weight_g × α × 1.65 × 0.000125^(G − 1) × (1 − e^(−0.04 t)) ÷ 4.15 × 1000 ÷ volume_L, rounded to 1 place",
  assumptions: [
    "G is the original gravity as Lumina displays it; published Tinseth uses the average boil gravity (FQ3)",
    "Lumina's constants: 28.3495 g per oz, 3.78541 L per US gal (approximations of the exact factors)",
    "Boil time t in minutes; additions with no boil time contribute nothing",
  ],
  inputs: [
    { name: "hops[].mass", description: "Hop mass", units: ["kg", "g", "lb", "oz"] },
    { name: "hops[].alpha_acid", description: "Alpha acid", units: ["fraction", "%"] },
    { name: "hops[].boil_time", description: "Minutes before the end of the boil", units: ["min"] },
    { name: "og", description: "Original gravity", units: ["SG"] },
    { name: "volume", description: "Batch volume", units: ["L", "US gal"] },
  ],
  applicability: { beverages: ["beer"] },
  rounding: "Deterministic decimal exp and power, 34 significant digits; total rounded half-even to 1 place, as Lumina displays it",
  output: { name: "bitterness", unit: "IBU" },
};

export interface TinsethHop {
  readonly mass: Quantity;
  readonly alpha_acid?: Quantity;
  readonly boil_time?: Quantity;
}

export function ibuTinsethLumina(beverage: Beverage, hops: readonly TinsethHop[], og: Quantity | undefined, volume: Quantity | undefined, options: { readonly parity?: boolean } = {}): FormulaResult & { readonly additions?: readonly Decimal[] } {
  if (!options.parity) return notEnabled(IBU_TINSETH_LUMINA);
  const bad = checkBeverage(IBU_TINSETH_LUMINA, beverage);
  if (bad) return bad;
  const missing: string[] = [];
  const invalid: string[] = [];
  if (hops.length === 0) missing.push("hops");
  hops.forEach((h, i) => {
    check(h.mass, `hops[${i}].mass`, "mass", missing, invalid);
    checkFraction(h.alpha_acid, `hops[${i}].alpha_acid`, missing, invalid);
    if (h.boil_time && h.boil_time.unit !== "min") invalid.push(`hops[${i}].boil_time`);
  });
  if (!og) missing.push("og");
  else if (og.unit !== "SG") invalid.push("og");
  check(volume, "volume", "volume", missing, invalid);
  const blocked = blockers(IBU_TINSETH_LUMINA, missing, invalid);
  if (blocked) return blocked;
  const litres = convert(volume!, "US gal").mul(N("3.78541"));
  if (litres.isZero()) return unavailable(IBU_TINSETH_LUMINA, "invalid-input", ["volume"], "volume must be greater than zero");
  const bigness = N("1.65").mul(powDecimal(N("0.000125"), N(og!.value).sub(Decimal.ONE)));
  const additions = hops.map((h) => {
    const t = h.boil_time ? N(h.boil_time.value) : Decimal.ZERO;
    const boilFactor = Decimal.ONE.sub(expDecimal(N("-0.04").mul(t))).div(N("4.15"));
    const grams = convert(h.mass, "oz").mul(N("28.3495"));
    return grams.mul(fraction(h.alpha_acid!)).mul(bigness).mul(boilFactor).mul(N("1000")).div(litres);
  });
  const total = additions.reduce((a, b) => a.add(b), Decimal.ZERO);
  return { ...computed(IBU_TINSETH_LUMINA, total.round(1)), additions };
}
