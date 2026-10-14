import { EXTRACT_MASS, MCU, OG_MASS_METHOD, OG_POINTS_LUMINA } from "./beer.js";
import { SG_PLATO } from "./gravity.js";
import { SO2_FROM_METABISULFITE, YAN_FROM_DAP } from "./additions-chem.js";
import type { Beverage, FormulaDefinition } from "./registry.js";

export * from "./registry.js";
export * from "./beer.js";
export { SG_PLATO, densityAtPlato, platoFromSg, sgAtPlato, sgFromPlato } from "./gravity.js";
export { SO2_FROM_METABISULFITE, YAN_FROM_DAP, so2FromMetabisulfite, yanFromDap } from "./additions-chem.js";

const ALL: readonly FormulaDefinition[] = [MCU, EXTRACT_MASS, OG_MASS_METHOD, OG_POINTS_LUMINA, SG_PLATO, SO2_FROM_METABISULFITE, YAN_FROM_DAP];

/** The registry: every formula Recipe Core knows, keyed by id. */
export const FORMULAS: ReadonlyMap<string, FormulaDefinition> = new Map(ALL.map((f) => [f.id, f]));

export function getFormula(id: string): FormulaDefinition | undefined {
  return FORMULAS.get(id);
}

/** Formulas that apply to a beverage, optionally only those enabled for users. */
export function formulasFor(beverage: Beverage, options: { readonly enabledOnly?: boolean } = {}): FormulaDefinition[] {
  return ALL.filter((f) => f.applicability.beverages.includes(beverage) && (!options.enabledOnly || f.status === "enabled"));
}
