import { Decimal } from "./decimal.js";
import { convert, type Quantity } from "./units.js";

// Lumina parity variant of the points method (FORMULA_COVERAGE FQ2):
// OG = 1 + Σ(mass_lb × ppg × efficiency) ÷ volume_gal ÷ 1000.
// Not approved for users (its source is "Needs source"); it exists to prove
// cross-language parity in the Phase 1 spike.
export const FORMULA = { id: "gravity.og.points-lumina-parity", version: "spike-1" } as const;

export interface GravitySource {
  amount: Quantity; // mass
  ppg?: string; // points per pound per US gallon, decimal string
  efficiency?: string; // fraction, decimal string
}

export type OgResult =
  | { status: "computed"; points: Decimal; og: Decimal; formula: typeof FORMULA }
  | { status: "cannot-compute"; missing: string[] };

export function originalGravity(sources: GravitySource[], batchVolume: Quantity | undefined): OgResult {
  const missing: string[] = [];
  if (!batchVolume) missing.push("targets.batch_volume");
  if (sources.length === 0) missing.push("gravity sources");
  sources.forEach((s, i) => {
    if (s.ppg === undefined) missing.push(`sources[${i}].ppg`);
    if (s.efficiency === undefined) missing.push(`sources[${i}].efficiency`);
  });
  // Unknown stays unknown (invariant 7): no zero or default substitution.
  if (missing.length > 0 || !batchVolume) return { status: "cannot-compute", missing };

  let points = Decimal.fromInt(0);
  for (const s of sources) {
    points = points.add(
      convert(s.amount, "lb").mul(Decimal.parse(s.ppg!)).mul(Decimal.parse(s.efficiency!)),
    );
  }
  const gallons = convert(batchVolume, "US gal");
  const og = Decimal.fromInt(1).add(points.div(gallons).div(Decimal.fromInt(1000)));
  return { status: "computed", points, og, formula: FORMULA };
}
