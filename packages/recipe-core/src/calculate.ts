import { isObject } from "./provenance.js";
import { toCalculatedStatistic, type CalculatedStatistic } from "./statistics.js";
import { EXTRACT_MASS, MCU, OG_MASS_METHOD, extractMass, maltColorUnits, originalGravityMassMethod } from "./formulas/beer.js";
import { unavailable, type Beverage, type FormulaDefinition, type FormulaResult } from "./formulas/registry.js";
import type { Quantity } from "./quantity.js";
import type { Decimal } from "./decimal.js";

// From recipe content to the calculated layer (RECIPE_SCHEMA §8–§9).
//
// Reads content, never writes it. The result belongs in `derived`, which is
// outside the content hash. Mapping rules (RECIPE_CORE.md §7):
// - Extract sources are `fermentable` and `sugar` ingredients, added in a
//   hot-side stage (mash, sparge, boil, whirlpool, chilling). Additions in
//   later stages don't change OG or wort colour; they are excluded with a
//   diagnostic.
// - `fruit` or `honey` added on the hot side of a beer makes OG and extract
//   unavailable (no cited formula for their extract here), rather than
//   understating them.
// - Missing properties or targets are reported by JSON Pointer; nothing is
//   defaulted.

const HOT_SIDE = new Set(["mash", "sparge", "boil", "whirlpool", "chilling"]);
const EXTRACT_KINDS = new Set(["fermentable", "sugar"]);
const UNMODELLED_EXTRACT_KINDS = new Set(["fruit", "honey"]);

export interface CalculationDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface CalculatedStatistics {
  readonly statistics: { readonly [name: string]: CalculatedStatistic };
  readonly diagnostics: readonly CalculationDiagnostic[];
}

interface Source {
  readonly ingredientIndex: number;
  readonly ingredient: { [key: string]: unknown };
  readonly mass: Quantity;
}

export function calculateStatistics(content: unknown): CalculatedStatistics {
  const diagnostics: CalculationDiagnostic[] = [];
  const c = isObject(content) ? content : {};
  const beverage = (isObject(c["beverage"]) ? c["beverage"]["type"] : undefined) as Beverage;
  const targets = isObject(c["targets"]) ? c["targets"] : {};
  const volume = quantityAt(targets["batch_volume"]);
  const efficiency = quantityAt(targets["efficiency"]);

  const ingredients = Array.isArray(c["ingredients"]) ? (c["ingredients"] as unknown[]) : [];
  const byId = new Map<string, number>();
  ingredients.forEach((ing, i) => isObject(ing) && typeof ing["id"] === "string" && byId.set(ing["id"], i));
  const stageKind = new Map<string, string>();
  const process = isObject(c["process"]) ? c["process"] : {};
  for (const st of Array.isArray(process["stages"]) ? (process["stages"] as unknown[]) : []) {
    if (isObject(st) && typeof st["id"] === "string" && typeof st["kind"] === "string") stageKind.set(st["id"], st["kind"]);
  }

  const sources: Source[] = [];
  const unmodelled = new Set<number>();
  const additions = Array.isArray(c["additions"]) ? (c["additions"] as unknown[]) : [];
  additions.forEach((ad, a) => {
    if (!isObject(ad)) return;
    const i = byId.get(ad["ingredient"] as string);
    if (i === undefined) return; // reference errors are validateContent's job
    const ing = ingredients[i] as { [key: string]: unknown };
    const kind = ing["kind"] as string;
    if (!EXTRACT_KINDS.has(kind) && !UNMODELLED_EXTRACT_KINDS.has(kind)) return;
    if (!HOT_SIDE.has(stageKind.get(ad["stage"] as string) ?? "")) {
      diagnostics.push({ code: "addition-after-og-point", path: `/additions/${a}`, message: "added after the hot side; not part of OG or wort colour" });
      return;
    }
    if (UNMODELLED_EXTRACT_KINDS.has(kind)) {
      unmodelled.add(i);
      return;
    }
    const mass = quantityAt(ad["amount"]);
    if (mass) sources.push({ ingredientIndex: i, ingredient: ing, mass });
  });

  // Per-ingredient totals keep the formulas' inputs one per ingredient.
  const totals = new Map<number, Quantity[]>();
  for (const s of sources) totals.set(s.ingredientIndex, [...(totals.get(s.ingredientIndex) ?? []), s.mass]);

  const statistics: { [name: string]: CalculatedStatistic } = {};

  // Wort colour (MCU)
  {
    const grains = sources.map((s) => ({ mass: s.mass, color: prop(s.ingredient, "color") }));
    const missing = sources
      .filter((s) => !prop(s.ingredient, "color"))
      .map((s) => `/ingredients/${s.ingredientIndex}/properties/color`);
    if (!volume) missing.push("/targets/batch_volume");
    statistics["mcu"] = toCalculatedStatistic(
      missing.length > 0 ? missingInput(MCU, missing) : maltColorUnits(beverage, grains as { mass: Quantity; color: Quantity }[], volume),
    );
  }

  // Extract mass and OG
  let extractResult: FormulaResult;
  if (unmodelled.size > 0 && beverage === "beer") {
    const paths = [...unmodelled].map((i) => `/ingredients/${i}`);
    extractResult = unavailable(EXTRACT_MASS, "formula-unavailable", paths, "no cited formula for extract from fruit or honey in a beer");
  } else {
    const missing: string[] = [];
    const fermentables = [...totals.entries()].flatMap(([i, masses]) => {
      const ing = ingredients[i] as { [key: string]: unknown };
      for (const p of ["extract_yield", "moisture"]) if (!prop(ing, p)) missing.push(`/ingredients/${i}/properties/${p}`);
      return masses.map((mass) => ({ mass, extract_yield: prop(ing, "extract_yield")!, moisture: prop(ing, "moisture")! }));
    });
    if (!efficiency) missing.push("/targets/efficiency");
    extractResult = missing.length > 0 && beverage === "beer" ? missingInput(EXTRACT_MASS, dedupe(missing)) : extractMass(beverage, fermentables, efficiency);
  }
  statistics["extract"] = toCalculatedStatistic(extractResult);

  const ogResult: FormulaResult & { readonly plato?: Decimal } =
    extractResult.status === "computed"
      ? originalGravityMassMethod(beverage, { value: extractResult.value.toString(), unit: "kg" }, volume)
      : beverage === "beer"
        ? unavailable(OG_MASS_METHOD, extractResult.reason, extractResult.details, `needs extract: ${extractResult.message}`)
        : originalGravityMassMethod(beverage, undefined, undefined);
  statistics["og"] = toCalculatedStatistic(ogResult);
  if (ogResult.status === "computed" && ogResult.plato) {
    statistics["og_plato"] = toCalculatedStatistic({ ...ogResult, value: ogResult.plato, unit: "Plato" });
  }

  return { statistics, diagnostics };
}

function quantityAt(v: unknown): Quantity | undefined {
  return isObject(v) && typeof v["value"] === "string" && typeof v["unit"] === "string" ? { value: v["value"], unit: v["unit"] } : undefined;
}

function prop(ingredient: { [key: string]: unknown }, name: string): Quantity | undefined {
  const props = ingredient["properties"];
  return isObject(props) ? quantityAt(props[name]) : undefined;
}

function missingInput(def: FormulaDefinition, paths: string[]): FormulaResult {
  return unavailable(def, "missing-input", paths, `missing: ${paths.join(", ")}`);
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}
