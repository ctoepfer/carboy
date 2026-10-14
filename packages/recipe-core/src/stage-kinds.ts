// Stage-kind table (RECIPE_SCHEMA §7.3; Q5, Q5b decided 2026-10-11).
//
// The one place stage kinds are defined. v0 rows: Lumina's PROCESS_STAGES
// minus the three that became timing points. Parameter rows are added with
// the formulas that read them; non-beer kinds (sake moto, three-stage
// addition) are added with the beverage formulas.

export interface StageKind {
  readonly kind: string;
  /** Named timing points additions in this stage may use (§7.2). */
  readonly points: readonly string[];
}

export const STAGE_KINDS: readonly StageKind[] = [
  { kind: "mash", points: [] },
  { kind: "sparge", points: [] },
  { kind: "boil", points: ["first_wort", "flameout"] },
  { kind: "whirlpool", points: [] },
  { kind: "chilling", points: [] },
  { kind: "fermentation", points: ["dry_hop"] },
  { kind: "conditioning", points: ["dry_hop"] },
  { kind: "stabilization", points: [] },
  { kind: "packaging", points: [] },
];

const BY_KIND: ReadonlyMap<string, StageKind> = new Map(STAGE_KINDS.map((s) => [s.kind, s]));

export function stageKind(kind: string): StageKind | undefined {
  return BY_KIND.get(kind);
}

/** Which timing basis each named point implies (Q5). */
export const POINT_BASIS: Readonly<Record<string, readonly string[]>> = {
  first_wort: ["at_start"],
  flameout: ["at_end"],
  dry_hop: ["after_start", "before_end"],
};
