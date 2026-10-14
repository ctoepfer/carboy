// Ingredient property table (RECIPE_SCHEMA §7.2; Q9 decided 2026-10-11):
// the one place that says which properties each ingredient kind may carry.
// Closed: a row is added only when a formula with a cited source (D-006) or
// an import format needs it. Imported fields without a row go into
// `ingredient.unmapped` verbatim, never calculated from.

export interface PropertyRow {
  readonly name: string;
  readonly kinds: readonly string[];
  /** Allowed unit tokens. A formula may accept fewer (MCU reads degL only). */
  readonly units: readonly string[];
  /** Formulas that read the property. */
  readonly formulas: readonly string[];
  /** Import fields that need the row when no formula reads it yet. */
  readonly imports?: readonly string[];
}

export const INGREDIENT_PROPERTIES: readonly PropertyRow[] = [
  { name: "color", kinds: ["fermentable", "sugar"], units: ["degL", "SRM", "EBC"], formulas: ["color.mcu"] },
  { name: "extract_yield", kinds: ["fermentable", "sugar"], units: ["fraction", "%"], formulas: ["extract.mass"] },
  { name: "moisture", kinds: ["fermentable", "sugar"], units: ["fraction", "%"], formulas: ["extract.mass"] },
  // IBU formulas wait for their sources (FORMULA_COVERAGE); BeerXML 1.0 requires HOP ALPHA (percent).
  { name: "alpha_acid", kinds: ["hop"], units: ["fraction", "%"], formulas: [], imports: ["BeerXML 1.0 HOP/ALPHA"] },
];

export function propertyRow(kind: string, name: string): PropertyRow | undefined {
  return INGREDIENT_PROPERTIES.find((r) => r.name === name && r.kinds.includes(kind));
}
